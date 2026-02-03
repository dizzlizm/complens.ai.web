"""Provider manifest schema validation.

Defines the structure and validation for provider manifests that describe
actions, triggers, and configuration for workflow integrations.
"""

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator


class FieldType(str, Enum):
    """Supported field types for provider configuration."""

    STRING = "string"
    TEXT = "text"
    NUMBER = "number"
    BOOLEAN = "boolean"
    SELECT = "select"
    MULTISELECT = "multiselect"
    EMAIL = "email"
    PHONE = "phone"
    URL = "url"
    JSON = "json"
    TEMPLATE = "template"  # Supports {{variable}} substitution


class FieldDefinition(BaseModel):
    """Definition for a configuration field."""

    name: str = Field(..., description="Field identifier")
    label: str = Field(..., description="Human-readable label")
    type: FieldType = Field(..., description="Field type")
    description: str = Field(default="", description="Help text")
    required: bool = Field(default=False, description="Whether field is required")
    default: Any = Field(default=None, description="Default value")
    placeholder: str = Field(default="", description="Placeholder text")
    options: list[dict[str, str]] = Field(
        default_factory=list,
        description="Options for select/multiselect fields",
    )
    validation: dict[str, Any] = Field(
        default_factory=dict,
        description="Validation rules (min, max, pattern, etc.)",
    )
    sensitive: bool = Field(
        default=False,
        description="Whether field contains sensitive data",
    )

    @field_validator("options")
    @classmethod
    def validate_options(cls, v: list, info) -> list:
        """Validate options are provided for select types."""
        field_type = info.data.get("type")
        if field_type in (FieldType.SELECT, FieldType.MULTISELECT) and not v:
            raise ValueError(f"Options required for {field_type} field type")
        return v


class OutputDefinition(BaseModel):
    """Definition for an action output field."""

    name: str = Field(..., description="Output field name")
    type: str = Field(default="string", description="Output data type")
    description: str = Field(default="", description="Output description")


class ActionDefinition(BaseModel):
    """Definition for a provider action."""

    id: str = Field(..., description="Action identifier (e.g., 'send_email')")
    name: str = Field(..., description="Human-readable action name")
    description: str = Field(default="", description="Action description")
    category: str = Field(default="general", description="Action category")
    icon: str = Field(default="", description="Icon name or URL")
    fields: list[FieldDefinition] = Field(
        default_factory=list,
        description="Configuration fields",
    )
    outputs: list[OutputDefinition] = Field(
        default_factory=list,
        description="Output field definitions",
    )
    timeout_seconds: int = Field(
        default=30,
        description="Default execution timeout",
    )
    retryable: bool = Field(
        default=True,
        description="Whether action can be retried on failure",
    )
    rate_limit: dict[str, int] | None = Field(
        default=None,
        description="Rate limit config (requests_per_minute, etc.)",
    )

    def get_required_fields(self) -> list[str]:
        """Get list of required field names."""
        return [f.name for f in self.fields if f.required]


class TriggerDefinition(BaseModel):
    """Definition for a provider trigger."""

    id: str = Field(..., description="Trigger identifier (e.g., 'webhook')")
    name: str = Field(..., description="Human-readable trigger name")
    description: str = Field(default="", description="Trigger description")
    category: str = Field(default="general", description="Trigger category")
    icon: str = Field(default="", description="Icon name or URL")
    fields: list[FieldDefinition] = Field(
        default_factory=list,
        description="Configuration fields",
    )
    outputs: list[OutputDefinition] = Field(
        default_factory=list,
        description="Trigger event output fields",
    )
    webhook_required: bool = Field(
        default=False,
        description="Whether trigger requires webhook setup",
    )


class AuthMethod(str, Enum):
    """Supported authentication methods."""

    NONE = "none"
    API_KEY = "api_key"
    OAUTH2 = "oauth2"
    BASIC = "basic"
    BEARER = "bearer"
    CUSTOM = "custom"


class AuthConfig(BaseModel):
    """Authentication configuration for a provider."""

    method: AuthMethod = Field(default=AuthMethod.NONE)
    fields: list[FieldDefinition] = Field(
        default_factory=list,
        description="Auth credential fields",
    )
    oauth_config: dict[str, str] | None = Field(
        default=None,
        description="OAuth2 configuration (authorize_url, token_url, scopes)",
    )
    test_endpoint: str | None = Field(
        default=None,
        description="Endpoint to test authentication",
    )


class ProviderManifest(BaseModel):
    """Complete manifest for a provider integration.

    A provider manifest describes all capabilities of an integration,
    including available actions, triggers, authentication requirements,
    and configuration fields.
    """

    id: str = Field(
        ...,
        description="Unique provider identifier (e.g., 'twilio', 'ses')",
        pattern=r"^[a-z][a-z0-9_]*$",
    )
    name: str = Field(..., description="Human-readable provider name")
    description: str = Field(default="", description="Provider description")
    version: str = Field(default="1.0.0", description="Manifest version")
    icon: str = Field(default="", description="Provider icon URL")
    category: str = Field(
        default="general",
        description="Provider category (email, sms, crm, etc.)",
    )
    website: str = Field(default="", description="Provider website URL")
    documentation: str = Field(default="", description="Documentation URL")

    auth: AuthConfig = Field(
        default_factory=AuthConfig,
        description="Authentication configuration",
    )

    actions: list[ActionDefinition] = Field(
        default_factory=list,
        description="Available actions",
    )
    triggers: list[TriggerDefinition] = Field(
        default_factory=list,
        description="Available triggers",
    )

    settings: list[FieldDefinition] = Field(
        default_factory=list,
        description="Provider-level settings",
    )

    capabilities: list[str] = Field(
        default_factory=list,
        description="Provider capabilities (batch, webhooks, etc.)",
    )

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        """Validate provider ID format."""
        if not v or len(v) > 50:
            raise ValueError("Provider ID must be 1-50 characters")
        return v.lower()

    def get_action(self, action_id: str) -> ActionDefinition | None:
        """Get action definition by ID."""
        for action in self.actions:
            if action.id == action_id:
                return action
        return None

    def get_trigger(self, trigger_id: str) -> TriggerDefinition | None:
        """Get trigger definition by ID."""
        for trigger in self.triggers:
            if trigger.id == trigger_id:
                return trigger
        return None

    def get_full_action_id(self, action_id: str) -> str:
        """Get fully qualified action ID (provider.action)."""
        return f"{self.id}.{action_id}"

    def get_full_trigger_id(self, trigger_id: str) -> str:
        """Get fully qualified trigger ID (provider.trigger)."""
        return f"{self.id}.{trigger_id}"

    def list_action_ids(self) -> list[str]:
        """List all fully qualified action IDs."""
        return [self.get_full_action_id(a.id) for a in self.actions]

    def list_trigger_ids(self) -> list[str]:
        """List all fully qualified trigger IDs."""
        return [self.get_full_trigger_id(t.id) for t in self.triggers]
