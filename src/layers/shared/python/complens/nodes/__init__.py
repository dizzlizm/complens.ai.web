"""Workflow node implementations."""

from complens.nodes.base import BaseNode, NodeContext, NodeResult
from complens.nodes.triggers import (
    FormSubmittedTrigger,
    AppointmentBookedTrigger,
    TagAddedTrigger,
    SmsReceivedTrigger,
    WebhookTrigger,
    ScheduleTrigger,
)
from complens.nodes.actions import (
    SendSmsAction,
    SendEmailAction,
    AIRespondAction,
    UpdateContactAction,
    WaitAction,
    WebhookAction,
    CreateTaskAction,
)
from complens.nodes.logic import (
    BranchNode,
    ABSplitNode,
    FilterNode,
    GoalNode,
)
from complens.nodes.ai_nodes import (
    AIDecisionNode,
    AIGenerateNode,
    AIAnalyzeNode,
    AIConversationNode,
)

__all__ = [
    # Base
    "BaseNode",
    "NodeContext",
    "NodeResult",
    # Triggers
    "FormSubmittedTrigger",
    "AppointmentBookedTrigger",
    "TagAddedTrigger",
    "SmsReceivedTrigger",
    "WebhookTrigger",
    "ScheduleTrigger",
    # Actions
    "SendSmsAction",
    "SendEmailAction",
    "AIRespondAction",
    "UpdateContactAction",
    "WaitAction",
    "WebhookAction",
    "CreateTaskAction",
    # Logic
    "BranchNode",
    "ABSplitNode",
    "FilterNode",
    "GoalNode",
    # AI
    "AIDecisionNode",
    "AIGenerateNode",
    "AIAnalyzeNode",
    "AIConversationNode",
]
