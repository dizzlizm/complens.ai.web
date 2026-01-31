"""Base repository class for DynamoDB operations."""

import os
from typing import Any, Generic, TypeVar

import boto3
import structlog
from botocore.exceptions import ClientError
from pydantic import BaseModel as PydanticBaseModel

from complens.models.base import BaseModel
from complens.utils.exceptions import ConflictError, NotFoundError

logger = structlog.get_logger()

T = TypeVar("T", bound=BaseModel)


class BaseRepository(Generic[T]):
    """Base repository for DynamoDB single-table design.

    Provides common CRUD operations with optimistic locking support.
    """

    def __init__(
        self,
        model_class: type[T],
        table_name: str | None = None,
    ):
        """Initialize repository.

        Args:
            model_class: The Pydantic model class for this repository.
            table_name: DynamoDB table name. Defaults to TABLE_NAME env var.
        """
        self.model_class = model_class
        self.table_name = table_name or os.environ.get("TABLE_NAME", "complens-dev")
        self._dynamodb = None
        self._table = None

    @property
    def dynamodb(self):
        """Get DynamoDB resource (lazy initialization)."""
        if self._dynamodb is None:
            self._dynamodb = boto3.resource("dynamodb")
        return self._dynamodb

    @property
    def table(self):
        """Get DynamoDB table (lazy initialization)."""
        if self._table is None:
            self._table = self.dynamodb.Table(self.table_name)
        return self._table

    def _build_key(self, pk: str, sk: str) -> dict[str, str]:
        """Build key dictionary for DynamoDB operations."""
        return {"PK": pk, "SK": sk}

    def get(self, pk: str, sk: str) -> T | None:
        """Get an item by its primary key.

        Args:
            pk: Partition key value.
            sk: Sort key value.

        Returns:
            Model instance or None if not found.
        """
        try:
            response = self.table.get_item(Key=self._build_key(pk, sk))
            item = response.get("Item")

            if not item:
                return None

            return self.model_class.from_dynamodb(item)

        except ClientError as e:
            logger.error("DynamoDB get_item failed", error=str(e), pk=pk, sk=sk)
            raise

    def get_or_raise(self, pk: str, sk: str, resource_type: str) -> T:
        """Get an item or raise NotFoundError.

        Args:
            pk: Partition key value.
            sk: Sort key value.
            resource_type: Resource type name for error message.

        Returns:
            Model instance.

        Raises:
            NotFoundError: If item not found.
        """
        item = self.get(pk, sk)
        if not item:
            # Extract ID from SK (assumes format PREFIX#id)
            resource_id = sk.split("#", 1)[-1] if "#" in sk else sk
            raise NotFoundError(resource_type, resource_id)
        return item

    def put(
        self,
        item: T,
        condition_expression: str | None = None,
        gsi_keys: dict[str, str] | None = None,
    ) -> T:
        """Put an item into DynamoDB.

        Args:
            item: Model instance to save.
            condition_expression: Optional condition expression.
            gsi_keys: Optional GSI key values to add.

        Returns:
            The saved model instance.
        """
        try:
            # Update timestamp and version
            item.update_timestamp()

            # Build item dict
            db_item = item.to_dynamodb()
            db_item.update(item.get_keys())

            # Add GSI keys if provided
            if gsi_keys:
                db_item.update(gsi_keys)

            # Build put_item kwargs
            kwargs: dict[str, Any] = {"Item": db_item}
            if condition_expression:
                kwargs["ConditionExpression"] = condition_expression

            self.table.put_item(**kwargs)

            logger.debug(
                "Item saved",
                pk=db_item["PK"],
                sk=db_item["SK"],
                model=self.model_class.__name__,
            )

            return item

        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise ConflictError("Item already exists or version mismatch")
            logger.error("DynamoDB put_item failed", error=str(e))
            raise

    def create(self, item: T, gsi_keys: dict[str, str] | None = None) -> T:
        """Create a new item (fails if exists).

        Args:
            item: Model instance to create.
            gsi_keys: Optional GSI key values.

        Returns:
            The created model instance.

        Raises:
            ConflictError: If item already exists.
        """
        return self.put(
            item,
            condition_expression="attribute_not_exists(PK)",
            gsi_keys=gsi_keys,
        )

    def update(
        self,
        item: T,
        gsi_keys: dict[str, str] | None = None,
        check_version: bool = True,
    ) -> T:
        """Update an existing item with optimistic locking.

        Args:
            item: Model instance to update.
            gsi_keys: Optional GSI key values.
            check_version: Whether to check version for optimistic locking.

        Returns:
            The updated model instance.

        Raises:
            ConflictError: If version mismatch (concurrent modification).
        """
        old_version = item.version
        item.increment_version()

        condition = None
        if check_version:
            condition = f"version = :old_version"

        try:
            # Build item dict
            db_item = item.to_dynamodb()
            db_item.update(item.get_keys())

            if gsi_keys:
                db_item.update(gsi_keys)

            kwargs: dict[str, Any] = {"Item": db_item}
            if condition:
                kwargs["ConditionExpression"] = condition
                kwargs["ExpressionAttributeValues"] = {":old_version": old_version}

            self.table.put_item(**kwargs)

            logger.debug(
                "Item updated",
                pk=db_item["PK"],
                sk=db_item["SK"],
                version=item.version,
            )

            return item

        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise ConflictError("Item was modified by another process")
            logger.error("DynamoDB update failed", error=str(e))
            raise

    def delete(self, pk: str, sk: str) -> bool:
        """Delete an item.

        Args:
            pk: Partition key value.
            sk: Sort key value.

        Returns:
            True if deleted, False if not found.
        """
        try:
            self.table.delete_item(
                Key=self._build_key(pk, sk),
                ConditionExpression="attribute_exists(PK)",
            )
            logger.debug("Item deleted", pk=pk, sk=sk)
            return True

        except ClientError as e:
            if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
                return False
            logger.error("DynamoDB delete_item failed", error=str(e))
            raise

    def query(
        self,
        pk: str,
        sk_prefix: str | None = None,
        sk_begins_with: str | None = None,
        index_name: str | None = None,
        limit: int | None = None,
        scan_forward: bool = True,
        filter_expression: str | None = None,
        expression_values: dict | None = None,
        last_key: dict | None = None,
    ) -> tuple[list[T], dict | None]:
        """Query items by partition key.

        Args:
            pk: Partition key value.
            sk_prefix: Sort key prefix for begins_with condition.
            sk_begins_with: Alias for sk_prefix.
            index_name: Optional GSI name.
            limit: Maximum items to return.
            scan_forward: Sort direction (True = ascending).
            filter_expression: Optional filter expression.
            expression_values: Expression attribute values.
            last_key: Last evaluated key for pagination.

        Returns:
            Tuple of (items, last_evaluated_key).
        """
        try:
            # Build key condition
            sk_condition = sk_prefix or sk_begins_with
            if sk_condition:
                key_condition = "PK = :pk AND begins_with(SK, :sk_prefix)"
                expr_values = {":pk": pk, ":sk_prefix": sk_condition}
            else:
                key_condition = "PK = :pk"
                expr_values = {":pk": pk}

            # Use GSI key names if querying index
            if index_name:
                if index_name == "GSI1":
                    key_condition = key_condition.replace("PK", "GSI1PK").replace("SK", "GSI1SK")
                    expr_values = {
                        k.replace(":pk", ":gsi1pk").replace(":sk_prefix", ":gsi1sk_prefix"): v
                        for k, v in expr_values.items()
                    }
                    key_condition = key_condition.replace(":pk", ":gsi1pk").replace(
                        ":sk_prefix", ":gsi1sk_prefix"
                    )
                elif index_name == "GSI2":
                    key_condition = key_condition.replace("PK", "GSI2PK").replace("SK", "GSI2SK")
                    expr_values = {
                        k.replace(":pk", ":gsi2pk").replace(":sk_prefix", ":gsi2sk_prefix"): v
                        for k, v in expr_values.items()
                    }
                    key_condition = key_condition.replace(":pk", ":gsi2pk").replace(
                        ":sk_prefix", ":gsi2sk_prefix"
                    )

            # Merge with additional expression values
            if expression_values:
                expr_values.update(expression_values)

            # Build query kwargs
            kwargs: dict[str, Any] = {
                "KeyConditionExpression": key_condition,
                "ExpressionAttributeValues": expr_values,
                "ScanIndexForward": scan_forward,
            }

            if index_name:
                kwargs["IndexName"] = index_name
            if limit:
                kwargs["Limit"] = limit
            if filter_expression:
                kwargs["FilterExpression"] = filter_expression
            if last_key:
                kwargs["ExclusiveStartKey"] = last_key

            response = self.table.query(**kwargs)

            items = [self.model_class.from_dynamodb(item) for item in response.get("Items", [])]
            last_evaluated_key = response.get("LastEvaluatedKey")

            return items, last_evaluated_key

        except ClientError as e:
            logger.error("DynamoDB query failed", error=str(e), pk=pk)
            raise

    def batch_get(self, keys: list[tuple[str, str]]) -> list[T]:
        """Batch get multiple items.

        Args:
            keys: List of (pk, sk) tuples.

        Returns:
            List of model instances.
        """
        if not keys:
            return []

        try:
            # DynamoDB batch_get_item has a limit of 100 items
            all_items = []

            for i in range(0, len(keys), 100):
                batch_keys = keys[i : i + 100]
                request_keys = [self._build_key(pk, sk) for pk, sk in batch_keys]

                response = self.dynamodb.batch_get_item(
                    RequestItems={self.table_name: {"Keys": request_keys}}
                )

                items = response.get("Responses", {}).get(self.table_name, [])
                all_items.extend([self.model_class.from_dynamodb(item) for item in items])

            return all_items

        except ClientError as e:
            logger.error("DynamoDB batch_get_item failed", error=str(e))
            raise

    def batch_write(self, items: list[T]) -> None:
        """Batch write multiple items.

        Args:
            items: List of model instances to save.
        """
        if not items:
            return

        try:
            with self.table.batch_writer() as batch:
                for item in items:
                    item.update_timestamp()
                    db_item = item.to_dynamodb()
                    db_item.update(item.get_keys())

                    # Try to get GSI keys
                    if hasattr(item, "get_gsi1_keys"):
                        gsi_keys = item.get_gsi1_keys()
                        if gsi_keys:
                            db_item.update(gsi_keys)

                    batch.put_item(Item=db_item)

            logger.debug("Batch write completed", count=len(items))

        except ClientError as e:
            logger.error("DynamoDB batch_write failed", error=str(e))
            raise
