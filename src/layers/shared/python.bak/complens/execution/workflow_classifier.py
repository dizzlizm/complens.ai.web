"""Workflow classifier for Step Functions execution type selection.

Analyzes workflow structure to automatically select the optimal
Step Functions execution type:
- Express: <5 min, simple automations without waits
- Standard: 5-60 min, complex flows with external APIs
- Batch: >60 min, long waits and scheduled tasks

Express workflows are cheaper and faster but have limitations:
- Max 5 minute duration
- No callback patterns
- Limited state history

Standard workflows support:
- Up to 1 year duration
- Callback patterns for async operations
- Full state history

Usage:
    classifier = WorkflowClassifier()
    execution_type = classifier.classify_workflow(workflow)

    if execution_type == ExecutionType.EXPRESS:
        # Use Express Step Functions
        pass
    else:
        # Use Standard Step Functions
        pass
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import structlog

logger = structlog.get_logger()


class ExecutionType(str, Enum):
    """Step Functions execution types."""

    EXPRESS = "express"  # Fast, cheap, <5 min
    STANDARD = "standard"  # Long-running, async patterns
    BATCH = "batch"  # Very long, scheduled


@dataclass
class WorkflowAnalysis:
    """Analysis results for a workflow."""

    # Recommended execution type
    execution_type: ExecutionType

    # Reasons for the classification
    reasons: list[str] = field(default_factory=list)

    # Workflow characteristics
    has_wait_nodes: bool = False
    has_long_waits: bool = False
    has_external_calls: bool = False
    has_ai_nodes: bool = False
    has_callbacks: bool = False

    # Estimated metrics
    estimated_duration_seconds: float = 0.0
    node_count: int = 0
    external_call_count: int = 0

    # Override if explicitly set
    manual_override: ExecutionType | None = None


# Node types that require Standard execution
STANDARD_REQUIRED_NODES = {
    # Waits always require standard (unless very short)
    "action_wait",
    # Callback patterns
    "action_wait_for_response",
    "action_wait_for_webhook",
}

# Node types that strongly suggest Standard
STANDARD_PREFERRED_NODES = {
    # External API calls may take time
    "action_webhook",
    # AI nodes can be slow under load
    "ai_decision",
    "ai_generate",
    "ai_analyze",
    "action_ai_respond",
}

# Node types suitable for Express
EXPRESS_COMPATIBLE_NODES = {
    # Triggers
    "trigger_form_submitted",
    "trigger_chat_message",
    "trigger_tag_added",
    "trigger_webhook",
    "trigger_schedule",
    "trigger_segment_event",
    # Logic nodes
    "logic_branch",
    "logic_ab_split",
    "logic_filter",
    # Quick actions
    "action_update_contact",
    "action_send_email",
    "action_send_sms",
}

# Estimated execution times by node type (seconds)
NODE_EXECUTION_TIMES = {
    # Triggers are instant
    "trigger_form_submitted": 0.1,
    "trigger_chat_message": 0.1,
    "trigger_tag_added": 0.1,
    "trigger_webhook": 0.1,
    "trigger_schedule": 0.1,
    "trigger_segment_event": 0.1,
    # Logic nodes are fast
    "logic_branch": 0.1,
    "logic_ab_split": 0.1,
    "logic_filter": 0.1,
    # Database operations
    "action_update_contact": 0.5,
    # Messaging (external API calls)
    "action_send_email": 2.0,
    "action_send_sms": 2.0,
    # External webhooks
    "action_webhook": 5.0,
    # AI operations (can be slow)
    "ai_decision": 10.0,
    "ai_generate": 15.0,
    "ai_analyze": 10.0,
    "action_ai_respond": 20.0,
}

# Express max duration in seconds (5 minutes)
EXPRESS_MAX_DURATION = 5 * 60

# Threshold for "long" wait (forces Standard)
LONG_WAIT_THRESHOLD = 60  # 60 seconds

# Batch threshold (very long waits)
BATCH_THRESHOLD = 60 * 60  # 1 hour


class WorkflowClassifier:
    """Classifies workflows for optimal Step Functions execution.

    Analyzes workflow structure to determine whether to use
    Express or Standard Step Functions.

    Example:
        classifier = WorkflowClassifier()

        # Classify a workflow
        analysis = classifier.classify_workflow(workflow)

        print(f"Execution type: {analysis.execution_type}")
        print(f"Reasons: {analysis.reasons}")

        # Or just get the type
        exec_type = classifier.get_execution_type(workflow)
    """

    def __init__(self):
        """Initialize the workflow classifier."""
        self.logger = logger.bind(service="workflow_classifier")

    def classify_workflow(self, workflow: Any) -> WorkflowAnalysis:
        """Classify a workflow and return detailed analysis.

        Args:
            workflow: Workflow model instance.

        Returns:
            WorkflowAnalysis with classification and details.
        """
        analysis = WorkflowAnalysis(execution_type=ExecutionType.EXPRESS)
        reasons = []

        # Check for manual override in workflow settings
        settings = getattr(workflow, "settings", {}) or {}
        if "execution_type" in settings:
            override = settings["execution_type"]
            if override in [e.value for e in ExecutionType]:
                analysis.manual_override = ExecutionType(override)
                analysis.execution_type = analysis.manual_override
                analysis.reasons = [f"Manual override: {override}"]
                return analysis

        # Analyze nodes
        nodes = self._get_workflow_nodes(workflow)
        analysis.node_count = len(nodes)

        for node in nodes:
            node_type = self._get_node_type(node)
            node_config = self._get_node_config(node)

            # Check for wait nodes
            if node_type == "action_wait":
                analysis.has_wait_nodes = True
                wait_seconds = self._get_wait_duration(node_config)

                if wait_seconds >= BATCH_THRESHOLD:
                    analysis.has_long_waits = True
                    reasons.append(f"Very long wait: {wait_seconds}s")
                elif wait_seconds >= LONG_WAIT_THRESHOLD:
                    analysis.has_long_waits = True
                    reasons.append(f"Long wait: {wait_seconds}s")

                analysis.estimated_duration_seconds += wait_seconds

            # Check for callback patterns
            if node_type in ("action_wait_for_response", "action_wait_for_webhook"):
                analysis.has_callbacks = True
                reasons.append(f"Callback pattern: {node_type}")

            # Check for external calls
            if node_type in ("action_webhook", "action_send_email", "action_send_sms"):
                analysis.has_external_calls = True
                analysis.external_call_count += 1

            # Check for AI nodes
            if node_type.startswith("ai_") or node_type == "action_ai_respond":
                analysis.has_ai_nodes = True

            # Add estimated execution time
            estimated_time = NODE_EXECUTION_TIMES.get(node_type, 1.0)
            analysis.estimated_duration_seconds += estimated_time

        # Determine execution type based on analysis
        if analysis.has_long_waits and any(
            self._get_wait_duration(self._get_node_config(n)) >= BATCH_THRESHOLD
            for n in nodes
            if self._get_node_type(n) == "action_wait"
        ):
            analysis.execution_type = ExecutionType.BATCH
            reasons.append("Contains very long waits (>1 hour)")

        elif analysis.has_callbacks:
            analysis.execution_type = ExecutionType.STANDARD
            reasons.append("Uses callback patterns")

        elif analysis.has_long_waits:
            analysis.execution_type = ExecutionType.STANDARD
            reasons.append("Contains long waits (>60s)")

        elif analysis.estimated_duration_seconds > EXPRESS_MAX_DURATION:
            analysis.execution_type = ExecutionType.STANDARD
            reasons.append(
                f"Estimated duration {analysis.estimated_duration_seconds:.0f}s > 5 min"
            )

        elif analysis.has_ai_nodes and analysis.node_count > 3:
            # Multiple AI nodes can be slow
            analysis.execution_type = ExecutionType.STANDARD
            reasons.append("Multiple AI nodes may exceed Express limits")

        elif analysis.external_call_count > 5:
            # Many external calls can add up
            analysis.execution_type = ExecutionType.STANDARD
            reasons.append(f"{analysis.external_call_count} external calls")

        else:
            analysis.execution_type = ExecutionType.EXPRESS
            reasons.append("Simple workflow suitable for Express")

        analysis.reasons = reasons

        self.logger.info(
            "Workflow classified",
            workflow_id=getattr(workflow, "id", "unknown"),
            execution_type=analysis.execution_type.value,
            node_count=analysis.node_count,
            estimated_duration=analysis.estimated_duration_seconds,
            reasons=reasons,
        )

        return analysis

    def get_execution_type(self, workflow: Any) -> ExecutionType:
        """Get the recommended execution type for a workflow.

        Convenience method that returns just the execution type.

        Args:
            workflow: Workflow model instance.

        Returns:
            ExecutionType (EXPRESS, STANDARD, or BATCH).
        """
        analysis = self.classify_workflow(workflow)
        return analysis.execution_type

    def _get_workflow_nodes(self, workflow: Any) -> list[dict]:
        """Get nodes from a workflow.

        Args:
            workflow: Workflow model instance.

        Returns:
            List of node dictionaries.
        """
        # Handle different workflow formats
        if hasattr(workflow, "nodes"):
            nodes = workflow.nodes
            if isinstance(nodes, list):
                return nodes
            if isinstance(nodes, dict):
                return list(nodes.values())

        if hasattr(workflow, "definition"):
            definition = workflow.definition
            if isinstance(definition, dict):
                return definition.get("nodes", [])

        return []

    def _get_node_type(self, node: dict | Any) -> str:
        """Get node type from a node.

        Args:
            node: Node dictionary or object.

        Returns:
            Node type string.
        """
        if isinstance(node, dict):
            return node.get("type", node.get("node_type", ""))

        return getattr(node, "type", getattr(node, "node_type", ""))

    def _get_node_config(self, node: dict | Any) -> dict:
        """Get configuration from a node.

        Args:
            node: Node dictionary or object.

        Returns:
            Node configuration dict.
        """
        if isinstance(node, dict):
            return node.get("config", node.get("data", {}))

        return getattr(node, "config", getattr(node, "data", {}))

    def _get_wait_duration(self, config: dict) -> float:
        """Get wait duration from a wait node config.

        Args:
            config: Node configuration.

        Returns:
            Wait duration in seconds.
        """
        # Check for explicit seconds
        if "wait_seconds" in config:
            return float(config["wait_seconds"])

        if "seconds" in config:
            return float(config["seconds"])

        # Check for time components
        duration = 0.0

        if "days" in config:
            duration += float(config["days"]) * 86400

        if "hours" in config:
            duration += float(config["hours"]) * 3600

        if "minutes" in config:
            duration += float(config["minutes"]) * 60

        if "seconds" in config:
            duration += float(config["seconds"])

        # If duration string
        if "duration" in config:
            duration_str = config["duration"]
            duration = self._parse_duration_string(duration_str)

        return duration if duration > 0 else 60.0  # Default 1 minute

    def _parse_duration_string(self, duration: str) -> float:
        """Parse a duration string like "1h30m" or "5m".

        Args:
            duration: Duration string.

        Returns:
            Duration in seconds.
        """
        import re

        total = 0.0

        # Match patterns like "1d", "2h", "30m", "45s"
        patterns = [
            (r"(\d+(?:\.\d+)?)\s*d", 86400),  # days
            (r"(\d+(?:\.\d+)?)\s*h", 3600),  # hours
            (r"(\d+(?:\.\d+)?)\s*m", 60),  # minutes
            (r"(\d+(?:\.\d+)?)\s*s", 1),  # seconds
        ]

        for pattern, multiplier in patterns:
            match = re.search(pattern, duration.lower())
            if match:
                total += float(match.group(1)) * multiplier

        # If no patterns matched, try parsing as seconds
        if total == 0:
            try:
                total = float(duration)
            except ValueError:
                pass

        return total


# Singleton instance
_workflow_classifier: WorkflowClassifier | None = None


def get_workflow_classifier() -> WorkflowClassifier:
    """Get the global WorkflowClassifier instance.

    Returns:
        WorkflowClassifier instance.
    """
    global _workflow_classifier
    if _workflow_classifier is None:
        _workflow_classifier = WorkflowClassifier()
    return _workflow_classifier


def classify_workflow(workflow: Any) -> ExecutionType:
    """Convenience function to classify a workflow.

    Args:
        workflow: Workflow model instance.

    Returns:
        ExecutionType for the workflow.
    """
    classifier = get_workflow_classifier()
    return classifier.get_execution_type(workflow)
