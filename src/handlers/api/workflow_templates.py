"""Workflow templates API handler."""

import json
from typing import Any

import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.workflow_template import (
    CreateWorkflowTemplateRequest,
    WorkflowTemplate,
)
from complens.repositories.workflow import WorkflowRepository
from complens.repositories.workflow_template import WorkflowTemplateRepository
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import NotFoundError, ValidationError
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle workflow template API requests.

    Routes:
        GET    /workspaces/{workspace_id}/workflow-templates
        POST   /workspaces/{workspace_id}/workflow-templates
        DELETE /workspaces/{workspace_id}/workflow-templates/{template_id}
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")
        template_id = path_params.get("template_id")

        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        repo = WorkflowTemplateRepository()

        if http_method == "GET":
            return list_templates(repo, workspace_id, event)
        elif http_method == "POST":
            return create_template(repo, workspace_id, event)
        elif http_method == "DELETE" and template_id:
            return delete_template(repo, workspace_id, template_id)
        else:
            return error("Method not allowed", 405)

    except PydanticValidationError as e:
        return validation_error(e.errors())
    except ValidationError as e:
        return validation_error(e.errors)
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except Exception as e:
        logger.exception("Workflow templates handler error", error=str(e))
        return error("Internal server error", 500)


def list_templates(
    repo: WorkflowTemplateRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """List custom workflow templates for a workspace.

    Args:
        repo: Template repository.
        workspace_id: Workspace ID.
        event: API Gateway event.

    Returns:
        API response with template list.
    """
    query_params = event.get("queryStringParameters", {}) or {}
    category = query_params.get("category")

    templates, last_key = repo.list_by_workspace(
        workspace_id,
        category=category,
        limit=100,
    )

    return success({
        "items": [t.model_dump(mode="json", by_alias=True) for t in templates],
    })


def create_template(
    repo: WorkflowTemplateRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """Create a custom workflow template.

    Supports creating from scratch or from an existing workflow via source_workflow_id.

    Args:
        repo: Template repository.
        workspace_id: Workspace ID.
        event: API Gateway event.

    Returns:
        API response with created template.
    """
    body = json.loads(event.get("body", "{}"))
    request = CreateWorkflowTemplateRequest.model_validate(body)

    nodes = request.nodes
    edges = request.edges

    # If saving from an existing workflow, copy its nodes and edges
    if request.source_workflow_id:
        workflow_repo = WorkflowRepository()
        workflow = workflow_repo.get_by_id(workspace_id, request.source_workflow_id)
        if not workflow:
            return not_found("workflow", request.source_workflow_id)

        nodes = [n.model_dump(mode="json", by_alias=True) for n in workflow.nodes]
        edges = [e.model_dump(mode="json", by_alias=True) for e in workflow.edges]

    template = WorkflowTemplate(
        workspace_id=workspace_id,
        name=request.name,
        description=request.description,
        category=request.category,
        icon=request.icon,
        nodes=nodes,
        edges=edges,
    )

    template = repo.create_template(template)

    logger.info(
        "Workflow template created",
        workspace_id=workspace_id,
        template_id=template.id,
        name=template.name,
    )

    return created(template.model_dump(mode="json", by_alias=True))


def delete_template(
    repo: WorkflowTemplateRepository,
    workspace_id: str,
    template_id: str,
) -> dict:
    """Delete a custom workflow template.

    Args:
        repo: Template repository.
        workspace_id: Workspace ID.
        template_id: Template ID.

    Returns:
        API response confirming deletion.
    """
    deleted_ok = repo.delete_template(workspace_id, template_id)
    if not deleted_ok:
        return not_found("workflow_template", template_id)

    logger.info(
        "Workflow template deleted",
        workspace_id=workspace_id,
        template_id=template_id,
    )

    return success({"deleted": True})
