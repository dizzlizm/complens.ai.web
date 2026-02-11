"""Repository for knowledge base document operations."""

import structlog

from complens.models.document import Document
from complens.repositories.base import BaseRepository

logger = structlog.get_logger()


class DocumentRepository(BaseRepository[Document]):
    """Repository for knowledge base documents."""

    def __init__(self, table_name: str | None = None):
        """Initialize document repository.

        Args:
            table_name: DynamoDB table name.
        """
        super().__init__(Document, table_name)

    def get_by_id(self, workspace_id: str, document_id: str) -> Document | None:
        """Get a document by ID.

        Args:
            workspace_id: Workspace ID.
            document_id: Document ID.

        Returns:
            Document or None if not found.
        """
        return self.get(pk=f"WS#{workspace_id}", sk=f"DOC#{document_id}")

    def list_by_site(
        self,
        workspace_id: str,
        site_id: str,
        limit: int = 100,
        last_key: dict | None = None,
    ) -> tuple[list[Document], dict | None]:
        """List documents for a specific site.

        Uses FilterExpression on the workspace partition to find documents
        with a matching site_id.

        Args:
            workspace_id: Workspace ID.
            site_id: Site ID.
            limit: Maximum items to return.
            last_key: Pagination key.

        Returns:
            Tuple of (documents, last_evaluated_key).
        """
        return self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="DOC#",
            limit=limit,
            last_key=last_key,
            filter_expression="site_id = :site_id",
            expression_values={":site_id": site_id},
        )

    def list_by_workspace(
        self,
        workspace_id: str,
        status: str | None = None,
        limit: int = 100,
        last_key: dict | None = None,
    ) -> tuple[list[Document], dict | None]:
        """List documents for a workspace.

        Args:
            workspace_id: Workspace ID.
            status: Optional status filter.
            limit: Maximum items to return.
            last_key: Pagination key.

        Returns:
            Tuple of (documents, last_evaluated_key).
        """
        sk_prefix = f"{status}#" if status else None
        return self.query(
            pk=f"WS#{workspace_id}#DOCS",
            sk_begins_with=sk_prefix,
            index_name="GSI1",
            limit=limit,
            last_key=last_key,
        )

    def create_document(self, document: Document) -> Document:
        """Create a new document.

        Args:
            document: Document to create.

        Returns:
            Created document.
        """
        gsi_keys = document.get_gsi1_keys()
        return self.create(document, gsi_keys=gsi_keys)

    def update_document(self, document: Document) -> Document:
        """Update a document.

        Args:
            document: Document to update.

        Returns:
            Updated document.
        """
        gsi_keys = document.get_gsi1_keys()
        return self.update(document, gsi_keys=gsi_keys)

    def delete_document(self, workspace_id: str, document_id: str) -> bool:
        """Delete a document.

        Args:
            workspace_id: Workspace ID.
            document_id: Document ID.

        Returns:
            True if deleted.
        """
        return self.delete(pk=f"WS#{workspace_id}", sk=f"DOC#{document_id}")
