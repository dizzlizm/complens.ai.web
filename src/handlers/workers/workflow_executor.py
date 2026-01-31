"""Workflow executor worker.

Executes individual workflow steps, called by Step Functions.
"""

import asyncio
import json
import os
from typing import Any

import structlog

from complens.models.workflow_run import RunStatus, WorkflowRun
from complens.repositories.contact import ContactRepository
from complens.repositories.workflow import WorkflowRepository, WorkflowRunRepository
from complens.services.workflow_engine import WorkflowEngine

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Execute workflow step from Step Functions.

    Args:
        event: Step Functions input.
        context: Lambda context.

    Returns:
        Step result for Step Functions.
    """
    action = event.get("action", "initialize")

    logger.info("Workflow executor invoked", action=action)

    try:
        if action == "initialize":
            return initialize_workflow(event)
        elif action == "execute_node":
            return execute_node(event)
        elif action == "resume_after_wait":
            return resume_after_wait(event)
        elif action == "complete":
            return complete_workflow(event)
        else:
            raise ValueError(f"Unknown action: {action}")

    except Exception as e:
        logger.exception("Workflow executor error", error=str(e))
        return {
            "status": "error",
            "error": str(e),
        }


def initialize_workflow(event: dict) -> dict:
    """Initialize a new workflow run.

    Args:
        event: Event data with workflow_id, contact_id, trigger_data.

    Returns:
        Initialization result.
    """
    workflow_id = event.get("workflow_id")
    workspace_id = event.get("workspace_id")
    contact_id = event.get("contact_id")
    trigger_type = event.get("trigger_type", "manual")
    trigger_data = event.get("trigger_data", {})

    # Get workflow
    workflow_repo = WorkflowRepository()
    workflow = workflow_repo.get_by_id(workspace_id, workflow_id)

    if not workflow:
        raise ValueError(f"Workflow {workflow_id} not found")

    # Get contact
    contact_repo = ContactRepository()
    contact = contact_repo.get_by_id(workspace_id, contact_id)

    if not contact:
        raise ValueError(f"Contact {contact_id} not found")

    # Create workflow run
    run_repo = WorkflowRunRepository()

    run = WorkflowRun(
        workflow_id=workflow_id,
        workspace_id=workspace_id,
        contact_id=contact_id,
        trigger_type=trigger_type,
        trigger_data=trigger_data,
        status=RunStatus.RUNNING,
    )
    run.start()

    # Store the run
    run = run_repo.create_run(run)

    # Get trigger node
    trigger_node = workflow.get_trigger_node()
    if not trigger_node:
        raise ValueError("Workflow has no trigger node")

    logger.info(
        "Workflow run initialized",
        run_id=run.id,
        workflow_id=workflow_id,
        contact_id=contact_id,
    )

    return {
        "workflow_run_id": run.id,
        "current_node_id": trigger_node.id,
        "variables": {},
    }


def execute_node(event: dict) -> dict:
    """Execute a single workflow node.

    Args:
        event: Event data with run_id, node_id, variables.

    Returns:
        Node execution result.
    """
    workflow_run_id = event.get("workflow_run_id")
    current_node_id = event.get("current_node_id")
    variables = event.get("variables", {})

    # Get workflow run
    run_repo = WorkflowRunRepository()
    workflow_repo = WorkflowRepository()
    contact_repo = ContactRepository()

    # Find the run
    # Note: We need to know the workflow_id to get the run
    # For Step Functions, we should pass workflow_id in the event
    workflow_id = event.get("workflow_id")
    workspace_id = event.get("workspace_id")

    if not workflow_id:
        raise ValueError("workflow_id is required")

    run = run_repo.get_by_id(workflow_id, workflow_run_id)
    if not run:
        raise ValueError(f"Workflow run {workflow_run_id} not found")

    workflow = workflow_repo.get_by_id(workspace_id, workflow_id)
    if not workflow:
        raise ValueError(f"Workflow {workflow_id} not found")

    contact = contact_repo.get_by_id(workspace_id, run.contact_id)
    if not contact:
        raise ValueError(f"Contact {run.contact_id} not found")

    # Get node definition
    node_def = workflow.get_node_by_id(current_node_id)
    if not node_def:
        raise ValueError(f"Node {current_node_id} not found")

    # Execute the node
    engine = WorkflowEngine()
    node_class = engine.get_node_class(node_def.node_type)

    if not node_class:
        raise ValueError(f"Unknown node type: {node_def.node_type}")

    from complens.nodes.base import NodeContext

    node = node_class(node_id=current_node_id, config=node_def.get_config())

    context = NodeContext(
        contact=contact,
        workflow_run=run,
        workspace_id=workspace_id,
        variables=variables,
        trigger_data=run.trigger_data,
        node_config=node_def.get_config(),
    )

    # Run async execution
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(node.execute(context))
    finally:
        loop.close()

    logger.info(
        "Node executed",
        node_id=current_node_id,
        node_type=node_def.node_type,
        success=result.success,
        status=result.status,
    )

    # Determine next node
    next_node_id = result.next_node_id
    if not next_node_id and result.success:
        # Try to find from edges
        edges = workflow.get_outgoing_edges(current_node_id)
        if edges:
            next_node_id = edges[0].target

    # Merge variables
    merged_vars = {**variables, **result.variables, **result.output}

    return {
        "status": result.status,
        "success": result.success,
        "next_node_id": next_node_id,
        "variables": merged_vars,
        "wait_seconds": result.wait_seconds,
        "error": result.error,
    }


def resume_after_wait(event: dict) -> dict:
    """Resume workflow after a wait.

    Args:
        event: Event data.

    Returns:
        Resume result.
    """
    # This is essentially the same as execute_node
    # but called after Step Functions Wait state
    return execute_node(event)


def complete_workflow(event: dict) -> dict:
    """Complete a workflow run.

    Args:
        event: Event data with run_id, status, error.

    Returns:
        Completion result.
    """
    workflow_run_id = event.get("workflow_run_id")
    status = event.get("status", "completed")
    error = event.get("error")
    variables = event.get("variables", {})

    # Get workflow_id from event (passed through Step Functions)
    workflow_id = event.get("workflow_id")
    workspace_id = event.get("workspace_id")

    if not workflow_id:
        logger.warning("workflow_id not in event, cannot update run status")
        return {"status": status}

    run_repo = WorkflowRunRepository()
    run = run_repo.get_by_id(workflow_id, workflow_run_id)

    if run:
        run.complete(
            success=(status == "completed"),
            error_message=error.get("Error") if isinstance(error, dict) else str(error) if error else None,
        )
        run.variables = variables
        run_repo.update_run(run)

        logger.info(
            "Workflow run completed",
            run_id=workflow_run_id,
            status=status,
            success=(status == "completed"),
        )

    return {
        "status": status,
        "workflow_run_id": workflow_run_id,
    }
