"""Workflow template model for reusable workflow patterns."""

from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.base import BaseModel


class WorkflowTemplate(BaseModel):
    """Custom workflow template saved by a workspace.

    Key Pattern:
        PK: WS#{workspace_id}
        SK: TEMPLATE#{id}
        GSI1PK: WS#{workspace_id}#TEMPLATES
        GSI1SK: {category}#{name}
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "TEMPLATE#"

    workspace_id: str = Field(..., description="Owning workspace ID")
    name: str = Field(..., min_length=1, max_length=255, description="Template name")
    description: str = Field(default="", max_length=1000, description="Template description")
    category: str = Field(
        default="automation",
        description="Template category",
    )
    icon: str = Field(default="git-branch", description="Icon identifier")
    nodes: list[dict] = Field(default_factory=list, description="Workflow node definitions")
    edges: list[dict] = Field(default_factory=list, description="Workflow edge definitions")

    def get_pk(self) -> str:
        """Get partition key: WS#{workspace_id}."""
        return f"WS#{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key: TEMPLATE#{id}."""
        return f"TEMPLATE#{self.id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for listing templates by category."""
        return {
            "GSI1PK": f"WS#{self.workspace_id}#TEMPLATES",
            "GSI1SK": f"{self.category}#{self.name}",
        }


class CreateWorkflowTemplateRequest(PydanticBaseModel):
    """Request model for creating a workflow template."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=1000)
    category: str = Field(default="automation")
    icon: str = Field(default="git-branch")
    nodes: list[dict] = Field(default_factory=list)
    edges: list[dict] = Field(default_factory=list)
    source_workflow_id: str | None = Field(None, description="Workflow ID to copy from")
