"""Knowledge base service for document management and Bedrock KB retrieval."""

import os
from typing import Any

import boto3
import structlog

logger = structlog.get_logger()


class KnowledgeBaseService:
    """Service for managing knowledge base documents and retrieval."""

    def __init__(self) -> None:
        """Initialize knowledge base service."""
        self._s3 = None
        self._bedrock_agent = None

    @property
    def s3(self):
        """Get S3 client (lazy initialization)."""
        if self._s3 is None:
            self._s3 = boto3.client("s3")
        return self._s3

    @property
    def bedrock_agent(self):
        """Get Bedrock Agent Runtime client (lazy initialization)."""
        if self._bedrock_agent is None:
            self._bedrock_agent = boto3.client("bedrock-agent-runtime")
        return self._bedrock_agent

    def generate_upload_url(
        self,
        workspace_id: str,
        document_id: str,
        content_type: str,
        file_name: str,
        site_id: str | None = None,
    ) -> str:
        """Generate a presigned URL for document upload.

        Args:
            workspace_id: Workspace ID.
            document_id: Document ID.
            content_type: MIME type.
            file_name: Original file name.
            site_id: Optional site ID for site-scoped documents.

        Returns:
            Presigned upload URL.
        """
        bucket = os.environ.get("KB_DOCUMENTS_BUCKET", "")
        key = f"workspaces/{workspace_id}/documents/{document_id}/{file_name}"

        metadata = {
            "workspace_id": workspace_id,
            "document_id": document_id,
        }
        if site_id:
            metadata["site_id"] = site_id

        url = self.s3.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": bucket,
                "Key": key,
                "ContentType": content_type,
                "Metadata": metadata,
            },
            ExpiresIn=3600,
        )

        return url

    def get_file_key(
        self,
        workspace_id: str,
        document_id: str,
        file_name: str,
    ) -> str:
        """Get the S3 key for a document.

        Args:
            workspace_id: Workspace ID.
            document_id: Document ID.
            file_name: Original file name.

        Returns:
            S3 object key.
        """
        return f"workspaces/{workspace_id}/documents/{document_id}/{file_name}"

    def delete_document_files(
        self,
        workspace_id: str,
        document_id: str,
    ) -> None:
        """Delete all files for a document from S3.

        Args:
            workspace_id: Workspace ID.
            document_id: Document ID.
        """
        bucket = os.environ.get("KB_DOCUMENTS_BUCKET", "")
        prefix = f"workspaces/{workspace_id}/documents/{document_id}/"

        try:
            response = self.s3.list_objects_v2(Bucket=bucket, Prefix=prefix)
            objects = response.get("Contents", [])

            if objects:
                delete_keys = [{"Key": obj["Key"]} for obj in objects]
                self.s3.delete_objects(
                    Bucket=bucket,
                    Delete={"Objects": delete_keys},
                )

            logger.info(
                "Document files deleted",
                workspace_id=workspace_id,
                document_id=document_id,
                count=len(objects),
            )
        except Exception as e:
            logger.error("Failed to delete document files", error=str(e))

    def get_document_content(self, bucket: str, processed_key: str) -> str:
        """Read markdown content from S3.

        Args:
            bucket: S3 bucket name.
            processed_key: S3 key for the processed markdown file.

        Returns:
            Markdown content string.
        """
        response = self.s3.get_object(Bucket=bucket, Key=processed_key)
        return response["Body"].read().decode("utf-8")

    def put_document_content(self, bucket: str, processed_key: str, content: str) -> None:
        """Write markdown content to S3.

        Args:
            bucket: S3 bucket name.
            processed_key: S3 key for the processed markdown file.
            content: Markdown content to write.
        """
        self.s3.put_object(
            Bucket=bucket,
            Key=processed_key,
            Body=content.encode("utf-8"),
            ContentType="text/markdown",
        )

    def retrieve(
        self,
        workspace_id: str,
        query: str,
        max_results: int = 5,
        site_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Retrieve relevant documents from Bedrock Knowledge Base.

        Args:
            workspace_id: Workspace ID for metadata filtering.
            query: Search query.
            max_results: Maximum results to return.
            site_id: Optional site ID for site-scoped retrieval.

        Returns:
            List of retrieval results with text and metadata.
        """
        kb_id = os.environ.get("KNOWLEDGE_BASE_ID", "")
        if not kb_id:
            logger.warning("KNOWLEDGE_BASE_ID not configured")
            return []

        # Build metadata filter — scope to site when provided
        metadata_filter: dict = {
            "equals": {"key": "workspace_id", "value": workspace_id},
        }
        if site_id:
            metadata_filter = {
                "andAll": [
                    {"equals": {"key": "workspace_id", "value": workspace_id}},
                    {"equals": {"key": "site_id", "value": site_id}},
                ],
            }

        try:
            response = self.bedrock_agent.retrieve(
                knowledgeBaseId=kb_id,
                retrievalQuery={"text": query},
                retrievalConfiguration={
                    "vectorSearchConfiguration": {
                        "numberOfResults": max_results,
                        "filter": metadata_filter,
                    },
                },
            )

            results = []
            for result in response.get("retrievalResults", []):
                content = result.get("content", {})
                metadata = result.get("metadata", {})
                score = result.get("score", 0)

                results.append({
                    "text": content.get("text", ""),
                    "source": metadata.get("source", ""),
                    "score": score,
                })

            return results

        except Exception as e:
            logger.error("Knowledge base retrieval failed", error=str(e))
            return []

    def start_ingestion(self) -> dict:
        """Trigger knowledge base data source ingestion.

        Returns:
            Ingestion job details.
        """
        kb_id = os.environ.get("KNOWLEDGE_BASE_ID", "")
        data_source_id = os.environ.get("KB_DATA_SOURCE_ID", "")

        if not kb_id or not data_source_id:
            return {"status": "not_configured"}

        try:
            client = boto3.client("bedrock-agent")
            response = client.start_ingestion_job(
                knowledgeBaseId=kb_id,
                dataSourceId=data_source_id,
            )

            job = response.get("ingestionJob", {})
            return {
                "status": "started",
                "job_id": job.get("ingestionJobId"),
            }
        except Exception as e:
            logger.error("Failed to start ingestion", error=str(e))
            return {"status": "error", "message": str(e)}


def get_knowledge_base_service() -> KnowledgeBaseService:
    """Get knowledge base service instance.

    Returns:
        KnowledgeBaseService instance.
    """
    return KnowledgeBaseService()
