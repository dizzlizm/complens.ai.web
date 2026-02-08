"""Central provider registry for workflow integrations.

The registry is the main interface for loading, caching, and accessing
provider implementations. It supports both built-in providers and
dynamically loaded providers from DynamoDB.
"""

import importlib
from typing import Any

import structlog

from complens.integrations.base_provider import (
    ActionInput,
    BaseProvider,
    ProviderCredentials,
    TriggerConfig,
)
from complens.integrations.manifest import ProviderManifest
from complens.nodes.base import NodeContext, NodeResult

logger = structlog.get_logger()


# Mapping of built-in provider IDs to their module paths
BUILTIN_PROVIDERS: dict[str, str] = {
    "ses": "complens.providers.core.email",
    "twilio": "complens.providers.core.sms",
}


class ProviderNotFoundError(Exception):
    """Raised when a provider is not found in the registry."""

    def __init__(self, provider_id: str):
        self.provider_id = provider_id
        super().__init__(f"Provider not found: {provider_id}")


class ActionNotFoundError(Exception):
    """Raised when an action is not found for a provider."""

    def __init__(self, provider_id: str, action_id: str):
        self.provider_id = provider_id
        self.action_id = action_id
        super().__init__(f"Action not found: {provider_id}.{action_id}")


class ProviderRegistry:
    """Central registry for workflow providers.

    The registry handles:
    - Loading and caching provider instances
    - Looking up providers by ID
    - Executing actions through providers
    - Managing provider credentials per workspace

    Example usage:
        registry = ProviderRegistry()
        result = await registry.execute_action(
            provider_id="twilio",
            action_id="send_sms",
            config={"to": "+1234567890", "body": "Hello!"},
            context=node_context,
            workspace_id="ws_123",
        )
    """

    _instance: "ProviderRegistry | None" = None

    def __init__(self):
        """Initialize the provider registry."""
        self._providers: dict[str, BaseProvider] = {}
        self._manifests: dict[str, ProviderManifest] = {}
        self._credentials_cache: dict[str, ProviderCredentials] = {}
        self.logger = logger.bind(service="provider_registry")

    @classmethod
    def get_instance(cls) -> "ProviderRegistry":
        """Get the singleton registry instance."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    @classmethod
    def reset_instance(cls) -> None:
        """Reset the singleton instance (for testing)."""
        cls._instance = None

    def register_provider(self, provider: BaseProvider) -> None:
        """Register a provider instance.

        Args:
            provider: Provider instance to register.
        """
        provider_id = provider.provider_id
        self._providers[provider_id] = provider
        self._manifests[provider_id] = provider.manifest

        self.logger.info(
            "Provider registered",
            provider_id=provider_id,
            actions=len(provider.manifest.actions),
            triggers=len(provider.manifest.triggers),
        )

    def get_provider(self, provider_id: str) -> BaseProvider:
        """Get a provider by ID, loading it if necessary.

        Args:
            provider_id: Provider identifier.

        Returns:
            Provider instance.

        Raises:
            ProviderNotFoundError: If provider doesn't exist.
        """
        # Check cache first
        if provider_id in self._providers:
            return self._providers[provider_id]

        # Try to load built-in provider
        if provider_id in BUILTIN_PROVIDERS:
            provider = self._load_builtin_provider(provider_id)
            self.register_provider(provider)
            return provider

        # Try to load from DynamoDB (custom providers)
        provider = self._load_custom_provider(provider_id)
        if provider:
            self.register_provider(provider)
            return provider

        raise ProviderNotFoundError(provider_id)

    def get_manifest(self, provider_id: str) -> ProviderManifest:
        """Get a provider's manifest.

        Args:
            provider_id: Provider identifier.

        Returns:
            Provider manifest.

        Raises:
            ProviderNotFoundError: If provider doesn't exist.
        """
        if provider_id in self._manifests:
            return self._manifests[provider_id]

        # Load the provider to get its manifest
        provider = self.get_provider(provider_id)
        return provider.manifest

    def list_providers(self) -> list[ProviderManifest]:
        """List all available provider manifests.

        Returns:
            List of provider manifests.
        """
        # Ensure all built-in providers are loaded
        for provider_id in BUILTIN_PROVIDERS:
            if provider_id not in self._manifests:
                try:
                    self.get_provider(provider_id)
                except Exception as e:
                    self.logger.warning(
                        "Failed to load built-in provider",
                        provider_id=provider_id,
                        error=str(e),
                    )

        return list(self._manifests.values())

    def list_actions(self) -> list[dict[str, Any]]:
        """List all available actions across all providers.

        Returns:
            List of action info dicts with provider_id, action_id, name, etc.
        """
        actions = []
        for manifest in self.list_providers():
            for action in manifest.actions:
                actions.append({
                    "provider_id": manifest.id,
                    "provider_name": manifest.name,
                    "action_id": action.id,
                    "full_id": manifest.get_full_action_id(action.id),
                    "name": action.name,
                    "description": action.description,
                    "category": action.category,
                    "fields": [f.model_dump() for f in action.fields],
                })
        return actions

    def list_triggers(self) -> list[dict[str, Any]]:
        """List all available triggers across all providers.

        Returns:
            List of trigger info dicts.
        """
        triggers = []
        for manifest in self.list_providers():
            for trigger in manifest.triggers:
                triggers.append({
                    "provider_id": manifest.id,
                    "provider_name": manifest.name,
                    "trigger_id": trigger.id,
                    "full_id": manifest.get_full_trigger_id(trigger.id),
                    "name": trigger.name,
                    "description": trigger.description,
                    "category": trigger.category,
                    "fields": [f.model_dump() for f in trigger.fields],
                })
        return triggers

    async def execute_action(
        self,
        provider_id: str,
        action_id: str,
        config: dict[str, Any],
        context: NodeContext,
        workspace_id: str,
        credentials: ProviderCredentials | None = None,
    ) -> NodeResult:
        """Execute a provider action.

        Args:
            provider_id: Provider identifier.
            action_id: Action identifier.
            config: Action configuration.
            context: Node execution context.
            workspace_id: Workspace ID for credential lookup.
            credentials: Optional pre-loaded credentials.

        Returns:
            NodeResult from action execution.
        """
        self.logger.info(
            "Executing action",
            provider_id=provider_id,
            action_id=action_id,
            workspace_id=workspace_id,
        )

        try:
            # Get provider
            provider = self.get_provider(provider_id)

            # Get credentials if not provided
            if credentials is None:
                credentials = await self._get_credentials(provider_id, workspace_id)

            # Validate configuration
            errors = provider.validate_action_config(action_id, config)
            if errors:
                return NodeResult.failed(
                    error=f"Invalid action configuration: {', '.join(errors)}",
                    error_details={"validation_errors": errors},
                )

            # Render template variables in config
            rendered_config = provider.render_config(config, context)

            # Build action input
            action_input = ActionInput(
                action_id=action_id,
                config=rendered_config,
                context=context,
                credentials=credentials,
            )

            # Execute action
            result = await provider.execute_action(action_input)

            self.logger.info(
                "Action completed",
                provider_id=provider_id,
                action_id=action_id,
                success=result.success,
            )

            return result

        except ProviderNotFoundError:
            return NodeResult.failed(
                error=f"Provider not found: {provider_id}",
                error_details={"provider_id": provider_id},
            )
        except Exception as e:
            self.logger.exception(
                "Action execution failed",
                provider_id=provider_id,
                action_id=action_id,
                error=str(e),
            )
            return NodeResult.failed(
                error=f"Action execution failed: {str(e)}",
                error_details={
                    "provider_id": provider_id,
                    "action_id": action_id,
                    "exception": type(e).__name__,
                },
            )

    async def setup_trigger(
        self,
        provider_id: str,
        trigger_id: str,
        workflow_id: str,
        workspace_id: str,
        config: dict[str, Any],
        credentials: ProviderCredentials | None = None,
    ) -> dict[str, Any]:
        """Set up a provider trigger.

        Args:
            provider_id: Provider identifier.
            trigger_id: Trigger identifier.
            workflow_id: Workflow ID this trigger belongs to.
            workspace_id: Workspace ID.
            config: Trigger configuration.
            credentials: Optional pre-loaded credentials.

        Returns:
            Setup result with webhook URLs, etc.
        """
        provider = self.get_provider(provider_id)

        if credentials is None:
            credentials = await self._get_credentials(provider_id, workspace_id)

        trigger_config = TriggerConfig(
            trigger_id=trigger_id,
            workspace_id=workspace_id,
            workflow_id=workflow_id,
            config=config,
            credentials=credentials,
        )

        return await provider.setup_trigger(trigger_config)

    async def teardown_trigger(
        self,
        provider_id: str,
        trigger_id: str,
        workflow_id: str,
        workspace_id: str,
        config: dict[str, Any],
    ) -> dict[str, Any]:
        """Tear down a provider trigger.

        Args:
            provider_id: Provider identifier.
            trigger_id: Trigger identifier.
            workflow_id: Workflow ID.
            workspace_id: Workspace ID.
            config: Trigger configuration.

        Returns:
            Teardown result.
        """
        provider = self.get_provider(provider_id)

        trigger_config = TriggerConfig(
            trigger_id=trigger_id,
            workspace_id=workspace_id,
            workflow_id=workflow_id,
            config=config,
        )

        return await provider.teardown_trigger(trigger_config)

    def parse_node_type(self, node_type: str) -> tuple[str, str] | None:
        """Parse a node type into provider and action/trigger IDs.

        Supports both new format (provider.action) and legacy format
        (action_send_sms).

        Args:
            node_type: Node type string.

        Returns:
            Tuple of (provider_id, action_id) or None if not parseable.
        """
        if "." in node_type:
            # New format: provider.action_id
            parts = node_type.split(".", 1)
            if len(parts) == 2:
                return parts[0], parts[1]
        return None

    def _load_builtin_provider(self, provider_id: str) -> BaseProvider:
        """Load a built-in provider by ID.

        Args:
            provider_id: Provider ID.

        Returns:
            Provider instance.

        Raises:
            ProviderNotFoundError: If provider module can't be loaded.
        """
        module_path = BUILTIN_PROVIDERS.get(provider_id)
        if not module_path:
            raise ProviderNotFoundError(provider_id)

        try:
            module = importlib.import_module(module_path)
            # Convention: provider class is named {Id}Provider
            class_name = f"{provider_id.title().replace('_', '')}Provider"

            if hasattr(module, class_name):
                provider_class = getattr(module, class_name)
                return provider_class()

            # Fall back to get_provider function
            if hasattr(module, "get_provider"):
                return module.get_provider()

            raise ProviderNotFoundError(provider_id)

        except ImportError as e:
            self.logger.error(
                "Failed to import provider module",
                provider_id=provider_id,
                module_path=module_path,
                error=str(e),
            )
            raise ProviderNotFoundError(provider_id) from e

    def _load_custom_provider(self, provider_id: str) -> BaseProvider | None:
        """Load a custom provider from DynamoDB.

        Args:
            provider_id: Provider ID.

        Returns:
            Provider instance or None if not found.
        """
        # TODO: Implement custom provider loading from DynamoDB
        # This will be implemented in Phase 1 completion
        return None

    async def _get_credentials(
        self,
        provider_id: str,
        workspace_id: str,
    ) -> ProviderCredentials | None:
        """Get credentials for a provider and workspace.

        Args:
            provider_id: Provider ID.
            workspace_id: Workspace ID.

        Returns:
            Credentials or None if not configured.
        """
        cache_key = f"{workspace_id}:{provider_id}"

        # Check cache
        if cache_key in self._credentials_cache:
            creds = self._credentials_cache[cache_key]
            if not creds.is_expired:
                return creds
            # Credentials expired, try to refresh
            try:
                provider = self.get_provider(provider_id)
                refreshed = await provider.refresh_credentials(creds)
                self._credentials_cache[cache_key] = refreshed
                return refreshed
            except Exception:
                # Remove expired credentials from cache
                del self._credentials_cache[cache_key]

        # TODO: Load credentials from DynamoDB
        # For now, return None (providers will use env vars)
        return None

    def cache_credentials(
        self,
        credentials: ProviderCredentials,
    ) -> None:
        """Cache credentials for future use.

        Args:
            credentials: Credentials to cache.
        """
        cache_key = f"{credentials.workspace_id}:{credentials.provider_id}"
        self._credentials_cache[cache_key] = credentials

    def clear_credentials_cache(
        self,
        workspace_id: str | None = None,
        provider_id: str | None = None,
    ) -> None:
        """Clear cached credentials.

        Args:
            workspace_id: Optional workspace ID to clear.
            provider_id: Optional provider ID to clear.
        """
        if workspace_id and provider_id:
            cache_key = f"{workspace_id}:{provider_id}"
            self._credentials_cache.pop(cache_key, None)
        elif workspace_id:
            keys_to_remove = [
                k for k in self._credentials_cache
                if k.startswith(f"{workspace_id}:")
            ]
            for key in keys_to_remove:
                del self._credentials_cache[key]
        elif provider_id:
            keys_to_remove = [
                k for k in self._credentials_cache
                if k.endswith(f":{provider_id}")
            ]
            for key in keys_to_remove:
                del self._credentials_cache[key]
        else:
            self._credentials_cache.clear()


def get_provider_registry() -> ProviderRegistry:
    """Get the global provider registry instance.

    Returns:
        Provider registry singleton.
    """
    return ProviderRegistry.get_instance()
