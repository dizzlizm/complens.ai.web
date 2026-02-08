"""Provider models for DynamoDB storage.

Defines Pydantic models for storing provider manifests, workspace provider
configurations, and encrypted credentials.
"""

from datetime import datetime
from enum import Enum
from typing import Any, ClassVar

from pydantic import Field

from complens.models.base import BaseModel


class ProviderStatus(str, Enum):
    """Status of a provider."""

    ACTIVE = "active"
    INACTIVE = "inactive"
    DEPRECATED = "deprecated"


class Provider(BaseModel):
    """Provider manifest stored in DynamoDB.

    Represents a custom provider that can be loaded dynamically.
    Built-in providers (ses, twilio) don't need to be stored in DynamoDB.

    DynamoDB Keys:
        PK: PROVIDER#{id}
        SK: MANIFEST
    """

    _pk_prefix: ClassVar[str] = "PROVIDER#"
    _sk_prefix: ClassVar[str] = "MANIFEST"

    # Provider identity
    provider_id: str = Field(..., description="Unique provider identifier")
    name: str = Field(..., description="Human-readable name")
    description: str = Field(default="", description="Provider description")
    version: str = Field(default="1.0.0", description="Manifest version")

    # Provider metadata
    icon: str = Field(default="", description="Icon URL")
    category: str = Field(default="general", description="Provider category")
    website: str = Field(default="", description="Provider website")
    documentation: str = Field(default="", description="Documentation URL")

    # Status
    status: ProviderStatus = Field(default=ProviderStatus.ACTIVE)

    # Full manifest as JSON (for dynamic loading)
    manifest_json: dict[str, Any] = Field(
        default_factory=dict,
        description="Complete provider manifest",
    )

    # Source information
    source_type: str = Field(
        default="custom",
        description="Source type: builtin, custom, marketplace",
    )
    author: str = Field(default="", description="Provider author")

    def get_pk(self) -> str:
        """Get partition key."""
        return f"{self._pk_prefix}{self.provider_id}"

    def get_sk(self) -> str:
        """Get sort key."""
        return self._sk_prefix


class WorkspaceProvider(BaseModel):
    """Workspace-specific provider configuration.

    Links a provider to a workspace with enabled status and settings.

    DynamoDB Keys:
        PK: WS#{workspace_id}
        SK: PROVIDER#{provider_id}
        GSI1PK: WS#{workspace_id}#PROVIDERS
        GSI1SK: {status}#{provider_id}
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "PROVIDER#"

    # Association
    workspace_id: str = Field(..., description="Workspace ID")
    provider_id: str = Field(..., description="Provider ID")

    # Status
    enabled: bool = Field(default=True, description="Whether provider is enabled")

    # Configuration
    settings: dict[str, Any] = Field(
        default_factory=dict,
        description="Workspace-specific provider settings",
    )

    # Credential reference (actual credentials stored separately)
    has_credentials: bool = Field(
        default=False,
        description="Whether credentials are configured",
    )
    credentials_verified_at: datetime | None = Field(
        default=None,
        description="When credentials were last verified",
    )

    # Usage tracking
    last_used_at: datetime | None = Field(
        default=None,
        description="When provider was last used",
    )
    usage_count: int = Field(default=0, description="Number of times used")

    def get_pk(self) -> str:
        """Get partition key."""
        return f"{self._pk_prefix}{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key."""
        return f"{self._sk_prefix}{self.provider_id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for listing providers by workspace."""
        status = "enabled" if self.enabled else "disabled"
        return {
            "GSI1PK": f"WS#{self.workspace_id}#PROVIDERS",
            "GSI1SK": f"{status}#{self.provider_id}",
        }


class ProviderCredentials(BaseModel):
    """Encrypted provider credentials for a workspace.

    Credentials are stored encrypted and should only be decrypted
    when needed for provider authentication.

    DynamoDB Keys:
        PK: WS#{workspace_id}
        SK: CREDS#{provider_id}
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "CREDS#"

    # Association
    workspace_id: str = Field(..., description="Workspace ID")
    provider_id: str = Field(..., description="Provider ID")

    # Encrypted credentials
    encrypted_credentials: str = Field(
        ...,
        description="KMS-encrypted credentials JSON",
    )
    encryption_key_id: str = Field(
        default="",
        description="KMS key ID used for encryption",
    )

    # OAuth tokens (if applicable)
    access_token_encrypted: str | None = Field(
        default=None,
        description="Encrypted OAuth access token",
    )
    refresh_token_encrypted: str | None = Field(
        default=None,
        description="Encrypted OAuth refresh token",
    )
    token_expires_at: datetime | None = Field(
        default=None,
        description="When access token expires",
    )

    # Metadata
    auth_method: str = Field(
        default="api_key",
        description="Authentication method used",
    )
    scopes: list[str] = Field(
        default_factory=list,
        description="OAuth scopes (if applicable)",
    )

    def get_pk(self) -> str:
        """Get partition key."""
        return f"{self._pk_prefix}{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key."""
        return f"{self._sk_prefix}{self.provider_id}"

    @property
    def is_expired(self) -> bool:
        """Check if OAuth token is expired."""
        if self.token_expires_at is None:
            return False
        return datetime.now() >= self.token_expires_at

    @property
    def needs_refresh(self) -> bool:
        """Check if OAuth token needs refresh (expires within 5 minutes)."""
        if self.token_expires_at is None:
            return False
        from datetime import timedelta

        buffer = timedelta(minutes=5)
        return datetime.now() >= (self.token_expires_at - buffer)
