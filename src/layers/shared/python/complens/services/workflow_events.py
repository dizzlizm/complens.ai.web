"""Workflow event broadcasting service.

Broadcasts real-time workflow events to connected WebSocket clients.
"""

import json
import os
import time
from enum import Enum
from typing import Any

import boto3
import structlog

logger = structlog.get_logger()


class WorkflowEventType(str, Enum):
    """Workflow event types."""

    # Workflow-level events
    WORKFLOW_STARTED = "workflow.started"
    WORKFLOW_COMPLETED = "workflow.completed"
    WORKFLOW_FAILED = "workflow.failed"
    WORKFLOW_PAUSED = "workflow.paused"

    # Step-level events
    STEP_STARTED = "step.started"
    STEP_COMPLETED = "step.completed"
    STEP_FAILED = "step.failed"
    STEP_SKIPPED = "step.skipped"

    # Node-level events
    NODE_EXECUTING = "node.executing"
    NODE_COMPLETED = "node.completed"
    NODE_FAILED = "node.failed"


def emit_workflow_event(
    workspace_id: str,
    event_type: WorkflowEventType | str,
    workflow_id: str,
    run_id: str | None = None,
    node_id: str | None = None,
    node_type: str | None = None,
    status: str | None = None,
    error: str | None = None,
    result: dict | None = None,
    contact_id: str | None = None,
    metadata: dict | None = None,
) -> int:
    """Emit a workflow event to connected WebSocket clients.

    Args:
        workspace_id: Workspace ID.
        event_type: Type of event.
        workflow_id: Workflow ID.
        run_id: Workflow run ID.
        node_id: Current node ID (for step/node events).
        node_type: Type of the node being executed.
        status: Status of the workflow/step.
        error: Error message if failed.
        result: Result data from the step.
        contact_id: Contact ID involved in the workflow.
        metadata: Additional metadata.

    Returns:
        Number of connections that received the event.
    """
    # Get connections table
    connections_table = os.environ.get(
        "CONNECTIONS_TABLE",
        f"complens-{os.environ.get('STAGE', 'dev')}-connections",
    )

    # Get WebSocket endpoint
    ws_endpoint = os.environ.get("WEBSOCKET_ENDPOINT")
    if not ws_endpoint:
        logger.debug("No WebSocket endpoint configured, skipping event broadcast")
        return 0

    # Build event payload
    event_payload = {
        "action": "workflow_event",
        "event": event_type.value if isinstance(event_type, WorkflowEventType) else event_type,
        "workflow_id": workflow_id,
        "workspace_id": workspace_id,
        "timestamp": int(time.time() * 1000),
    }

    if run_id:
        event_payload["run_id"] = run_id
    if node_id:
        event_payload["node_id"] = node_id
    if node_type:
        event_payload["node_type"] = node_type
    if status:
        event_payload["status"] = status
    if error:
        event_payload["error"] = error
    if result:
        # Only include serializable result data
        event_payload["result"] = _sanitize_result(result)
    if contact_id:
        event_payload["contact_id"] = contact_id
    if metadata:
        event_payload["metadata"] = metadata

    # Broadcast to workspace
    return _broadcast_to_workspace(
        workspace_id=workspace_id,
        message=event_payload,
        connections_table=connections_table,
        ws_endpoint=ws_endpoint,
    )


def emit_workflow_started(
    workspace_id: str,
    workflow_id: str,
    run_id: str,
    contact_id: str | None = None,
    trigger_type: str | None = None,
) -> int:
    """Emit a workflow started event.

    Args:
        workspace_id: Workspace ID.
        workflow_id: Workflow ID.
        run_id: Workflow run ID.
        contact_id: Contact ID.
        trigger_type: Type of trigger that started the workflow.

    Returns:
        Number of connections notified.
    """
    return emit_workflow_event(
        workspace_id=workspace_id,
        event_type=WorkflowEventType.WORKFLOW_STARTED,
        workflow_id=workflow_id,
        run_id=run_id,
        contact_id=contact_id,
        status="running",
        metadata={"trigger_type": trigger_type} if trigger_type else None,
    )


def emit_workflow_completed(
    workspace_id: str,
    workflow_id: str,
    run_id: str,
    contact_id: str | None = None,
    result: dict | None = None,
) -> int:
    """Emit a workflow completed event.

    Args:
        workspace_id: Workspace ID.
        workflow_id: Workflow ID.
        run_id: Workflow run ID.
        contact_id: Contact ID.
        result: Final result data.

    Returns:
        Number of connections notified.
    """
    return emit_workflow_event(
        workspace_id=workspace_id,
        event_type=WorkflowEventType.WORKFLOW_COMPLETED,
        workflow_id=workflow_id,
        run_id=run_id,
        contact_id=contact_id,
        status="completed",
        result=result,
    )


def emit_workflow_failed(
    workspace_id: str,
    workflow_id: str,
    run_id: str,
    error: str,
    node_id: str | None = None,
    contact_id: str | None = None,
) -> int:
    """Emit a workflow failed event.

    Args:
        workspace_id: Workspace ID.
        workflow_id: Workflow ID.
        run_id: Workflow run ID.
        error: Error message.
        node_id: Node that failed.
        contact_id: Contact ID.

    Returns:
        Number of connections notified.
    """
    return emit_workflow_event(
        workspace_id=workspace_id,
        event_type=WorkflowEventType.WORKFLOW_FAILED,
        workflow_id=workflow_id,
        run_id=run_id,
        node_id=node_id,
        contact_id=contact_id,
        status="failed",
        error=error,
    )


def emit_node_executing(
    workspace_id: str,
    workflow_id: str,
    run_id: str,
    node_id: str,
    node_type: str,
    node_label: str | None = None,
) -> int:
    """Emit a node executing event.

    Args:
        workspace_id: Workspace ID.
        workflow_id: Workflow ID.
        run_id: Workflow run ID.
        node_id: Node ID.
        node_type: Node type.
        node_label: Node label/name.

    Returns:
        Number of connections notified.
    """
    return emit_workflow_event(
        workspace_id=workspace_id,
        event_type=WorkflowEventType.NODE_EXECUTING,
        workflow_id=workflow_id,
        run_id=run_id,
        node_id=node_id,
        node_type=node_type,
        status="executing",
        metadata={"node_label": node_label} if node_label else None,
    )


def emit_node_completed(
    workspace_id: str,
    workflow_id: str,
    run_id: str,
    node_id: str,
    node_type: str,
    result: dict | None = None,
) -> int:
    """Emit a node completed event.

    Args:
        workspace_id: Workspace ID.
        workflow_id: Workflow ID.
        run_id: Workflow run ID.
        node_id: Node ID.
        node_type: Node type.
        result: Node execution result.

    Returns:
        Number of connections notified.
    """
    return emit_workflow_event(
        workspace_id=workspace_id,
        event_type=WorkflowEventType.NODE_COMPLETED,
        workflow_id=workflow_id,
        run_id=run_id,
        node_id=node_id,
        node_type=node_type,
        status="completed",
        result=result,
    )


def emit_node_failed(
    workspace_id: str,
    workflow_id: str,
    run_id: str,
    node_id: str,
    node_type: str,
    error: str,
) -> int:
    """Emit a node failed event.

    Args:
        workspace_id: Workspace ID.
        workflow_id: Workflow ID.
        run_id: Workflow run ID.
        node_id: Node ID.
        node_type: Node type.
        error: Error message.

    Returns:
        Number of connections notified.
    """
    return emit_workflow_event(
        workspace_id=workspace_id,
        event_type=WorkflowEventType.NODE_FAILED,
        workflow_id=workflow_id,
        run_id=run_id,
        node_id=node_id,
        node_type=node_type,
        status="failed",
        error=error,
    )


def _sanitize_result(result: dict) -> dict:
    """Sanitize result data for JSON serialization.

    Args:
        result: Result data to sanitize.

    Returns:
        Sanitized result.
    """
    try:
        # Test if serializable
        json.dumps(result)
        return result
    except (TypeError, ValueError):
        # Return a simplified version
        return {"_note": "Result contains non-serializable data"}


def _broadcast_to_workspace(
    workspace_id: str,
    message: dict,
    connections_table: str,
    ws_endpoint: str,
) -> int:
    """Broadcast message to all workspace connections.

    Args:
        workspace_id: Workspace ID.
        message: Message to broadcast.
        connections_table: DynamoDB connections table name.
        ws_endpoint: WebSocket endpoint URL.

    Returns:
        Number of connections that received the message.
    """
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table(connections_table)

    # Use WorkspaceIdIndex GSI for O(n) query instead of full table scan
    try:
        response = table.query(
            IndexName="WorkspaceIdIndex",
            KeyConditionExpression="workspaceId = :ws",
            ExpressionAttributeValues={":ws": workspace_id},
        )
        items = response.get("Items", [])

        # Handle pagination
        while "LastEvaluatedKey" in response:
            response = table.query(
                IndexName="WorkspaceIdIndex",
                KeyConditionExpression="workspaceId = :ws",
                ExpressionAttributeValues={":ws": workspace_id},
                ExclusiveStartKey=response["LastEvaluatedKey"],
            )
            items.extend(response.get("Items", []))

    except Exception as e:
        # Fallback to scan if GSI doesn't exist yet (during deployment transition)
        logger.warning("GSI query failed, falling back to scan", error=str(e))
        try:
            response = table.scan(
                FilterExpression="contains(workspaceIds, :ws)",
                ExpressionAttributeValues={":ws": workspace_id},
            )
            items = response.get("Items", [])

            while "LastEvaluatedKey" in response:
                response = table.scan(
                    FilterExpression="contains(workspaceIds, :ws)",
                    ExpressionAttributeValues={":ws": workspace_id},
                    ExclusiveStartKey=response["LastEvaluatedKey"],
                )
                items.extend(response.get("Items", []))
        except Exception:
            return 0

    if not items:
        logger.debug("No connections for workspace", workspace_id=workspace_id)
        return 0

    # Create API Gateway Management API client
    apigw = boto3.client(
        "apigatewaymanagementapi",
        endpoint_url=ws_endpoint,
    )

    sent_count = 0
    stale_connections = []
    message_bytes = json.dumps(message).encode("utf-8")

    for item in items:
        connection_id = item.get("connectionId")
        if not connection_id:
            continue

        try:
            apigw.post_to_connection(
                ConnectionId=connection_id,
                Data=message_bytes,
            )
            sent_count += 1
        except apigw.exceptions.GoneException:
            stale_connections.append(connection_id)
        except Exception as e:
            logger.debug(
                "Failed to send to connection",
                connection_id=connection_id,
                error=str(e),
            )

    # Clean up stale connections
    for stale_id in stale_connections:
        try:
            table.delete_item(Key={"connectionId": stale_id})
        except Exception:
            pass

    if sent_count > 0 or stale_connections:
        logger.info(
            "Workflow event broadcast",
            workspace_id=workspace_id,
            event=message.get("event"),
            sent=sent_count,
            stale_removed=len(stale_connections),
        )

    return sent_count
