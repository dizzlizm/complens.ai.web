"""Workflow node type definitions."""

from enum import Enum
from typing import Any

from pydantic import BaseModel as PydanticBaseModel, Field


class NodeCategory(str, Enum):
    """Node category enum."""

    TRIGGER = "trigger"
    ACTION = "action"
    LOGIC = "logic"
    AI = "ai"


class NodeType(str, Enum):
    """All available node types."""

    # Triggers
    TRIGGER_FORM_SUBMITTED = "trigger_form_submitted"
    TRIGGER_APPOINTMENT_BOOKED = "trigger_appointment_booked"
    TRIGGER_TAG_ADDED = "trigger_tag_added"
    TRIGGER_SMS_RECEIVED = "trigger_sms_received"
    TRIGGER_EMAIL_RECEIVED = "trigger_email_received"
    TRIGGER_WEBHOOK = "trigger_webhook"
    TRIGGER_SCHEDULE = "trigger_schedule"

    # Actions
    ACTION_SEND_SMS = "action_send_sms"
    ACTION_SEND_EMAIL = "action_send_email"
    ACTION_AI_RESPOND = "action_ai_respond"
    ACTION_UPDATE_CONTACT = "action_update_contact"
    ACTION_WAIT = "action_wait"
    ACTION_WEBHOOK = "action_webhook"
    ACTION_CREATE_TASK = "action_create_task"

    # Logic
    LOGIC_BRANCH = "logic_branch"
    LOGIC_AB_SPLIT = "logic_ab_split"
    LOGIC_FILTER = "logic_filter"
    LOGIC_GOAL = "logic_goal"

    # AI
    AI_DECISION = "ai_decision"
    AI_GENERATE = "ai_generate"
    AI_ANALYZE = "ai_analyze"
    AI_CONVERSATION = "ai_conversation"


# Node type to category mapping
NODE_CATEGORIES: dict[NodeType, NodeCategory] = {
    # Triggers
    NodeType.TRIGGER_FORM_SUBMITTED: NodeCategory.TRIGGER,
    NodeType.TRIGGER_APPOINTMENT_BOOKED: NodeCategory.TRIGGER,
    NodeType.TRIGGER_TAG_ADDED: NodeCategory.TRIGGER,
    NodeType.TRIGGER_SMS_RECEIVED: NodeCategory.TRIGGER,
    NodeType.TRIGGER_EMAIL_RECEIVED: NodeCategory.TRIGGER,
    NodeType.TRIGGER_WEBHOOK: NodeCategory.TRIGGER,
    NodeType.TRIGGER_SCHEDULE: NodeCategory.TRIGGER,
    # Actions
    NodeType.ACTION_SEND_SMS: NodeCategory.ACTION,
    NodeType.ACTION_SEND_EMAIL: NodeCategory.ACTION,
    NodeType.ACTION_AI_RESPOND: NodeCategory.ACTION,
    NodeType.ACTION_UPDATE_CONTACT: NodeCategory.ACTION,
    NodeType.ACTION_WAIT: NodeCategory.ACTION,
    NodeType.ACTION_WEBHOOK: NodeCategory.ACTION,
    NodeType.ACTION_CREATE_TASK: NodeCategory.ACTION,
    # Logic
    NodeType.LOGIC_BRANCH: NodeCategory.LOGIC,
    NodeType.LOGIC_AB_SPLIT: NodeCategory.LOGIC,
    NodeType.LOGIC_FILTER: NodeCategory.LOGIC,
    NodeType.LOGIC_GOAL: NodeCategory.LOGIC,
    # AI
    NodeType.AI_DECISION: NodeCategory.AI,
    NodeType.AI_GENERATE: NodeCategory.AI,
    NodeType.AI_ANALYZE: NodeCategory.AI,
    NodeType.AI_CONVERSATION: NodeCategory.AI,
}


class NodePosition(PydanticBaseModel):
    """Node position on the canvas."""

    x: float = Field(default=0, description="X coordinate")
    y: float = Field(default=0, description="Y coordinate")


class TriggerConfig(PydanticBaseModel):
    """Configuration for trigger nodes."""

    # Form submitted
    form_id: str | None = None

    # Appointment booked
    calendar_id: str | None = None

    # Tag added
    tag_name: str | None = None
    tag_operation: str = Field(default="added", description="added, removed, or any")

    # SMS/Email received
    from_pattern: str | None = None
    body_contains: str | None = None

    # Webhook
    webhook_path: str | None = None
    webhook_secret: str | None = None

    # Schedule
    cron_expression: str | None = None
    timezone: str = Field(default="UTC")


class ActionConfig(PydanticBaseModel):
    """Configuration for action nodes."""

    # Send SMS
    sms_to: str | None = Field(None, description="Phone number or {{contact.phone}}")
    sms_message: str | None = Field(None, description="Message template with variables")

    # Send Email
    email_to: str | None = Field(None, description="Email or {{contact.email}}")
    email_subject: str | None = None
    email_body: str | None = None
    email_template_id: str | None = None

    # AI Respond
    ai_prompt: str | None = None
    ai_model: str = Field(default="claude-3-sonnet")
    ai_max_tokens: int = Field(default=500)
    ai_respond_via: str = Field(default="same_channel", description="same_channel, sms, email")

    # Update Contact
    update_fields: dict = Field(default_factory=dict)
    add_tags: list[str] = Field(default_factory=list)
    remove_tags: list[str] = Field(default_factory=list)

    # Wait
    wait_duration: int | None = Field(None, description="Duration in seconds")
    wait_until: str | None = Field(None, description="ISO datetime to wait until")
    wait_for_event: str | None = Field(None, description="Event type to wait for")

    # Webhook
    webhook_url: str | None = None
    webhook_method: str = Field(default="POST")
    webhook_headers: dict = Field(default_factory=dict)
    webhook_body: dict = Field(default_factory=dict)

    # Create Task
    task_title: str | None = None
    task_description: str | None = None
    task_assigned_to: str | None = None
    task_due_in_hours: int | None = None


class LogicConfig(PydanticBaseModel):
    """Configuration for logic nodes."""

    # Branch (if/else)
    conditions: list[dict] = Field(
        default_factory=list,
        description="List of {field, operator, value, output_handle} conditions",
    )
    default_output: str = Field(default="else", description="Default output handle")

    # A/B Split
    split_percentages: dict[str, int] = Field(
        default_factory=lambda: {"a": 50, "b": 50},
        description="Output handle to percentage mapping",
    )

    # Filter
    filter_conditions: list[dict] = Field(
        default_factory=list, description="Conditions that must all be true to continue"
    )
    filter_operator: str = Field(default="and", description="and/or for combining conditions")

    # Goal
    goal_condition: dict = Field(
        default_factory=dict, description="Condition that marks goal as achieved"
    )
    goal_action: str = Field(default="stop", description="stop, continue, or branch")


class AIConfig(PydanticBaseModel):
    """Configuration for AI nodes."""

    # Common AI settings
    model: str = Field(default="claude-3-sonnet")
    max_tokens: int = Field(default=500)
    temperature: float = Field(default=0.7, ge=0, le=1)
    system_prompt: str | None = None

    # AI Decision
    decision_options: list[dict] = Field(
        default_factory=list,
        description="List of {label, output_handle, description} options",
    )
    decision_prompt: str | None = Field(None, description="Prompt for AI to make decision")

    # AI Generate
    generate_prompt: str | None = None
    generate_output_variable: str = Field(
        default="ai_output", description="Variable name for generated content"
    )
    generate_format: str = Field(default="text", description="text, json, markdown")

    # AI Analyze
    analyze_type: str = Field(default="sentiment", description="sentiment, intent, summary, custom")
    analyze_prompt: str | None = None
    analyze_output_variable: str = Field(default="analysis")

    # AI Conversation
    conversation_context_messages: int = Field(
        default=10, description="Number of previous messages to include"
    )
    conversation_tools: list[dict] = Field(
        default_factory=list, description="Tools available to the AI"
    )


class WorkflowNode(PydanticBaseModel):
    """Workflow node definition - compatible with React Flow.

    This represents a single node in the visual workflow builder.
    """

    id: str = Field(..., description="Unique node ID")
    node_type: str = Field(..., alias="type", description="Node type from NodeType enum")
    position: NodePosition = Field(default_factory=NodePosition, description="Canvas position")

    # Node data (displayed in UI and used for execution)
    data: dict[str, Any] = Field(
        default_factory=dict,
        description="Node data including label, config, and UI state",
    )

    # React Flow properties
    width: int | None = Field(None, description="Node width")
    height: int | None = Field(None, description="Node height")
    selected: bool = Field(default=False, description="Whether node is selected")
    dragging: bool = Field(default=False, description="Whether node is being dragged")

    class Config:
        """Pydantic config."""

        populate_by_name = True

    @property
    def category(self) -> NodeCategory | None:
        """Get the category for this node type."""
        try:
            node_type_enum = NodeType(self.node_type)
            return NODE_CATEGORIES.get(node_type_enum)
        except ValueError:
            return None

    @property
    def label(self) -> str:
        """Get the display label for this node."""
        return self.data.get("label", self.node_type)

    def get_config(self) -> dict:
        """Get the execution configuration from node data."""
        return self.data.get("config", {})

    def validate_config(self) -> list[str]:
        """Validate node configuration.

        Returns a list of validation errors, empty if valid.
        """
        errors = []
        config = self.get_config()

        # Type-specific validation
        if self.node_type == NodeType.ACTION_SEND_SMS.value:
            if not config.get("sms_message"):
                errors.append("SMS message is required")
        elif self.node_type == NodeType.ACTION_SEND_EMAIL.value:
            if not config.get("email_subject"):
                errors.append("Email subject is required")
            if not config.get("email_body") and not config.get("email_template_id"):
                errors.append("Email body or template is required")
        elif self.node_type == NodeType.ACTION_WAIT.value:
            if not config.get("wait_duration") and not config.get("wait_until"):
                errors.append("Wait duration or target time is required")
        elif self.node_type == NodeType.LOGIC_BRANCH.value:
            if not config.get("conditions"):
                errors.append("At least one branch condition is required")
        elif self.node_type == NodeType.TRIGGER_SCHEDULE.value:
            if not config.get("cron_expression"):
                errors.append("Cron expression is required for scheduled triggers")

        return errors
