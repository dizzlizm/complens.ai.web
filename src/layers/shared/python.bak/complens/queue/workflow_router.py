"""Unified workflow message router.

Routes workflow trigger messages to either the legacy FIFO queue or
the new sharded queue architecture based on feature flags.

This provides a single interface for sending workflow triggers that
automatically handles the routing decision and message formatting.
"""

import json
import os
from dataclasses import dataclass
from typing import Any

import boto3
import structlog

from complens.queue.feature_flags import FeatureFlag, is_flag_enabled
from complens.queue.tenant_router import QueueMessage, TenantRouter, get_tenant_router

logger = structlog.get_logger()


@dataclass
class WorkflowTriggerMessage:
    """Message representing a workflow trigger event."""

    workspace_id: str
    trigger_type: str
    trigger_data: dict[str, Any]
    contact_id: str | None = None
    priority: str = "normal"
    delay_seconds: int = 0


@dataclass
class RoutingResult:
    """Result of routing a workflow trigger message."""

    success: bool
    method: str  # "fifo", "sharded", "eventbridge"
    message_id: str | None = None
    error: str | None = None


class WorkflowRouter:
    """Routes workflow triggers to the appropriate queue.

    Automatically selects between:
    1. Legacy FIFO queue (current default)
    2. Sharded standard queues (new architecture)
    3. EventBridge (for complex routing rules)

    Example:
        router = WorkflowRouter()
        result = router.route_trigger(WorkflowTriggerMessage(
            workspace_id="ws_123",
            trigger_type="trigger_form_submitted",
            trigger_data={...},
            contact_id="contact_456",
        ))
    """

    def __init__(
        self,
        fifo_queue_url: str | None = None,
        event_bus_name: str | None = None,
    ):
        """Initialize the workflow router.

        Args:
            fifo_queue_url: URL for legacy FIFO queue.
            event_bus_name: EventBridge event bus name.
        """
        self.fifo_queue_url = fifo_queue_url or os.environ.get("WORKFLOW_QUEUE_URL")
        self.event_bus_name = event_bus_name or os.environ.get("EVENT_BUS_NAME")
        self._sqs_client = None
        self._eventbridge_client = None
        self._tenant_router: TenantRouter | None = None

        self.logger = logger.bind(service="workflow_router")

    @property
    def sqs_client(self):
        """Get SQS client (lazy initialization)."""
        if self._sqs_client is None:
            self._sqs_client = boto3.client("sqs")
        return self._sqs_client

    @property
    def eventbridge_client(self):
        """Get EventBridge client (lazy initialization)."""
        if self._eventbridge_client is None:
            self._eventbridge_client = boto3.client("events")
        return self._eventbridge_client

    @property
    def tenant_router(self) -> TenantRouter:
        """Get tenant router (lazy initialization)."""
        if self._tenant_router is None:
            self._tenant_router = get_tenant_router()
        return self._tenant_router

    def route_trigger(self, message: WorkflowTriggerMessage) -> RoutingResult:
        """Route a workflow trigger message.

        Automatically selects the routing method based on feature flags.

        Args:
            message: Workflow trigger message.

        Returns:
            RoutingResult with routing status.
        """
        # Check if sharded queues are enabled for this workspace
        if is_flag_enabled(FeatureFlag.USE_SHARDED_QUEUES, message.workspace_id):
            return self._route_to_sharded_queue(message)

        # Fall back to FIFO queue
        return self._route_to_fifo_queue(message)

    def route_triggers_batch(
        self,
        messages: list[WorkflowTriggerMessage],
    ) -> list[RoutingResult]:
        """Route multiple workflow triggers, batching for efficiency.

        Args:
            messages: List of workflow trigger messages.

        Returns:
            List of routing results.
        """
        # Group messages by routing method
        sharded_messages: list[WorkflowTriggerMessage] = []
        fifo_messages: list[WorkflowTriggerMessage] = []

        for msg in messages:
            if is_flag_enabled(FeatureFlag.USE_SHARDED_QUEUES, msg.workspace_id):
                sharded_messages.append(msg)
            else:
                fifo_messages.append(msg)

        results = []

        # Route sharded messages in batch
        if sharded_messages:
            queue_messages = [self._to_queue_message(m) for m in sharded_messages]
            batch_results = self.tenant_router.route_batch(queue_messages)
            for result in batch_results:
                results.append(RoutingResult(
                    success=result.success,
                    method="sharded",
                    message_id=result.message_id,
                    error=result.error,
                ))

        # Route FIFO messages (one at a time due to FIFO constraints)
        for msg in fifo_messages:
            result = self._route_to_fifo_queue(msg)
            results.append(result)

        return results

    def _route_to_sharded_queue(self, message: WorkflowTriggerMessage) -> RoutingResult:
        """Route message to sharded queue.

        Args:
            message: Workflow trigger message.

        Returns:
            RoutingResult.
        """
        queue_message = self._to_queue_message(message)
        result = self.tenant_router.route_message(queue_message)

        self.logger.info(
            "Routed to sharded queue",
            workspace_id=message.workspace_id,
            trigger_type=message.trigger_type,
            shard_index=result.shard_index,
            success=result.success,
        )

        return RoutingResult(
            success=result.success,
            method="sharded",
            message_id=result.message_id,
            error=result.error,
        )

    def _route_to_fifo_queue(self, message: WorkflowTriggerMessage) -> RoutingResult:
        """Route message to FIFO queue.

        Args:
            message: Workflow trigger message.

        Returns:
            RoutingResult.
        """
        if not self.fifo_queue_url:
            self.logger.warning("FIFO queue URL not configured")
            return RoutingResult(
                success=False,
                method="fifo",
                error="WORKFLOW_QUEUE_URL not configured",
            )

        try:
            # Build message body
            message_body = {
                "workspace_id": message.workspace_id,
                "contact_id": message.contact_id,
                "trigger_type": message.trigger_type,
                **message.trigger_data,
            }

            # FIFO queue requires MessageGroupId and MessageDeduplicationId
            # Use workspace_id for group to ensure fair multi-tenant processing
            response = self.sqs_client.send_message(
                QueueUrl=self.fifo_queue_url,
                MessageBody=json.dumps(message_body),
                MessageGroupId=message.workspace_id,
                MessageDeduplicationId=self._generate_dedup_id(message),
                DelaySeconds=min(message.delay_seconds, 900) if message.delay_seconds > 0 else 0,
            )

            self.logger.info(
                "Routed to FIFO queue",
                workspace_id=message.workspace_id,
                trigger_type=message.trigger_type,
                message_id=response["MessageId"],
            )

            return RoutingResult(
                success=True,
                method="fifo",
                message_id=response["MessageId"],
            )

        except Exception as e:
            self.logger.error(
                "Failed to route to FIFO queue",
                workspace_id=message.workspace_id,
                error=str(e),
            )
            return RoutingResult(
                success=False,
                method="fifo",
                error=str(e),
            )

    def route_to_eventbridge(
        self,
        message: WorkflowTriggerMessage,
        source: str,
        detail_type: str,
    ) -> RoutingResult:
        """Route message to EventBridge.

        Use this when you need EventBridge rules for complex routing.

        Args:
            message: Workflow trigger message.
            source: EventBridge event source.
            detail_type: EventBridge detail type.

        Returns:
            RoutingResult.
        """
        if not self.event_bus_name:
            return RoutingResult(
                success=False,
                method="eventbridge",
                error="EVENT_BUS_NAME not configured",
            )

        try:
            event_detail = {
                "workspace_id": message.workspace_id,
                "contact_id": message.contact_id,
                "trigger_type": message.trigger_type,
                **message.trigger_data,
            }

            response = self.eventbridge_client.put_events(
                Entries=[{
                    "Source": source,
                    "DetailType": detail_type,
                    "Detail": json.dumps(event_detail),
                    "EventBusName": self.event_bus_name,
                }]
            )

            failed_count = response.get("FailedEntryCount", 0)
            if failed_count > 0:
                error = response.get("Entries", [{}])[0].get("ErrorMessage", "Unknown error")
                return RoutingResult(
                    success=False,
                    method="eventbridge",
                    error=error,
                )

            self.logger.info(
                "Routed to EventBridge",
                workspace_id=message.workspace_id,
                source=source,
                detail_type=detail_type,
            )

            return RoutingResult(
                success=True,
                method="eventbridge",
            )

        except Exception as e:
            self.logger.error(
                "Failed to route to EventBridge",
                workspace_id=message.workspace_id,
                error=str(e),
            )
            return RoutingResult(
                success=False,
                method="eventbridge",
                error=str(e),
            )

    def _to_queue_message(self, message: WorkflowTriggerMessage) -> QueueMessage:
        """Convert WorkflowTriggerMessage to QueueMessage.

        Args:
            message: Workflow trigger message.

        Returns:
            QueueMessage for tenant router.
        """
        return QueueMessage(
            workspace_id=message.workspace_id,
            message_body={
                "workspace_id": message.workspace_id,
                "contact_id": message.contact_id,
                "trigger_type": message.trigger_type,
                **message.trigger_data,
            },
            priority=message.priority,
            delay_seconds=message.delay_seconds,
            metadata={
                "trigger_type": message.trigger_type,
            },
        )

    def _generate_dedup_id(self, message: WorkflowTriggerMessage) -> str:
        """Generate a deduplication ID for FIFO queue.

        Args:
            message: Workflow trigger message.

        Returns:
            Deduplication ID string.
        """
        import hashlib
        import time

        # Create a unique ID based on content and timestamp
        content = json.dumps({
            "workspace_id": message.workspace_id,
            "contact_id": message.contact_id,
            "trigger_type": message.trigger_type,
            "trigger_data": message.trigger_data,
            "timestamp": time.time(),
        }, sort_keys=True)

        return hashlib.md5(content.encode()).hexdigest()


# Singleton instance
_workflow_router: WorkflowRouter | None = None


def get_workflow_router() -> WorkflowRouter:
    """Get the global WorkflowRouter instance.

    Returns:
        WorkflowRouter instance.
    """
    global _workflow_router
    if _workflow_router is None:
        _workflow_router = WorkflowRouter()
    return _workflow_router


def route_workflow_trigger(
    workspace_id: str,
    trigger_type: str,
    trigger_data: dict[str, Any],
    contact_id: str | None = None,
    priority: str = "normal",
    delay_seconds: int = 0,
) -> RoutingResult:
    """Convenience function to route a workflow trigger.

    Args:
        workspace_id: Workspace ID.
        trigger_type: Type of trigger.
        trigger_data: Trigger event data.
        contact_id: Optional contact ID.
        priority: Message priority.
        delay_seconds: Delay before processing.

    Returns:
        RoutingResult.
    """
    router = get_workflow_router()
    message = WorkflowTriggerMessage(
        workspace_id=workspace_id,
        trigger_type=trigger_type,
        trigger_data=trigger_data,
        contact_id=contact_id,
        priority=priority,
        delay_seconds=delay_seconds,
    )
    return router.route_trigger(message)
