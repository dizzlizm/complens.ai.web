"""Tenant router for sharded workflow queues.

Routes workflow messages to sharded standard SQS queues using consistent
hashing based on workspace_id. This replaces the FIFO queue bottleneck
while maintaining fair multi-tenant processing.

Benefits over FIFO:
- Unlimited throughput (no 300 msg/sec per group limit)
- Horizontal scaling via shard count
- Better fault isolation (one shard failure doesn't affect others)
- Consistent routing ensures related messages go to same shard
"""

import hashlib
import json
import os
from dataclasses import dataclass, field
from typing import Any

import boto3
import structlog
from botocore.exceptions import ClientError

logger = structlog.get_logger()

# Default shard configuration
DEFAULT_SHARD_COUNT = 4
MAX_SHARD_COUNT = 16


@dataclass
class QueueMessage:
    """Message to be routed to a sharded queue."""

    workspace_id: str
    message_body: dict[str, Any]
    message_group_id: str | None = None  # For ordering within workspace
    deduplication_id: str | None = None
    delay_seconds: int = 0
    priority: str = "normal"  # normal, high, low
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class RoutingResult:
    """Result of routing a message."""

    shard_index: int
    queue_url: str
    message_id: str | None = None
    success: bool = True
    error: str | None = None


class TenantRouter:
    """Routes workflow messages to sharded queues using consistent hashing.

    The router uses consistent hashing to ensure:
    1. Same workspace always routes to same shard (ordering preserved)
    2. Load is evenly distributed across shards
    3. Adding/removing shards minimizes message redistribution

    Example:
        router = TenantRouter(shard_count=4)
        result = await router.route_message(QueueMessage(
            workspace_id="ws_123",
            message_body={"trigger_type": "form_submitted", ...},
        ))
    """

    def __init__(
        self,
        shard_count: int | None = None,
        shard_queue_urls: dict[int, str] | None = None,
        priority_queue_url: str | None = None,
    ):
        """Initialize the tenant router.

        Args:
            shard_count: Number of shards. Defaults to SHARD_COUNT env var or 4.
            shard_queue_urls: Dict mapping shard index to queue URL.
                Defaults to loading from SHARD_QUEUE_URL_N env vars.
            priority_queue_url: URL for priority queue. Defaults to PRIORITY_QUEUE_URL.
        """
        self.shard_count = min(
            shard_count or int(os.environ.get("SHARD_COUNT", DEFAULT_SHARD_COUNT)),
            MAX_SHARD_COUNT,
        )

        # Load shard queue URLs from environment or use provided dict
        self.shard_queue_urls = shard_queue_urls or self._load_shard_urls()

        self.priority_queue_url = priority_queue_url or os.environ.get(
            "PRIORITY_QUEUE_URL", ""
        )
        self._sqs_client = None
        self.logger = logger.bind(
            service="tenant_router",
            shard_count=self.shard_count,
        )

    def _load_shard_urls(self) -> dict[int, str]:
        """Load shard queue URLs from environment variables.

        Looks for SHARD_QUEUE_URL_0, SHARD_QUEUE_URL_1, etc.

        Returns:
            Dict mapping shard index to queue URL.
        """
        urls = {}
        for i in range(self.shard_count):
            url = os.environ.get(f"SHARD_QUEUE_URL_{i}", "")
            if url:
                urls[i] = url
        return urls

    @property
    def sqs_client(self):
        """Get SQS client (lazy initialization)."""
        if self._sqs_client is None:
            self._sqs_client = boto3.client("sqs")
        return self._sqs_client

    def get_shard_for_workspace(self, workspace_id: str) -> int:
        """Get the shard index for a workspace using consistent hashing.

        Uses MD5 hash for even distribution across shards.

        Args:
            workspace_id: Workspace identifier.

        Returns:
            Shard index (0 to shard_count - 1).
        """
        # Use MD5 for consistent, well-distributed hashing
        hash_bytes = hashlib.md5(workspace_id.encode()).digest()
        # Use first 8 bytes as integer
        hash_int = int.from_bytes(hash_bytes[:8], byteorder="big")
        return hash_int % self.shard_count

    def get_queue_url_for_shard(self, shard_index: int) -> str:
        """Get the queue URL for a shard index.

        Args:
            shard_index: Shard index.

        Returns:
            SQS queue URL.

        Raises:
            ValueError: If shard URL is not configured.
        """
        if shard_index not in self.shard_queue_urls:
            raise ValueError(
                f"SHARD_QUEUE_URL_{shard_index} not configured. "
                f"Available shards: {list(self.shard_queue_urls.keys())}"
            )
        return self.shard_queue_urls[shard_index]

    def get_queue_url_for_workspace(self, workspace_id: str) -> str:
        """Get the queue URL for a workspace.

        Args:
            workspace_id: Workspace identifier.

        Returns:
            SQS queue URL.
        """
        shard_index = self.get_shard_for_workspace(workspace_id)
        return self.get_queue_url_for_shard(shard_index)

    def route_message(self, message: QueueMessage) -> RoutingResult:
        """Route a message to the appropriate shard.

        Args:
            message: Message to route.

        Returns:
            RoutingResult with shard info and send status.
        """
        # High priority messages go to dedicated priority queue
        if message.priority == "high" and self.priority_queue_url:
            return self._send_to_queue(
                queue_url=self.priority_queue_url,
                message=message,
                shard_index=-1,  # Indicates priority queue
            )

        # Route to shard based on workspace
        shard_index = self.get_shard_for_workspace(message.workspace_id)
        queue_url = self.get_queue_url_for_shard(shard_index)

        return self._send_to_queue(
            queue_url=queue_url,
            message=message,
            shard_index=shard_index,
        )

    def route_batch(
        self,
        messages: list[QueueMessage],
    ) -> list[RoutingResult]:
        """Route multiple messages, batching by shard for efficiency.

        Args:
            messages: List of messages to route.

        Returns:
            List of routing results.
        """
        # Group messages by shard
        shard_batches: dict[int, list[QueueMessage]] = {}
        priority_batch: list[QueueMessage] = []

        for message in messages:
            if message.priority == "high" and self.priority_queue_url:
                priority_batch.append(message)
            else:
                shard_index = self.get_shard_for_workspace(message.workspace_id)
                if shard_index not in shard_batches:
                    shard_batches[shard_index] = []
                shard_batches[shard_index].append(message)

        results = []

        # Send priority messages
        if priority_batch:
            results.extend(
                self._send_batch_to_queue(
                    queue_url=self.priority_queue_url,
                    messages=priority_batch,
                    shard_index=-1,
                )
            )

        # Send to each shard
        for shard_index, batch in shard_batches.items():
            queue_url = self.get_queue_url_for_shard(shard_index)
            results.extend(
                self._send_batch_to_queue(
                    queue_url=queue_url,
                    messages=batch,
                    shard_index=shard_index,
                )
            )

        return results

    def _send_to_queue(
        self,
        queue_url: str,
        message: QueueMessage,
        shard_index: int,
    ) -> RoutingResult:
        """Send a single message to a queue.

        Args:
            queue_url: SQS queue URL.
            message: Message to send.
            shard_index: Shard index for logging.

        Returns:
            RoutingResult.
        """
        try:
            # Build message attributes
            message_attrs = {
                "workspace_id": {
                    "DataType": "String",
                    "StringValue": message.workspace_id,
                },
                "priority": {
                    "DataType": "String",
                    "StringValue": message.priority,
                },
            }

            # Add metadata as attributes
            for key, value in message.metadata.items():
                if isinstance(value, str):
                    message_attrs[key] = {
                        "DataType": "String",
                        "StringValue": value,
                    }

            kwargs: dict[str, Any] = {
                "QueueUrl": queue_url,
                "MessageBody": json.dumps(message.message_body),
                "MessageAttributes": message_attrs,
            }

            if message.delay_seconds > 0:
                kwargs["DelaySeconds"] = min(message.delay_seconds, 900)  # Max 15 min

            response = self.sqs_client.send_message(**kwargs)

            self.logger.debug(
                "Message routed",
                shard_index=shard_index,
                workspace_id=message.workspace_id,
                message_id=response["MessageId"],
            )

            return RoutingResult(
                shard_index=shard_index,
                queue_url=queue_url,
                message_id=response["MessageId"],
                success=True,
            )

        except ClientError as e:
            self.logger.error(
                "Failed to route message",
                shard_index=shard_index,
                workspace_id=message.workspace_id,
                error=str(e),
            )
            return RoutingResult(
                shard_index=shard_index,
                queue_url=queue_url,
                success=False,
                error=str(e),
            )

    def _send_batch_to_queue(
        self,
        queue_url: str,
        messages: list[QueueMessage],
        shard_index: int,
    ) -> list[RoutingResult]:
        """Send a batch of messages to a queue.

        Args:
            queue_url: SQS queue URL.
            messages: Messages to send.
            shard_index: Shard index for logging.

        Returns:
            List of RoutingResults.
        """
        results = []

        # SQS batch limit is 10 messages
        for i in range(0, len(messages), 10):
            batch = messages[i : i + 10]
            entries = []

            for j, message in enumerate(batch):
                entry: dict[str, Any] = {
                    "Id": str(j),
                    "MessageBody": json.dumps(message.message_body),
                    "MessageAttributes": {
                        "workspace_id": {
                            "DataType": "String",
                            "StringValue": message.workspace_id,
                        },
                        "priority": {
                            "DataType": "String",
                            "StringValue": message.priority,
                        },
                    },
                }

                if message.delay_seconds > 0:
                    entry["DelaySeconds"] = min(message.delay_seconds, 900)

                entries.append(entry)

            try:
                response = self.sqs_client.send_message_batch(
                    QueueUrl=queue_url,
                    Entries=entries,
                )

                # Process successful messages
                for success in response.get("Successful", []):
                    idx = int(success["Id"])
                    results.append(RoutingResult(
                        shard_index=shard_index,
                        queue_url=queue_url,
                        message_id=success["MessageId"],
                        success=True,
                    ))

                # Process failed messages
                for failure in response.get("Failed", []):
                    idx = int(failure["Id"])
                    results.append(RoutingResult(
                        shard_index=shard_index,
                        queue_url=queue_url,
                        success=False,
                        error=failure.get("Message", "Unknown error"),
                    ))

            except ClientError as e:
                # All messages in batch failed
                for message in batch:
                    results.append(RoutingResult(
                        shard_index=shard_index,
                        queue_url=queue_url,
                        success=False,
                        error=str(e),
                    ))

        return results

    def get_shard_statistics(self) -> dict[str, Any]:
        """Get statistics about shard distribution.

        Returns:
            Dict with shard statistics.
        """
        stats = {
            "shard_count": self.shard_count,
            "configured_shards": list(self.shard_queue_urls.keys()),
            "priority_queue_url": self.priority_queue_url,
            "shards": {},
        }

        for i in range(self.shard_count):
            if i not in self.shard_queue_urls:
                stats["shards"][i] = {
                    "queue_url": None,
                    "error": f"SHARD_QUEUE_URL_{i} not configured",
                }
                continue

            try:
                queue_url = self.shard_queue_urls[i]
                response = self.sqs_client.get_queue_attributes(
                    QueueUrl=queue_url,
                    AttributeNames=[
                        "ApproximateNumberOfMessages",
                        "ApproximateNumberOfMessagesNotVisible",
                    ],
                )
                attrs = response.get("Attributes", {})
                stats["shards"][i] = {
                    "queue_url": queue_url,
                    "messages_available": int(attrs.get("ApproximateNumberOfMessages", 0)),
                    "messages_in_flight": int(attrs.get("ApproximateNumberOfMessagesNotVisible", 0)),
                }
            except Exception as e:
                stats["shards"][i] = {
                    "queue_url": self.shard_queue_urls.get(i),
                    "error": str(e),
                }

        return stats


def get_tenant_router() -> TenantRouter:
    """Get a configured TenantRouter instance.

    Returns:
        TenantRouter instance.
    """
    return TenantRouter()
