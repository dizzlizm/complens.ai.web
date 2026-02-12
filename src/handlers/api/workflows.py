"""Workflows API handler."""

import asyncio
import json
import os
from typing import Any

import boto3
import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.contact import Contact
from complens.models.workflow import (
    CreateWorkflowRequest,
    UpdateWorkflowRequest,
    Workflow,
    WorkflowEdge,
    WorkflowStatus,
)
from complens.models.workflow_node import WorkflowNode
from complens.repositories.contact import ContactRepository
from complens.repositories.workflow import WorkflowRepository, WorkflowRunRepository
from complens.services.workflow_engine import WorkflowEngine
from complens.repositories.workspace import WorkspaceRepository
from complens.services.feature_gate import FeatureGateError, enforce_limit, get_workspace_plan, count_resources
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import ForbiddenError, NotFoundError, ValidationError
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle workflows API requests.

    Routes:
        GET    /workspaces/{workspace_id}/workflows
        POST   /workspaces/{workspace_id}/workflows
        GET    /workspaces/{workspace_id}/workflows/{workflow_id}
        PUT    /workspaces/{workspace_id}/workflows/{workflow_id}
        DELETE /workspaces/{workspace_id}/workflows/{workflow_id}
        POST   /workspaces/{workspace_id}/workflows/{workflow_id}/execute
        GET    /workspaces/{workspace_id}/workflows/{workflow_id}/runs
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")
        workflow_id = path_params.get("workflow_id")

        # Get auth context and verify access
        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        repo = WorkflowRepository()
        run_repo = WorkflowRunRepository()

        # Route to appropriate handler
        if "/test-email" in path and http_method == "POST":
            return send_test_email(workspace_id, workflow_id, event)
        elif "/execute" in path and http_method == "POST":
            return execute_workflow(repo, workspace_id, workflow_id, event)
        elif "/runs" in path and http_method == "GET":
            return list_workflow_runs(run_repo, workflow_id, event)
        elif http_method == "GET" and workflow_id:
            return get_workflow(repo, workspace_id, workflow_id)
        elif http_method == "GET":
            return list_workflows(repo, workspace_id, event)
        elif http_method == "POST":
            return create_workflow(repo, workspace_id, event)
        elif http_method == "PUT" and workflow_id:
            return update_workflow(repo, workspace_id, workflow_id, event)
        elif http_method == "DELETE" and workflow_id:
            return delete_workflow(repo, workspace_id, workflow_id)
        else:
            return error("Method not allowed", 405)

    except FeatureGateError as e:
        return error(str(e), 403, error_code="PLAN_LIMIT_REACHED")
    except ValidationError as e:
        return validation_error(e.errors)
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except ForbiddenError as e:
        return error(e.message, 403, error_code="FORBIDDEN")
    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        logger.exception("Workflows handler error", error=str(e))
        return error("Internal server error", 500)


def list_workflows(
    repo: WorkflowRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """List workflows in a workspace.

    By default, returns only workspace-level workflows (no page_id).
    Add ?include_page_workflows=true to include page-specific workflows.
    """
    query_params = event.get("queryStringParameters", {}) or {}

    limit = min(int(query_params.get("limit", 50)), 100)
    status_filter = query_params.get("status")
    site_id = query_params.get("site_id")
    include_page_workflows = query_params.get("include_page_workflows", "").lower() == "true"

    status = None
    if status_filter:
        try:
            status = WorkflowStatus(status_filter)
        except ValueError:
            return error(f"Invalid status: {status_filter}", 400)

    if site_id:
        # Return workflows scoped to a specific site
        workflows, next_key = repo.list_by_site(workspace_id, site_id, status, limit)
    elif include_page_workflows:
        # Return all workflows (both workspace-level and page-specific)
        workflows, next_key = repo.list_by_workspace(workspace_id, status, limit)
    else:
        # Return only workspace-level workflows (no page_id)
        workflows, next_key = repo.list_workspace_level(workspace_id, status, limit)

    # Use by_alias=True to return 'type' instead of 'node_type' for React Flow compatibility
    return success({
        "items": [w.model_dump(mode="json", by_alias=True) for w in workflows],
        "pagination": {
            "limit": limit,
        },
    })


def get_workflow(
    repo: WorkflowRepository,
    workspace_id: str,
    workflow_id: str,
) -> dict:
    """Get a single workflow by ID."""
    workflow = repo.get_by_id(workspace_id, workflow_id)
    if not workflow:
        return not_found("Workflow", workflow_id)

    # Use by_alias=True to return 'type' instead of 'node_type' for React Flow compatibility
    return success(workflow.model_dump(mode="json", by_alias=True))


def create_workflow(
    repo: WorkflowRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """Create a new workflow."""
    # Enforce plan limit for workflows
    plan = get_workspace_plan(workspace_id)
    wf_count = count_resources(repo.table, workspace_id, "WF#")
    enforce_limit(plan, "workflows", wf_count)

    try:
        body = json.loads(event.get("body", "{}"))
        logger.info("Create workflow request", workspace_id=workspace_id)
        request = CreateWorkflowRequest.model_validate(body)
    except PydanticValidationError as e:
        logger.warning("Workflow request validation failed", errors=e.errors())
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError as e:
        logger.warning("Invalid JSON body", error=str(e))
        return error("Invalid JSON body", 400)

    # Parse nodes with validation
    nodes = []
    for i, n in enumerate(request.nodes):
        try:
            node = WorkflowNode.model_validate(n)
            nodes.append(node)
            logger.debug("Parsed node", index=i, node_id=node.id, node_type=node.node_type)
        except PydanticValidationError as e:
            logger.warning("Node validation failed", index=i, node=n, errors=e.errors())
            return validation_error([
                {"field": f"nodes[{i}].{'.'.join(str(x) for x in err['loc'])}", "message": err["msg"]}
                for err in e.errors()
            ])

    # Parse edges with validation
    edges = []
    for i, e_data in enumerate(request.edges):
        try:
            edge = WorkflowEdge.model_validate(e_data)
            edges.append(edge)
        except PydanticValidationError as e:
            logger.warning("Edge validation failed", index=i, edge=e_data, errors=e.errors())
            return validation_error([
                {"field": f"edges[{i}].{'.'.join(str(x) for x in err['loc'])}", "message": err["msg"]}
                for err in e.errors()
            ])

    # Build settings (merge defaults with request settings)
    default_settings = {
        "max_concurrent_runs": 100,
        "timeout_minutes": 60,
        "retry_on_failure": True,
        "max_retries": 3,
    }
    settings = {**default_settings, **request.settings} if request.settings else default_settings

    # Create workflow
    workflow = Workflow(
        workspace_id=workspace_id,
        site_id=request.site_id,
        name=request.name,
        description=request.description,
        nodes=nodes,
        edges=edges,
        viewport=request.viewport,
        settings=settings,
    )

    # Validate workflow graph
    validation_errors = workflow.validate_graph()
    if validation_errors:
        logger.warning("Workflow graph validation failed", errors=validation_errors)
        return validation_error([{"field": "graph", "message": err} for err in validation_errors])

    workflow = repo.create_workflow(workflow)

    logger.info("Workflow created", workflow_id=workflow.id, workspace_id=workspace_id)

    # Use by_alias=True to return 'type' instead of 'node_type' for React Flow compatibility
    return created(workflow.model_dump(mode="json", by_alias=True))


def update_workflow(
    repo: WorkflowRepository,
    workspace_id: str,
    workflow_id: str,
    event: dict,
) -> dict:
    """Update an existing workflow."""
    # Get existing workflow
    workflow = repo.get_by_id(workspace_id, workflow_id)
    if not workflow:
        return not_found("Workflow", workflow_id)

    try:
        body = json.loads(event.get("body", "{}"))
        logger.info("Update workflow request", workflow_id=workflow_id)
        request = UpdateWorkflowRequest.model_validate(body)
    except PydanticValidationError as e:
        logger.warning("Update request validation failed", errors=e.errors())
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    # Track status change for schedule management
    old_status = workflow.status.value if hasattr(workflow.status, 'value') else workflow.status

    # Apply updates
    if request.name is not None:
        workflow.name = request.name
    if request.description is not None:
        workflow.description = request.description
    if request.status is not None:
        workflow.status = request.status

    # Parse nodes with validation
    if request.nodes is not None:
        nodes = []
        for i, n in enumerate(request.nodes):
            try:
                node = WorkflowNode.model_validate(n)
                nodes.append(node)
            except PydanticValidationError as e:
                logger.warning("Node validation failed in update", index=i, node=n, errors=e.errors())
                return validation_error([
                    {"field": f"nodes[{i}].{'.'.join(str(x) for x in err['loc'])}", "message": err["msg"]}
                    for err in e.errors()
                ])
        workflow.nodes = nodes

    # Parse edges with validation
    if request.edges is not None:
        edges = []
        for i, e_data in enumerate(request.edges):
            try:
                edge = WorkflowEdge.model_validate(e_data)
                edges.append(edge)
            except PydanticValidationError as e:
                logger.warning("Edge validation failed in update", index=i, edge=e_data, errors=e.errors())
                return validation_error([
                    {"field": f"edges[{i}].{'.'.join(str(x) for x in err['loc'])}", "message": err["msg"]}
                    for err in e.errors()
                ])
        workflow.edges = edges

    if request.viewport is not None:
        workflow.viewport = request.viewport
    if request.settings is not None:
        workflow.settings = {**workflow.settings, **request.settings}

    # Validate if nodes/edges were updated
    if request.nodes is not None or request.edges is not None:
        validation_errors = workflow.validate_graph()
        if validation_errors:
            logger.warning("Graph validation failed in update", errors=validation_errors)
            return validation_error([{"field": "graph", "message": err} for err in validation_errors])

    # Save
    workflow = repo.update_workflow(workflow)

    # Manage EventBridge schedule for trigger_schedule workflows
    new_status = workflow.status.value if hasattr(workflow.status, 'value') else workflow.status
    if request.status is not None and old_status != new_status:
        trigger_node = workflow.get_trigger_node()
        if trigger_node and (
            (hasattr(trigger_node, 'node_type') and trigger_node.node_type == 'trigger_schedule')
            or (hasattr(trigger_node, 'type') and trigger_node.type == 'trigger_schedule')
        ):
            if new_status == WorkflowStatus.ACTIVE.value:
                _create_schedule(workspace_id, workflow_id, trigger_node.get_config())
            else:
                _delete_schedule(workflow_id)

    logger.info("Workflow updated", workflow_id=workflow_id, workspace_id=workspace_id)

    # Use by_alias=True to return 'type' instead of 'node_type' for React Flow compatibility
    return success(workflow.model_dump(mode="json", by_alias=True))


def delete_workflow(
    repo: WorkflowRepository,
    workspace_id: str,
    workflow_id: str,
) -> dict:
    """Delete a workflow."""
    # Clean up any EventBridge schedule before deleting
    _delete_schedule(workflow_id)

    deleted = repo.delete_workflow(workspace_id, workflow_id)

    if not deleted:
        return not_found("Workflow", workflow_id)

    logger.info("Workflow deleted", workflow_id=workflow_id, workspace_id=workspace_id)

    return success({"deleted": True, "id": workflow_id})


def execute_workflow(
    repo: WorkflowRepository,
    workspace_id: str,
    workflow_id: str,
    event: dict,
) -> dict:
    """Execute a workflow for a contact.

    Request body:
        contact_id: ID of contact to run workflow for
        trigger_data: Optional trigger data
    """
    workflow = repo.get_by_id(workspace_id, workflow_id)
    if not workflow:
        return not_found("Workflow", workflow_id)

    # Handle status as string or enum (DynamoDB stores as string)
    status_value = workflow.status.value if hasattr(workflow.status, 'value') else workflow.status
    if status_value != WorkflowStatus.ACTIVE.value:
        return error(
            f"Workflow is not active (status: {status_value})",
            400,
            error_code="WORKFLOW_NOT_ACTIVE",
        )

    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    contact_id = body.get("contact_id")
    if not contact_id:
        return error("contact_id is required", 400)

    trigger_data = body.get("trigger_data", {})

    # Get contact
    contact_repo = ContactRepository()
    contact = contact_repo.get_by_id(workspace_id, contact_id)
    if not contact:
        return not_found("Contact", contact_id)

    # Start workflow execution via Step Functions
    sfn_client = boto3.client("stepfunctions")
    state_machine_arn = os.environ.get("WORKFLOW_STATE_MACHINE_ARN")

    if state_machine_arn:
        # Start Step Functions execution
        execution_input = {
            "workflow_id": workflow_id,
            "workspace_id": workspace_id,
            "contact_id": contact_id,
            "trigger_type": "manual",
            "trigger_data": trigger_data,
        }

        execution = sfn_client.start_execution(
            stateMachineArn=state_machine_arn,
            input=json.dumps(execution_input),
        )

        logger.info(
            "Workflow execution started",
            workflow_id=workflow_id,
            contact_id=contact_id,
            execution_arn=execution["executionArn"],
        )

        return success({
            "status": "started",
            "execution_arn": execution["executionArn"],
            "workflow_id": workflow_id,
            "contact_id": contact_id,
        })
    else:
        # Fallback: Execute synchronously (for local dev)
        engine = WorkflowEngine()

        # Run async code
        loop = asyncio.new_event_loop()
        try:
            run = loop.run_until_complete(
                engine.start_workflow(
                    workflow=workflow,
                    contact=contact,
                    trigger_type="manual",
                    trigger_data=trigger_data,
                )
            )
        finally:
            loop.close()

        return success({
            "status": run.status.value,
            "run_id": run.id,
            "workflow_id": workflow_id,
            "contact_id": contact_id,
        })


def list_workflow_runs(
    run_repo: WorkflowRunRepository,
    workflow_id: str,
    event: dict,
) -> dict:
    """List runs for a workflow."""
    query_params = event.get("queryStringParameters", {}) or {}

    limit = min(int(query_params.get("limit", 50)), 100)

    runs = run_repo.list_by_workflow(workflow_id, limit=limit)

    return success({
        "items": [r.model_dump(mode="json", by_alias=True) for r in runs],
        "pagination": {
            "limit": limit,
        },
    })


def send_test_email(
    workspace_id: str,
    workflow_id: str,
    event: dict,
) -> dict:
    """Send a test email for previewing email node output.

    Request body:
        to_email: Recipient email address
        subject: Email subject line
        body_html: HTML body content
    """
    try:
        body = json.loads(event.get("body", "{}"))
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    to_email = body.get("to_email", "").strip()
    subject = body.get("subject", "").strip()
    body_html = body.get("body_html", "").strip()

    if not to_email:
        return error("to_email is required", 400)

    if not subject and not body_html:
        return error("subject or body_html is required", 400)

    # Prefix subject with [TEST]
    test_subject = f"[TEST] {subject}" if subject else "[TEST] No Subject"

    try:
        from complens.services.email_service import get_email_service

        email_service = get_email_service()
        result = email_service.send_email(
            to=to_email,
            subject=test_subject,
            body_html=body_html or "<p>No content</p>",
            body_text=f"Test email from workflow {workflow_id}",
        )

        logger.info(
            "Test email sent",
            workspace_id=workspace_id,
            workflow_id=workflow_id,
            to=to_email,
        )

        return success({
            "success": True,
            "message": "Test email sent successfully",
            "message_id": result.get("message_id"),
        })

    except Exception as e:
        logger.error("Test email failed", error=str(e), workspace_id=workspace_id)
        return error(f"Failed to send test email: {str(e)}", 400)


# ============================================================================
# EventBridge Scheduler helpers for trigger_schedule
# ============================================================================


def _human_to_cron(config: dict) -> str:
    """Convert human-readable schedule config to EventBridge cron expression.

    Args:
        config: Schedule config with frequency, time, day_of_week, day_of_month.

    Returns:
        EventBridge cron expression string.
    """
    freq = config.get("frequency", "daily")
    time_str = config.get("time", "09:00")

    try:
        parts = time_str.split(":")
        hour = int(parts[0])
        minute = int(parts[1]) if len(parts) > 1 else 0
    except (ValueError, IndexError):
        hour, minute = 9, 0

    if freq == "hourly":
        return "cron(0 * * * ? *)"
    elif freq == "daily":
        return f"cron({minute} {hour} * * ? *)"
    elif freq == "weekly":
        dow = (config.get("day_of_week") or "MON").upper()[:3]
        return f"cron({minute} {hour} ? * {dow} *)"
    elif freq == "monthly":
        dom = config.get("day_of_month", 1)
        try:
            dom = max(1, min(28, int(dom)))
        except (ValueError, TypeError):
            dom = 1
        return f"cron({minute} {hour} {dom} * ? *)"
    else:
        return f"cron({minute} {hour} * * ? *)"


def _create_schedule(workspace_id: str, workflow_id: str, config: dict) -> None:
    """Create an EventBridge Scheduler schedule for a workflow.

    Args:
        workspace_id: Workspace ID.
        workflow_id: Workflow ID.
        config: Trigger node config with frequency, time, etc.
    """
    queue_url = os.environ.get("WORKFLOW_QUEUE_URL")
    scheduler_role_arn = os.environ.get("SCHEDULER_ROLE_ARN")

    if not queue_url or not scheduler_role_arn:
        logger.warning(
            "Cannot create schedule: missing WORKFLOW_QUEUE_URL or SCHEDULER_ROLE_ARN",
            workflow_id=workflow_id,
        )
        return

    schedule_name = f"wf-schedule-{workflow_id}"
    cron_expr = _human_to_cron(config)
    timezone = config.get("timezone", "UTC")

    # Build the SQS message payload
    payload = json.dumps({
        "detail": {
            "trigger_type": "trigger_schedule",
            "workspace_id": workspace_id,
            "workflow_id": workflow_id,
            "data": {},
            "contact_id": None,
        },
    })

    # Extract queue ARN from URL
    # URL format: https://sqs.{region}.amazonaws.com/{account}/{queue-name}
    parts = queue_url.rstrip("/").split("/")
    queue_name = parts[-1]
    # Build ARN from env
    region = os.environ.get("AWS_REGION", "us-east-1")
    account_id = queue_url.split("/")[-2] if len(parts) >= 2 else ""
    queue_arn = f"arn:aws:sqs:{region}:{account_id}:{queue_name}"

    try:
        scheduler = boto3.client("scheduler")

        # Delete existing schedule if any (idempotent update)
        try:
            scheduler.delete_schedule(Name=schedule_name)
        except scheduler.exceptions.ResourceNotFoundException:
            pass

        scheduler.create_schedule(
            Name=schedule_name,
            ScheduleExpression=cron_expr,
            ScheduleExpressionTimezone=timezone,
            FlexibleTimeWindow={"Mode": "OFF"},
            Target={
                "Arn": queue_arn,
                "RoleArn": scheduler_role_arn,
                "Input": payload,
                "SqsParameters": {
                    "MessageGroupId": workspace_id,
                },
            },
            State="ENABLED",
        )

        logger.info(
            "EventBridge schedule created",
            schedule_name=schedule_name,
            cron=cron_expr,
            timezone=timezone,
            workflow_id=workflow_id,
        )
    except Exception as e:
        logger.exception(
            "Failed to create EventBridge schedule",
            workflow_id=workflow_id,
            error=str(e),
        )


def _delete_schedule(workflow_id: str) -> None:
    """Delete an EventBridge Scheduler schedule for a workflow.

    Args:
        workflow_id: Workflow ID.
    """
    schedule_name = f"wf-schedule-{workflow_id}"

    try:
        scheduler = boto3.client("scheduler")
        scheduler.delete_schedule(Name=schedule_name)
        logger.info("EventBridge schedule deleted", schedule_name=schedule_name)
    except Exception as e:
        # ResourceNotFoundException is expected if schedule doesn't exist
        if "ResourceNotFoundException" not in str(type(e).__name__):
            logger.warning(
                "Failed to delete EventBridge schedule",
                schedule_name=schedule_name,
                error=str(e),
            )
