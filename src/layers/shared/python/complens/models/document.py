"""Document model for knowledge base documents."""

from enum import Enum
from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.base import BaseModel


class DocumentStatus(str, Enum):
    """Document processing status."""

    PENDING = "pending"
    PROCESSING = "processing"
    INDEXED = "indexed"
    FAILED = "failed"


class Document(BaseModel):
    """Knowledge base document entity.

    Key Pattern:
        PK: WS#{workspace_id}
        SK: DOC#{id}
        GSI1PK: WS#{workspace_id}#DOCS
        GSI1SK: {status}#{name}
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "DOC#"

    workspace_id: str = Field(..., description="Owning workspace ID")
    site_id: str | None = Field(None, description="Parent site ID (None for unassigned documents)")
    name: str = Field(..., min_length=1, max_length=255, description="Document name")
    file_key: str = Field(default="", description="S3 object key")
    processed_key: str = Field(default="", description="S3 key for processed markdown")
    file_size: int = Field(default=0, description="File size in bytes")
    content_type: str = Field(default="", description="MIME type")
    status: DocumentStatus = Field(default=DocumentStatus.PENDING, description="Processing status")
    error_message: str | None = Field(None, description="Error message if processing failed")

    def get_pk(self) -> str:
        """Get partition key: WS#{workspace_id}."""
        return f"WS#{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key: DOC#{id}."""
        return f"DOC#{self.id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for listing documents."""
        return {
            "GSI1PK": f"WS#{self.workspace_id}#DOCS",
            "GSI1SK": f"{self.status}#{self.name}",
        }


class CreateDocumentRequest(PydanticBaseModel):
    """Request model for creating a document (with presigned upload URL)."""

    name: str = Field(..., min_length=1, max_length=255)
    content_type: str = Field(..., description="MIME type of the file")
    file_size: int = Field(..., gt=0, le=52428800, description="File size in bytes (max 50MB)")
