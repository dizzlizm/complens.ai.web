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
from complens.models.page import (
    Page,
    PageStatus,
    ChatConfig,
    CreatePageRequest,
    UpdatePageRequest,
)
from complens.models.form import (
    Form,
    FormField,
    FormFieldType,
    FormSubmission,
    CreateFormRequest,
    UpdateFormRequest,
    SubmitFormRequest,
)
from complens.models.domain import (
    DomainSetup,
    DomainStatus,
    CreateDomainRequest,
    DomainStatusResponse,
)
from complens.models.synthesis import (
    SynthesisResult,
    SynthesizePageRequest,
    PageIntent,
    PageGoal,
    ContentAssessment,
    BlockPlan,
    DesignSystem,
    SynthesisMetadata,
)
from complens.models.block_schemas import (
    BLOCK_SCHEMAS,
    validate_block_config,
    DEFAULT_BLOCK_CONFIGS,
)
from complens.models.warmup_domain import (
    WarmupDomain,
    WarmupStatus,
    StartWarmupRequest,
    WarmupStatusResponse,
    DEFAULT_WARMUP_SCHEDULE,
)
from complens.models.deferred_email import DeferredEmail

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
    # Page
    "Page",
    "PageStatus",
    "ChatConfig",
    "CreatePageRequest",
    "UpdatePageRequest",
    # Form
    "Form",
    "FormField",
    "FormFieldType",
    "FormSubmission",
    "CreateFormRequest",
    "UpdateFormRequest",
    "SubmitFormRequest",
    # Domain
    "DomainSetup",
    "DomainStatus",
    "CreateDomainRequest",
    "DomainStatusResponse",
    # Synthesis
    "SynthesisResult",
    "SynthesizePageRequest",
    "PageIntent",
    "PageGoal",
    "ContentAssessment",
    "BlockPlan",
    "DesignSystem",
    "SynthesisMetadata",
    # Block Schemas
    "BLOCK_SCHEMAS",
    "validate_block_config",
    "DEFAULT_BLOCK_CONFIGS",
    # Warmup Domain
    "WarmupDomain",
    "WarmupStatus",
    "StartWarmupRequest",
    "WarmupStatusResponse",
    "DEFAULT_WARMUP_SCHEDULE",
    # Deferred Email
    "DeferredEmail",
]
