"""Knowledge base API handler."""

import json
import os
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
        POST   /workspaces/{ws}/knowledge-base/import-url
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
        elif path.endswith("/import-url") and http_method == "POST":
            return import_from_url(repo, kb_service, workspace_id, event)
        elif path.endswith("/status") and http_method == "GET":
            return get_status(repo, workspace_id, event)
        elif http_method == "GET" and not document_id:
            return list_documents(repo, workspace_id, event)
        elif http_method == "POST" and not document_id:
            return create_document(repo, kb_service, workspace_id, event)
        elif path.endswith("/confirm-upload") and http_method == "POST" and document_id:
            return confirm_upload(repo, workspace_id, document_id)
        elif path.endswith("/content") and http_method == "GET" and document_id:
            return get_document_content(repo, kb_service, workspace_id, document_id)
        elif path.endswith("/content") and http_method == "PUT" and document_id:
            return update_document_content(repo, kb_service, workspace_id, document_id, event)
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
    query_params = event.get("queryStringParameters", {}) or {}
    site_id = query_params.get("site_id")

    if site_id:
        documents, last_key = repo.list_by_site(workspace_id, site_id, limit=100)
    else:
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

    site_id = body.get("site_id")
    document = Document(
        workspace_id=workspace_id,
        site_id=site_id,
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


def import_from_url(
    repo: DocumentRepository,
    kb_service,
    workspace_id: str,
    event: dict,
) -> dict:
    """Import a document from a URL by fetching and extracting its content.

    Args:
        repo: Document repository.
        kb_service: Knowledge base service.
        workspace_id: Workspace ID.
        event: API Gateway event.

    Returns:
        API response with created document.
    """
    from urllib.parse import urlparse

    from complens.services.document_processor import extract_from_url

    # Enforce knowledge_base feature gate
    plan = get_workspace_plan(workspace_id)
    require_feature(plan, "knowledge_base")

    body = json.loads(event.get("body", "{}"))
    url = body.get("url", "").strip()

    if not url or not (url.startswith("http://") or url.startswith("https://")):
        return validation_error([{"loc": ["url"], "msg": "A valid http or https URL is required"}])

    site_id = body.get("site_id")

    # Extract content from URL
    try:
        markdown = extract_from_url(url)
    except Exception as e:
        logger.error("URL extraction failed", url=url, error=str(e))
        return error(f"Failed to fetch URL: {e}", 400)

    if not markdown.strip():
        return error("No content could be extracted from the URL", 400)

    # Derive document name from URL hostname
    parsed = urlparse(url)
    doc_name = parsed.hostname or url

    document = Document(
        workspace_id=workspace_id,
        site_id=site_id,
        name=doc_name,
        content_type="text/html",
        status=DocumentStatus.INDEXED,
    )

    # Store the processed markdown in S3
    file_key = kb_service.get_file_key(workspace_id, document.id, doc_name)
    processed_key = file_key.rsplit("/", 1)[0] + "/processed.md"
    document.file_key = file_key
    document.processed_key = processed_key

    bucket = os.environ.get("KB_DOCUMENTS_BUCKET", "")
    kb_service.put_document_content(bucket, processed_key, markdown)

    document = repo.create_document(document)

    logger.info(
        "Knowledge base document imported from URL",
        workspace_id=workspace_id,
        document_id=document.id,
        url=url,
        name=doc_name,
    )

    return created(document.model_dump(mode="json", by_alias=True))


def confirm_upload(
    repo: DocumentRepository,
    workspace_id: str,
    document_id: str,
) -> dict:
    """Confirm a document upload, process it to markdown, and mark as indexed.

    Args:
        repo: Document repository.
        workspace_id: Workspace ID.
        document_id: Document ID.

    Returns:
        API response with updated document.
    """
    from complens.services.document_processor import process_document

    document = repo.get_by_id(workspace_id, document_id)
    if not document:
        return not_found("document", document_id)

    # Mark as processing
    document.status = DocumentStatus.PROCESSING
    document.update_timestamp()
    repo.update_document(document)

    bucket = os.environ.get("KB_DOCUMENTS_BUCKET", "")

    try:
        processed_key = process_document(
            bucket=bucket,
            file_key=document.file_key,
            content_type=document.content_type,
            name=document.name,
        )
        document.processed_key = processed_key
        document.status = DocumentStatus.INDEXED
    except Exception as e:
        logger.error("Document processing failed", document_id=document_id, error=str(e))
        document.status = DocumentStatus.FAILED
        document.error_message = str(e)

    document.update_timestamp()
    document = repo.update_document(document)

    logger.info(
        "Document upload confirmed",
        workspace_id=workspace_id,
        document_id=document_id,
        status=document.status,
    )

    return success(document.model_dump(mode="json", by_alias=True))


def get_document_content(
    repo: DocumentRepository,
    kb_service,
    workspace_id: str,
    document_id: str,
) -> dict:
    """Get processed markdown content for a document.

    Args:
        repo: Document repository.
        kb_service: Knowledge base service.
        workspace_id: Workspace ID.
        document_id: Document ID.

    Returns:
        API response with document content.
    """
    document = repo.get_by_id(workspace_id, document_id)
    if not document:
        return not_found("document", document_id)

    if not document.processed_key:
        return error("Document has not been processed yet", 400)

    bucket = os.environ.get("KB_DOCUMENTS_BUCKET", "")
    content = kb_service.get_document_content(bucket, document.processed_key)

    return success({
        "document_id": document.id,
        "name": document.name,
        "content": content,
        "status": document.status,
    })


def update_document_content(
    repo: DocumentRepository,
    kb_service,
    workspace_id: str,
    document_id: str,
    event: dict,
) -> dict:
    """Update processed markdown content for a document.

    Args:
        repo: Document repository.
        kb_service: Knowledge base service.
        workspace_id: Workspace ID.
        document_id: Document ID.
        event: API Gateway event.

    Returns:
        API response with updated document.
    """
    document = repo.get_by_id(workspace_id, document_id)
    if not document:
        return not_found("document", document_id)

    if not document.processed_key:
        return error("Document has not been processed yet", 400)

    body = json.loads(event.get("body", "{}"))
    content = body.get("content")
    if content is None:
        return validation_error([{"loc": ["content"], "msg": "Content is required"}])

    bucket = os.environ.get("KB_DOCUMENTS_BUCKET", "")
    kb_service.put_document_content(bucket, document.processed_key, content)

    document.update_timestamp()
    repo.update_document(document)

    logger.info(
        "Document content updated",
        workspace_id=workspace_id,
        document_id=document_id,
    )

    return success({
        "document_id": document.id,
        "name": document.name,
        "status": document.status,
    })


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


def get_status(repo: DocumentRepository, workspace_id: str, event: dict) -> dict:
    """Get knowledge base status.

    Args:
        repo: Document repository.
        workspace_id: Workspace ID.
        event: API Gateway event.

    Returns:
        API response with KB status.
    """
    query_params = event.get("queryStringParameters", {}) or {}
    site_id = query_params.get("site_id")

    if site_id:
        documents, _ = repo.list_by_site(workspace_id, site_id, limit=1000)
    else:
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
