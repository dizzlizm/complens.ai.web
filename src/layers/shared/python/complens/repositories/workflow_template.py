"""Repository for workflow template operations."""

import structlog

from complens.models.workflow_template import WorkflowTemplate
from complens.repositories.base import BaseRepository

logger = structlog.get_logger()


class WorkflowTemplateRepository(BaseRepository[WorkflowTemplate]):
    """Repository for custom workflow templates."""

    def __init__(self, table_name: str | None = None):
        """Initialize workflow template repository.

        Args:
            table_name: DynamoDB table name.
        """
        super().__init__(WorkflowTemplate, table_name)

    def get_by_id(self, workspace_id: str, template_id: str) -> WorkflowTemplate | None:
        """Get a template by ID.

        Args:
            workspace_id: Workspace ID.
            template_id: Template ID.

        Returns:
            Template or None if not found.
        """
        return self.get(pk=f"WS#{workspace_id}", sk=f"TEMPLATE#{template_id}")

    def list_by_workspace(
        self,
        workspace_id: str,
        category: str | None = None,
        limit: int = 100,
        last_key: dict | None = None,
    ) -> tuple[list[WorkflowTemplate], dict | None]:
        """List templates for a workspace.

        Args:
            workspace_id: Workspace ID.
            category: Optional category filter.
            limit: Maximum items to return.
            last_key: Pagination key.

        Returns:
            Tuple of (templates, last_evaluated_key).
        """
        sk_prefix = f"{category}#" if category else None
        return self.query(
            pk=f"WS#{workspace_id}#TEMPLATES",
            sk_begins_with=sk_prefix,
            index_name="GSI1",
            limit=limit,
            last_key=last_key,
        )

    def create_template(self, template: WorkflowTemplate) -> WorkflowTemplate:
        """Create a new template.

        Args:
            template: Template to create.

        Returns:
            Created template.
        """
        gsi_keys = template.get_gsi1_keys()
        return self.create(template, gsi_keys=gsi_keys)

    def delete_template(self, workspace_id: str, template_id: str) -> bool:
        """Delete a template.

        Args:
            workspace_id: Workspace ID.
            template_id: Template ID.

        Returns:
            True if deleted.
        """
        return self.delete(pk=f"WS#{workspace_id}", sk=f"TEMPLATE#{template_id}")
