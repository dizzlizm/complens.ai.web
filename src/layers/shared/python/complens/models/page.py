"""Page model for public-facing landing pages."""

import re
from enum import Enum
from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field, field_validator

from complens.models.base import BaseModel

# Hex color validation pattern
HEX_COLOR_PATTERN = re.compile(r'^#[0-9A-Fa-f]{6}$')

# Subdomain validation pattern (lowercase alphanumeric and hyphens, 3-63 chars)
SUBDOMAIN_PATTERN = re.compile(r'^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$')

# Reserved subdomains that cannot be claimed
RESERVED_SUBDOMAINS = {
    'api', 'ws', 'www', 'app', 'admin', 'dev', 'staging', 'prod', 'production',
    'test', 'testing', 'demo', 'mail', 'email', 'smtp', 'ftp', 'ssh', 'sftp',
    'cdn', 'static', 'assets', 'media', 'img', 'images', 'files', 'download',
    'help', 'support', 'docs', 'documentation', 'blog', 'status', 'health',
    'login', 'signin', 'signup', 'register', 'auth', 'oauth', 'sso',
    'dashboard', 'console', 'panel', 'portal', 'account', 'billing', 'payment',
    'localhost', 'local', 'internal', 'private', 'public', 'secure', 'ssl',
    'complens', 'anthropic', 'claude', 'ai', 'chatbot', 'widget',
}


class PageStatus(str, Enum):
    """Page status enum."""

    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"


class ChatConfig(PydanticBaseModel):
    """Configuration for the AI chat widget on a page."""

    enabled: bool = Field(default=True, description="Whether chat is enabled")
    position: str = Field(default="bottom-right", description="Widget position")
    initial_message: str | None = Field(
        None, description="AI's opening message when chat opens"
    )
    ai_persona: str | None = Field(
        None, description="Custom AI persona/instructions for this page"
    )
    business_context: dict = Field(
        default_factory=dict,
        description="Business context passed to AI (name, description, tone)",
    )


class Page(BaseModel):
    """Page entity - represents a public-facing landing page.

    Key Pattern:
        PK: WS#{workspace_id}
        SK: PAGE#{id}
        GSI1PK: PAGE_SLUG#{workspace_id}
        GSI1SK: {slug}
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "PAGE#"

    workspace_id: str = Field(..., description="Parent workspace ID")

    # Page metadata
    name: str = Field(..., min_length=1, max_length=255, description="Page name")
    slug: str = Field(
        ...,
        min_length=1,
        max_length=100,
        pattern=r"^[a-z0-9-]+$",
        description="URL-safe slug",
    )
    status: PageStatus = Field(default=PageStatus.DRAFT, description="Page status")

    # Content
    headline: str = Field(default="", max_length=500, description="Main headline")
    subheadline: str | None = Field(None, max_length=1000, description="Subheadline")
    hero_image_url: str | None = Field(None, description="Hero image URL")
    body_content: str | None = Field(None, description="Main body content (markdown)")

    # Forms embedded on this page
    form_ids: list[str] = Field(default_factory=list, description="Form IDs to display")

    # Chat configuration
    chat_config: ChatConfig = Field(
        default_factory=ChatConfig, description="AI chat widget configuration"
    )

    # Theme/styling
    primary_color: str = Field(default="#6366f1", description="Primary brand color")
    theme: dict = Field(default_factory=dict, description="Additional theme settings")
    custom_css: str | None = Field(None, max_length=50000, description="Custom CSS overrides")

    @field_validator("primary_color")
    @classmethod
    def validate_primary_color(cls, v: str) -> str:
        """Validate hex color format."""
        if not HEX_COLOR_PATTERN.match(v):
            return "#6366f1"  # Return default if invalid
        return v

    # SEO
    meta_title: str | None = Field(None, max_length=100, description="SEO title")
    meta_description: str | None = Field(
        None, max_length=300, description="SEO description"
    )
    og_image_url: str | None = Field(None, description="Open Graph image URL")

    # Subdomain on complens.ai (e.g., "mypage" for mypage.complens.ai)
    subdomain: str | None = Field(
        None,
        min_length=3,
        max_length=63,
        pattern=r"^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])?$",
        description="Subdomain on complens.ai",
    )

    # Custom domain (future)
    custom_domain: str | None = Field(None, description="Custom domain for this page")

    @field_validator("subdomain")
    @classmethod
    def validate_subdomain(cls, v: str | None) -> str | None:
        """Validate subdomain format and reserved names."""
        if v is None:
            return None
        v = v.lower()
        if not SUBDOMAIN_PATTERN.match(v):
            raise ValueError("Subdomain must be 3-63 characters, lowercase alphanumeric and hyphens")
        if v in RESERVED_SUBDOMAINS:
            raise ValueError(f"Subdomain '{v}' is reserved")
        return v

    # Analytics
    view_count: int = Field(default=0, description="Total page views")
    form_submission_count: int = Field(default=0, description="Total form submissions")
    chat_session_count: int = Field(default=0, description="Total chat sessions")

    def get_pk(self) -> str:
        """Get partition key: WS#{workspace_id}."""
        return f"WS#{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key: PAGE#{id}."""
        return f"PAGE#{self.id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for slug lookup."""
        return {
            "GSI1PK": f"PAGE_SLUG#{self.workspace_id}",
            "GSI1SK": self.slug,
        }

    def get_gsi2_keys(self) -> dict[str, str] | None:
        """Get GSI2 keys for custom domain lookup (if configured)."""
        if self.custom_domain:
            return {
                "GSI2PK": f"PAGE_DOMAIN#{self.custom_domain.lower()}",
                "GSI2SK": f"PAGE#{self.id}",
            }
        return None

    def get_gsi3_keys(self) -> dict[str, str] | None:
        """Get GSI3 keys for subdomain lookup (if configured)."""
        if self.subdomain:
            return {
                "GSI3PK": f"PAGE_SUBDOMAIN#{self.subdomain.lower()}",
                "GSI3SK": f"PAGE#{self.id}",
            }
        return None

    def get_public_url(self, base_url: str = "", stage: str = "prod") -> str:
        """Get the public URL for this page.

        Args:
            base_url: Base URL for fallback slug-based URL.
            stage: Environment stage (dev, staging, prod).

        Returns:
            The public URL for this page.
        """
        if self.subdomain:
            # Return subdomain URL with stage
            if stage == "prod":
                return f"https://{self.subdomain}.complens.ai"
            return f"https://{self.subdomain}.{stage}.complens.ai"
        return f"{base_url}/p/{self.slug}?ws={self.workspace_id}"


class CreatePageRequest(PydanticBaseModel):
    """Request model for creating a page."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    headline: str = Field(default="", max_length=500)
    subheadline: str | None = Field(None, max_length=1000)
    hero_image_url: str | None = None
    body_content: str | None = None
    form_ids: list[str] = Field(default_factory=list)
    chat_config: ChatConfig | None = None
    primary_color: str = "#6366f1"
    meta_title: str | None = None
    meta_description: str | None = None


class UpdatePageRequest(PydanticBaseModel):
    """Request model for updating a page."""

    name: str | None = Field(None, min_length=1, max_length=255)
    slug: str | None = Field(None, min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    status: PageStatus | None = None
    headline: str | None = Field(None, max_length=500)
    subheadline: str | None = Field(None, max_length=1000)
    hero_image_url: str | None = None
    body_content: str | None = None
    form_ids: list[str] | None = None
    chat_config: ChatConfig | None = None
    primary_color: str | None = None
    theme: dict | None = None
    custom_css: str | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    subdomain: str | None = Field(None, max_length=63)
    custom_domain: str | None = None

    @field_validator("subdomain")
    @classmethod
    def validate_subdomain_format(cls, v: str | None) -> str | None:
        """Validate subdomain format, allowing empty string to clear."""
        if v is None or v == "":
            return v  # Allow None or empty string (will be converted to None in handler)
        v = v.lower()
        if len(v) < 3:
            raise ValueError("Subdomain must be at least 3 characters")
        if not SUBDOMAIN_PATTERN.match(v):
            raise ValueError("Subdomain must be lowercase alphanumeric and hyphens, starting and ending with alphanumeric")
        if v in RESERVED_SUBDOMAINS:
            raise ValueError(f"Subdomain '{v}' is reserved")
        return v
