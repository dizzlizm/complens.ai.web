"""Base class for all workflow providers.

Providers are the building blocks for workflow integrations. Each provider
implements a set of actions and triggers that can be used in workflows.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

import structlog

from complens.integrations.manifest import ProviderManifest
from complens.nodes.base import NodeContext, NodeResult

logger = structlog.get_logger()


@dataclass
class ProviderCredentials:
    """Credentials for authenticating with a provider.

    Credentials are stored per-workspace and may include API keys,
    OAuth tokens, or other authentication data.
    """

    provider_id: str
    workspace_id: str
    credentials: dict[str, Any] = field(default_factory=dict)
    expires_at: datetime | None = None
    refresh_token: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def is_expired(self) -> bool:
        """Check if credentials are expired."""
        if self.expires_at is None:
            return False
        return datetime.now() >= self.expires_at


@dataclass
class ActionInput:
    """Input for executing a provider action."""

    action_id: str
    config: dict[str, Any]
    context: NodeContext
    credentials: ProviderCredentials | None = None


@dataclass
class TriggerConfig:
    """Configuration for setting up a provider trigger."""

    trigger_id: str
    workspace_id: str
    workflow_id: str
    config: dict[str, Any]
    credentials: ProviderCredentials | None = None


class BaseProvider(ABC):
    """Abstract base class for workflow providers.

    All provider implementations must inherit from this class and implement
    the required abstract methods. Providers are responsible for:

    1. Defining their capabilities via a manifest
    2. Executing actions (sending emails, SMS, etc.)
    3. Setting up triggers (webhooks, polling, etc.)
    4. Validating and refreshing credentials

    Example usage:
        class TwilioProvider(BaseProvider):
            def get_manifest(self) -> ProviderManifest:
                return ProviderManifest(
                    id="twilio",
                    name="Twilio",
                    actions=[...],
                    triggers=[...],
                )

            async def execute_action(self, input: ActionInput) -> NodeResult:
                if input.action_id == "send_sms":
                    return await self._send_sms(input)
                ...
    """

    def __init__(self):
        """Initialize the provider."""
        self.logger = logger.bind(provider=self.__class__.__name__)
        self._manifest: ProviderManifest | None = None

    @property
    def manifest(self) -> ProviderManifest:
        """Get the provider manifest (cached)."""
        if self._manifest is None:
            self._manifest = self.get_manifest()
        return self._manifest

    @property
    def provider_id(self) -> str:
        """Get the provider ID from the manifest."""
        return self.manifest.id

    @abstractmethod
    def get_manifest(self) -> ProviderManifest:
        """Return the provider manifest describing capabilities.

        Returns:
            ProviderManifest with actions, triggers, and auth config.
        """
        pass

    @abstractmethod
    async def execute_action(self, input: ActionInput) -> NodeResult:
        """Execute a provider action.

        Args:
            input: Action input with ID, config, context, and credentials.

        Returns:
            NodeResult with success/failure and output data.
        """
        pass

    async def setup_trigger(self, config: TriggerConfig) -> dict[str, Any]:
        """Set up a trigger for a workflow.

        Called when a workflow with this provider's trigger is activated.
        Override this method to set up webhooks, polling jobs, etc.

        Args:
            config: Trigger configuration.

        Returns:
            Setup result with any webhook URLs, subscription IDs, etc.

        Raises:
            NotImplementedError: If provider has triggers but doesn't implement this.
        """
        if self.manifest.triggers:
            raise NotImplementedError(
                f"Provider {self.provider_id} has triggers but doesn't implement setup_trigger"
            )
        return {}

    async def teardown_trigger(self, config: TriggerConfig) -> dict[str, Any]:
        """Tear down a trigger when a workflow is deactivated.

        Args:
            config: Trigger configuration.

        Returns:
            Teardown result.
        """
        return {}

    async def authenticate(
        self,
        credentials: dict[str, Any],
        workspace_id: str,
    ) -> ProviderCredentials:
        """Validate and optionally exchange credentials.

        Called when a user connects their account for this provider.
        For OAuth providers, this handles the token exchange.

        Args:
            credentials: Raw credentials from the user/OAuth flow.
            workspace_id: Workspace ID for the connection.

        Returns:
            ProviderCredentials ready for use.

        Raises:
            ValueError: If credentials are invalid.
        """
        # Default implementation just wraps credentials
        return ProviderCredentials(
            provider_id=self.provider_id,
            workspace_id=workspace_id,
            credentials=credentials,
        )

    async def refresh_credentials(
        self,
        credentials: ProviderCredentials,
    ) -> ProviderCredentials:
        """Refresh expired credentials.

        Called automatically when credentials are expired and a refresh
        token is available.

        Args:
            credentials: Expired credentials with refresh token.

        Returns:
            Fresh credentials.

        Raises:
            ValueError: If credentials cannot be refreshed.
        """
        raise ValueError(f"Provider {self.provider_id} does not support credential refresh")

    async def test_connection(
        self,
        credentials: ProviderCredentials,
    ) -> dict[str, Any]:
        """Test that credentials are valid.

        Args:
            credentials: Credentials to test.

        Returns:
            Test result with success status and any account info.
        """
        return {"success": True, "message": "Connection successful"}

    def validate_action_config(
        self,
        action_id: str,
        config: dict[str, Any],
    ) -> list[str]:
        """Validate action configuration.

        Args:
            action_id: Action ID to validate for.
            config: Configuration to validate.

        Returns:
            List of validation error messages, empty if valid.
        """
        errors = []
        action = self.manifest.get_action(action_id)

        if not action:
            return [f"Unknown action: {action_id}"]

        # Check required fields
        for field_name in action.get_required_fields():
            if field_name not in config or config[field_name] in (None, ""):
                errors.append(f"Required field '{field_name}' is missing")

        return errors

    def validate_trigger_config(
        self,
        trigger_id: str,
        config: dict[str, Any],
    ) -> list[str]:
        """Validate trigger configuration.

        Args:
            trigger_id: Trigger ID to validate for.
            config: Configuration to validate.

        Returns:
            List of validation error messages, empty if valid.
        """
        errors = []
        trigger = self.manifest.get_trigger(trigger_id)

        if not trigger:
            return [f"Unknown trigger: {trigger_id}"]

        # Check required fields
        required = [f.name for f in trigger.fields if f.required]
        for field_name in required:
            if field_name not in config or config[field_name] in (None, ""):
                errors.append(f"Required field '{field_name}' is missing")

        return errors

    def render_config(
        self,
        config: dict[str, Any],
        context: NodeContext,
    ) -> dict[str, Any]:
        """Render template variables in configuration.

        Args:
            config: Configuration with template strings.
            context: Node context for variable resolution.

        Returns:
            Configuration with templates rendered.
        """
        rendered = {}
        for key, value in config.items():
            if isinstance(value, str):
                rendered[key] = context.render_template(value)
            elif isinstance(value, dict):
                rendered[key] = self.render_config(value, context)
            elif isinstance(value, list):
                rendered[key] = [
                    context.render_template(v) if isinstance(v, str) else v
                    for v in value
                ]
            else:
                rendered[key] = value
        return rendered

    def _build_error_result(
        self,
        error: str,
        error_code: str | None = None,
        details: dict[str, Any] | None = None,
        retryable: bool = True,
    ) -> NodeResult:
        """Build a standardized error result.

        Args:
            error: Error message.
            error_code: Optional error code.
            details: Optional error details.
            retryable: Whether the error is retryable.

        Returns:
            NodeResult with error information.
        """
        return NodeResult.failed(
            error=error,
            error_details={
                "provider": self.provider_id,
                "code": error_code,
                "retryable": retryable,
                **(details or {}),
            },
        )
