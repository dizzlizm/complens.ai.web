"""Pydantic models for Complens entities."""

from complens.models.base import BaseModel, TimestampMixin
from complens.models.contact import Contact, CreateContactRequest, UpdateContactRequest
from complens.models.conversation import Conversation, CreateConversationRequest
from complens.models.message import Message, CreateMessageRequest, MessageDirection, MessageChannel
from complens.models.workflow import (
    Workflow,
    WorkflowEdge,
    WorkflowStatus,
    CreateWorkflowRequest,
    UpdateWorkflowRequest,
)
from complens.models.workflow_node import (
    WorkflowNode,
    NodeType,
    NodeCategory,
    TriggerConfig,
    ActionConfig,
    LogicConfig,
    AIConfig,
)
from complens.models.workflow_run import WorkflowRun, WorkflowStep, RunStatus, StepStatus
from complens.models.workspace import Workspace, CreateWorkspaceRequest, UpdateWorkspaceRequest

__all__ = [
    # Base
    "BaseModel",
    "TimestampMixin",
    # Contact
    "Contact",
    "CreateContactRequest",
    "UpdateContactRequest",
    # Conversation
    "Conversation",
    "CreateConversationRequest",
    # Message
    "Message",
    "CreateMessageRequest",
    "MessageDirection",
    "MessageChannel",
    # Workflow
    "Workflow",
    "WorkflowEdge",
    "WorkflowStatus",
    "CreateWorkflowRequest",
    "UpdateWorkflowRequest",
    # Workflow Node
    "WorkflowNode",
    "NodeType",
    "NodeCategory",
    "TriggerConfig",
    "ActionConfig",
    "LogicConfig",
    "AIConfig",
    # Workflow Run
    "WorkflowRun",
    "WorkflowStep",
    "RunStatus",
    "StepStatus",
    # Workspace
    "Workspace",
    "CreateWorkspaceRequest",
    "UpdateWorkspaceRequest",
]
