"""Knowledge base API handler."""

import json
from typing import Any

import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.document import CreateDocumentRequest, Document, DocumentStatus
from complens.repositories.document import DocumentRepository
from complens.services.knowledge_base_service import get_knowledge_base_service
from complens.repositories.workspace import WorkspaceRepository
from complens.services.feature_gate import FeatureGateError, get_workspace_plan, require_feature
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import NotFoundError, ValidationError
from complens.utils.responses import created, error, not_found, success, validation_error

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle knowledge base API requests.

    Routes:
        GET    /workspaces/{ws}/knowledge-base/documents
        POST   /workspaces/{ws}/knowledge-base/documents
        DELETE /workspaces/{ws}/knowledge-base/documents/{document_id}
        POST   /workspaces/{ws}/knowledge-base/sync
        GET    /workspaces/{ws}/knowledge-base/status
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}
        workspace_id = path_params.get("workspace_id")
        document_id = path_params.get("document_id")

        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        repo = DocumentRepository()
        kb_service = get_knowledge_base_service()

        if path.endswith("/sync") and http_method == "POST":
            return trigger_sync(kb_service)
        elif path.endswith("/status") and http_method == "GET":
            return get_status(repo, workspace_id)
        elif http_method == "GET" and not document_id:
            return list_documents(repo, workspace_id, event)
        elif http_method == "POST" and not document_id:
            return create_document(repo, kb_service, workspace_id, event)
        elif http_method == "DELETE" and document_id:
            return delete_document(repo, kb_service, workspace_id, document_id)
        else:
            return error("Method not allowed", 405)

    except FeatureGateError as e:
        return error(str(e), 403, error_code="PLAN_LIMIT_REACHED")
    except PydanticValidationError as e:
        return validation_error(e.errors())
    except ValidationError as e:
        return validation_error(e.errors)
    except NotFoundError as e:
        return not_found(e.resource_type, e.resource_id)
    except Exception as e:
        logger.exception("Knowledge base handler error", error=str(e))
        return error("Internal server error", 500)


def list_documents(
    repo: DocumentRepository,
    workspace_id: str,
    event: dict,
) -> dict:
    """List knowledge base documents.

    Args:
        repo: Document repository.
        workspace_id: Workspace ID.
        event: API Gateway event.

    Returns:
        API response with document list.
    """
    documents, last_key = repo.list_by_workspace(workspace_id, limit=100)

    return success({
        "items": [d.model_dump(mode="json", by_alias=True) for d in documents],
    })


def create_document(
    repo: DocumentRepository,
    kb_service,
    workspace_id: str,
    event: dict,
) -> dict:
    """Create a document and return a presigned upload URL.

    Args:
        repo: Document repository.
        kb_service: Knowledge base service.
        workspace_id: Workspace ID.
        event: API Gateway event.

    Returns:
        API response with document and upload URL.
    """
    # Enforce knowledge_base feature gate
    plan = get_workspace_plan(workspace_id)
    require_feature(plan, "knowledge_base")

    body = json.loads(event.get("body", "{}"))
    request = CreateDocumentRequest.model_validate(body)

    document = Document(
        workspace_id=workspace_id,
        name=request.name,
        content_type=request.content_type,
        file_size=request.file_size,
        status=DocumentStatus.PENDING,
    )

    file_key = kb_service.get_file_key(workspace_id, document.id, request.name)
    document.file_key = file_key

    document = repo.create_document(document)

    upload_url = kb_service.generate_upload_url(
        workspace_id=workspace_id,
        document_id=document.id,
        content_type=request.content_type,
        file_name=request.name,
    )

    logger.info(
        "Knowledge base document created",
        workspace_id=workspace_id,
        document_id=document.id,
        name=document.name,
    )

    result = document.model_dump(mode="json", by_alias=True)
    result["upload_url"] = upload_url

    return created(result)


def delete_document(
    repo: DocumentRepository,
    kb_service,
    workspace_id: str,
    document_id: str,
) -> dict:
    """Delete a document and its files.

    Args:
        repo: Document repository.
        kb_service: Knowledge base service.
        workspace_id: Workspace ID.
        document_id: Document ID.

    Returns:
        API response confirming deletion.
    """
    # Delete from S3
    kb_service.delete_document_files(workspace_id, document_id)

    # Delete from DynamoDB
    deleted_ok = repo.delete_document(workspace_id, document_id)
    if not deleted_ok:
        return not_found("document", document_id)

    logger.info(
        "Knowledge base document deleted",
        workspace_id=workspace_id,
        document_id=document_id,
    )

    return success({"deleted": True})


def trigger_sync(kb_service) -> dict:
    """Trigger knowledge base ingestion sync.

    Args:
        kb_service: Knowledge base service.

    Returns:
        API response with sync status.
    """
    result = kb_service.start_ingestion()
    return success(result)


def get_status(repo: DocumentRepository, workspace_id: str) -> dict:
    """Get knowledge base status.

    Args:
        repo: Document repository.
        workspace_id: Workspace ID.

    Returns:
        API response with KB status.
    """
    documents, _ = repo.list_by_workspace(workspace_id, limit=1000)

    total = len(documents)
    indexed = sum(1 for d in documents if d.status == DocumentStatus.INDEXED)
    pending = sum(1 for d in documents if d.status == DocumentStatus.PENDING)
    processing = sum(1 for d in documents if d.status == DocumentStatus.PROCESSING)
    failed = sum(1 for d in documents if d.status == DocumentStatus.FAILED)

    return success({
        "total_documents": total,
        "indexed": indexed,
        "pending": pending,
        "processing": processing,
        "failed": failed,
    })
