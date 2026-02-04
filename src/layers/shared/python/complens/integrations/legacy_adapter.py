"""Legacy adapter for backward compatibility.

Maps legacy node types (action_send_sms) to new provider format (twilio.send_sms)
while preserving existing workflow behavior.
"""

from typing import Any

import structlog

from complens.integrations.base_provider import ActionInput, ProviderCredentials
from complens.integrations.registry import ProviderRegistry, get_provider_registry
from complens.nodes.base import BaseNode, NodeContext, NodeResult

logger = structlog.get_logger()


# Mapping from legacy node types to provider.action format
LEGACY_TO_PROVIDER: dict[str, tuple[str, str]] = {
    # SMS actions
    "action_send_sms": ("twilio", "send_sms"),
    # Email actions
    "action_send_email": ("ses", "send_email"),
}

# Mapping from legacy config keys to provider config keys
CONFIG_KEY_MAPPINGS: dict[str, dict[str, str]] = {
    "action_send_sms": {
        "sms_message": "body",
        "sms_to": "to",
        "sms_from": "from_number",
    },
    "action_send_email": {
        "email_to": "to",
        "email_subject": "subject",
        "email_body": "body_text",
        "email_body_html": "body_html",
        "email_from": "from_email",
    },
}


def is_legacy_node_type(node_type: str) -> bool:
    """Check if a node type is a legacy format.

    Args:
        node_type: Node type string.

    Returns:
        True if this is a legacy node type that can be adapted.
    """
    return node_type in LEGACY_TO_PROVIDER


def get_provider_for_legacy(node_type: str) -> tuple[str, str] | None:
    """Get the provider and action ID for a legacy node type.

    Args:
        node_type: Legacy node type (e.g., 'action_send_sms').

    Returns:
        Tuple of (provider_id, action_id) or None if not a legacy type.
    """
    return LEGACY_TO_PROVIDER.get(node_type)


def adapt_config(node_type: str, config: dict[str, Any]) -> dict[str, Any]:
    """Adapt legacy config keys to provider config format.

    Args:
        node_type: Legacy node type.
        config: Legacy configuration.

    Returns:
        Configuration with keys adapted for the provider.
    """
    mappings = CONFIG_KEY_MAPPINGS.get(node_type, {})
    adapted = {}

    for key, value in config.items():
        # Check if this key has a mapping
        new_key = mappings.get(key, key)
        adapted[new_key] = value

    return adapted


class LegacyNodeAdapter(BaseNode):
    """Adapter that wraps legacy node execution through the provider system.

    This allows existing workflows using legacy node types to continue
    working while using the new provider infrastructure.
    """

    def __init__(
        self,
        node_id: str,
        config: dict[str, Any],
        legacy_node_type: str,
    ):
        """Initialize the adapter.

        Args:
            node_id: Node ID.
            config: Node configuration.
            legacy_node_type: The original legacy node type.
        """
        super().__init__(node_id, config)
        self.legacy_node_type = legacy_node_type
        self.node_type = legacy_node_type

        # Get provider info
        provider_info = get_provider_for_legacy(legacy_node_type)
        if provider_info:
            self.provider_id, self.action_id = provider_info
        else:
            self.provider_id = None
            self.action_id = None

        self.logger = logger.bind(
            node_id=node_id,
            legacy_type=legacy_node_type,
            provider_id=self.provider_id,
            action_id=self.action_id,
        )

    async def execute(self, context: NodeContext) -> NodeResult:
        """Execute the node through the provider system.

        Args:
            context: Execution context.

        Returns:
            NodeResult from provider execution.
        """
        if not self.provider_id or not self.action_id:
            self.logger.error("No provider mapping found for legacy node type")
            return NodeResult.failed(
                error=f"No provider mapping for: {self.legacy_node_type}"
            )

        self.logger.info(
            "Adapting legacy node to provider",
            legacy_type=self.legacy_node_type,
            provider=f"{self.provider_id}.{self.action_id}",
        )

        # Adapt the configuration
        adapted_config = adapt_config(self.legacy_node_type, self.config)

        # Get the registry and execute through provider
        registry = get_provider_registry()

        return await registry.execute_action(
            provider_id=self.provider_id,
            action_id=self.action_id,
            config=adapted_config,
            context=context,
            workspace_id=context.workspace_id,
        )


def create_legacy_adapter(
    node_id: str,
    node_type: str,
    config: dict[str, Any],
) -> LegacyNodeAdapter | None:
    """Create a legacy adapter for a node type if applicable.

    Args:
        node_id: Node ID.
        node_type: Node type string.
        config: Node configuration.

    Returns:
        LegacyNodeAdapter if this is a legacy type, None otherwise.
    """
    if is_legacy_node_type(node_type):
        return LegacyNodeAdapter(node_id, config, node_type)
    return None


class ProviderNodeWrapper(BaseNode):
    """Wrapper that executes provider-based nodes (provider.action format).

    This is the forward-compatible node type for new workflows using
    the provider system directly.
    """

    def __init__(
        self,
        node_id: str,
        config: dict[str, Any],
        provider_id: str,
        action_id: str,
    ):
        """Initialize the wrapper.

        Args:
            node_id: Node ID.
            config: Node configuration.
            provider_id: Provider identifier.
            action_id: Action identifier.
        """
        super().__init__(node_id, config)
        self.provider_id = provider_id
        self.action_id = action_id
        self.node_type = f"{provider_id}.{action_id}"

        self.logger = logger.bind(
            node_id=node_id,
            provider_id=provider_id,
            action_id=action_id,
        )

    async def execute(self, context: NodeContext) -> NodeResult:
        """Execute the node through the provider system.

        Args:
            context: Execution context.

        Returns:
            NodeResult from provider execution.
        """
        registry = get_provider_registry()

        return await registry.execute_action(
            provider_id=self.provider_id,
            action_id=self.action_id,
            config=self.config,
            context=context,
            workspace_id=context.workspace_id,
        )


def create_provider_node(
    node_id: str,
    node_type: str,
    config: dict[str, Any],
) -> ProviderNodeWrapper | None:
    """Create a provider node wrapper for a provider.action format node type.

    Args:
        node_id: Node ID.
        node_type: Node type string (e.g., 'twilio.send_sms').
        config: Node configuration.

    Returns:
        ProviderNodeWrapper if valid provider format, None otherwise.
    """
    if "." in node_type:
        parts = node_type.split(".", 1)
        if len(parts) == 2:
            provider_id, action_id = parts
            return ProviderNodeWrapper(node_id, config, provider_id, action_id)
    return None


def get_node_for_type(
    node_id: str,
    node_type: str,
    config: dict[str, Any],
) -> BaseNode | None:
    """Get the appropriate node implementation for a node type.

    Handles both legacy node types and new provider.action format.

    Args:
        node_id: Node ID.
        node_type: Node type string.
        config: Node configuration.

    Returns:
        BaseNode implementation or None if not a provider-based type.
    """
    # Try provider format first (provider.action)
    provider_node = create_provider_node(node_id, node_type, config)
    if provider_node:
        return provider_node

    # Try legacy format
    legacy_node = create_legacy_adapter(node_id, node_type, config)
    if legacy_node:
        return legacy_node

    return None
