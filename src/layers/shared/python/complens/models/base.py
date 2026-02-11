"""Base Pydantic models with DynamoDB serialization."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, ClassVar, Self

from pydantic import BaseModel as PydanticBaseModel, ConfigDict, Field
from ulid import ULID


def generate_ulid() -> str:
    """Generate a new ULID string."""
    return str(ULID())


def utc_now() -> datetime:
    """Get current UTC datetime."""
    return datetime.now(timezone.utc)


class TimestampMixin(PydanticBaseModel):
    """Mixin for created_at and updated_at timestamps."""

    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class BaseModel(TimestampMixin):
    """Base model with ID generation and DynamoDB serialization.

    All entity models should inherit from this class.
    """

    model_config = ConfigDict(
        populate_by_name=True,
        use_enum_values=True,
        validate_assignment=True,
        json_encoders={datetime: lambda v: v.isoformat()},
    )

    id: str = Field(default_factory=generate_ulid)
    version: int = Field(default=1, description="Optimistic locking version")

    # Class-level attributes for DynamoDB key generation
    _pk_prefix: ClassVar[str] = ""
    _sk_prefix: ClassVar[str] = ""

    def to_dynamodb(self) -> dict[str, Any]:
        """Serialize model to DynamoDB item format.

        Converts datetime objects to ISO strings and handles nested models.
        Uses by_alias=True to ensure field aliases are used (e.g., 'type' instead of 'node_type').
        """
        data = self.model_dump(mode="json", by_alias=True)
        return self._serialize_value(data)

    @classmethod
    def _serialize_value(cls, value: Any) -> Any:
        """Recursively serialize values for DynamoDB.

        Converts floats to Decimal (DynamoDB requirement) and datetimes to ISO strings.
        """
        if isinstance(value, dict):
            return {k: cls._serialize_value(v) for k, v in value.items() if v is not None}
        if isinstance(value, list):
            return [cls._serialize_value(item) for item in value]
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, float):
            # DynamoDB requires Decimal instead of float
            return Decimal(str(value))
        return value

    @classmethod
    def from_dynamodb(cls, item: dict[str, Any]) -> Self:
        """Deserialize DynamoDB item to model instance.

        Converts ISO strings back to datetime objects.
        """
        data = cls._deserialize_value(item)
        return cls.model_validate(data)

    @classmethod
    def _deserialize_value(cls, value: Any) -> Any:
        """Recursively deserialize values from DynamoDB.

        Converts Decimals back to floats and ISO strings to datetimes.
        """
        if isinstance(value, dict):
            return {k: cls._deserialize_value(v) for k, v in value.items()}
        if isinstance(value, list):
            return [cls._deserialize_value(item) for item in value]
        if isinstance(value, Decimal):
            # Convert Decimal back to int or float
            if value % 1 == 0:
                return int(value)
            return float(value)
        if isinstance(value, str):
            # Try to parse as datetime
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                return value
        return value

    def get_pk(self) -> str:
        """Get the partition key for this entity."""
        raise NotImplementedError("Subclasses must implement get_pk()")

    def get_sk(self) -> str:
        """Get the sort key for this entity."""
        raise NotImplementedError("Subclasses must implement get_sk()")

    def get_keys(self) -> dict[str, str]:
        """Get both PK and SK as a dictionary."""
        return {"PK": self.get_pk(), "SK": self.get_sk()}

    def update_timestamp(self) -> None:
        """Update the updated_at timestamp to now."""
        self.updated_at = utc_now()

    def increment_version(self) -> None:
        """Increment the version for optimistic locking."""
        self.version += 1
