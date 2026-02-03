"""Page model for public-facing landing pages."""

import re
from enum import Enum
from typing import ClassVar
from urllib.parse import urlparse
from uuid import uuid4

from pydantic import BaseModel as PydanticBaseModel, Field, field_validator

from complens.models.base import BaseModel

# Hex color validation pattern
HEX_COLOR_PATTERN = re.compile(r'^#[0-9A-Fa-f]{6}$')

# Domain validation pattern (basic domain format)
DOMAIN_PATTERN = re.compile(r'^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')

# Dangerous CSS patterns to block
DANGEROUS_CSS_PATTERNS = [
    re.compile(r'@import', re.IGNORECASE),
    re.compile(r'expression\s*\(', re.IGNORECASE),
    re.compile(r'javascript:', re.IGNORECASE),
    re.compile(r'behavior:', re.IGNORECASE),
    re.compile(r'-moz-binding', re.IGNORECASE),
    re.compile(r'url\s*\(\s*["\']?\s*data:', re.IGNORECASE),
    re.compile(r'</style', re.IGNORECASE),  # Prevent style tag escape
    re.compile(r'<script', re.IGNORECASE),  # Prevent script injection
]

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
        None, max_length=1000, description="AI's opening message when chat opens"
    )
    ai_persona: str | None = Field(
        None, max_length=5000, description="Custom AI persona/instructions for this page"
    )
    business_context: dict = Field(
        default_factory=dict,
        description="Business context passed to AI (name, description, tone)",
    )

    @field_validator("initial_message", "ai_persona")
    @classmethod
    def sanitize_text_fields(cls, v: str | None) -> str | None:
        """Sanitize text fields to prevent script injection."""
        if v is None:
            return None
        # Remove script tags and event handlers
        import html
        # Escape HTML entities to prevent XSS
        v = html.escape(v, quote=True)
        return v


class PageBlock(PydanticBaseModel):
    """A content block on a page.

    Block Types:
    - hero: Full-screen header with headline, subheadline, CTA
    - features: 3-column feature cards
    - testimonials: Customer quote cards
    - cta: Call-to-action section
    - form: Embedded lead capture form
    - faq: Accordion Q&A
    - pricing: Pricing tier tables
    - text: Rich text/markdown section
    - image: Single image with caption
    - video: YouTube/Vimeo embed
    - stats: Number highlights
    - divider: Visual separator
    - chat: AI chat widget (inline or floating)

    Layout System:
    Uses a 12-column grid system where:
    - colSpan 4 = 1/3 width
    - colSpan 6 = 1/2 width
    - colSpan 8 = 2/3 width
    - colSpan 12 = full width (default)

    Blocks on the same row are displayed side-by-side on desktop.
    """

    id: str = Field(default_factory=lambda: str(uuid4())[:8])
    type: str = Field(..., description="Block type (hero, features, cta, chat, etc.)")
    config: dict = Field(default_factory=dict, description="Block-specific settings")
    order: int = Field(default=0, description="Position in page layout")
    width: int = Field(default=4, ge=1, le=4, description="Legacy grid width (1-4 columns)")

    # 12-column grid layout fields
    row: int | None = Field(default=None, description="Row index (0-indexed, blocks with same row display side-by-side)")
    colSpan: int | None = Field(default=None, ge=4, le=12, description="Column span in 12-col grid (4, 6, 8, or 12)")
    colStart: int | None = Field(default=None, ge=0, le=8, description="Column start position (0-8)")


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

    # Content blocks (new visual builder format)
    blocks: list[PageBlock] = Field(
        default_factory=list,
        max_length=100,  # Prevent abuse with excessive blocks
        description="Content blocks for visual page builder",
    )

    # Forms embedded on this page (legacy, kept for backwards compatibility)
    form_ids: list[str] = Field(
        default_factory=list,
        max_length=20,  # Reasonable limit for forms per page
        description="Form IDs to display",
    )

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

    @field_validator("custom_css")
    @classmethod
    def sanitize_custom_css(cls, v: str | None) -> str | None:
        """Sanitize custom CSS to prevent XSS and injection attacks."""
        if v is None:
            return None
        # Check for dangerous patterns
        for pattern in DANGEROUS_CSS_PATTERNS:
            if pattern.search(v):
                raise ValueError(f"CSS contains disallowed pattern: {pattern.pattern}")
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

    @field_validator("custom_domain")
    @classmethod
    def validate_custom_domain(cls, v: str | None) -> str | None:
        """Validate custom domain format."""
        if v is None or v == "":
            return None
        v = v.lower().strip()
        # Remove protocol if present
        if v.startswith("http://") or v.startswith("https://"):
            try:
                parsed = urlparse(v)
                v = parsed.netloc or parsed.path
            except Exception:
                raise ValueError("Invalid domain format")
        # Remove trailing slashes and paths
        v = v.split("/")[0]
        # Validate domain format
        if not DOMAIN_PATTERN.match(v):
            raise ValueError("Invalid domain format. Use format: example.com")
        # Block localhost and private domains
        blocked_domains = ["localhost", "127.0.0.1", "0.0.0.0", "internal", "local"]
        if any(v == blocked or v.endswith(f".{blocked}") for blocked in blocked_domains):
            raise ValueError("This domain is not allowed")
        return v

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


class PageBlockRequest(PydanticBaseModel):
    """Request model for a page block."""

    id: str | None = None  # Optional, will be generated if not provided
    type: str = Field(..., description="Block type")
    config: dict = Field(default_factory=dict)
    order: int = 0
    width: int = Field(default=4, ge=1, le=4, description="Legacy grid width (1-4 columns)")

    # 12-column grid layout fields
    row: int | None = Field(default=None, description="Row index (0-indexed)")
    colSpan: int | None = Field(default=None, ge=4, le=12, description="Column span (4, 6, 8, or 12)")
    colStart: int | None = Field(default=None, ge=0, le=8, description="Column start position")


class CreatePageRequest(PydanticBaseModel):
    """Request model for creating a page."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=100, pattern=r"^[a-z0-9-]+$")
    headline: str = Field(default="", max_length=500)
    subheadline: str | None = Field(None, max_length=1000)
    hero_image_url: str | None = None
    body_content: str | None = None
    blocks: list[PageBlockRequest] = Field(default_factory=list)
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
    blocks: list[PageBlockRequest] | None = Field(None, max_length=100)
    form_ids: list[str] | None = Field(None, max_length=20)
    chat_config: ChatConfig | None = None
    primary_color: str | None = None
    theme: dict | None = None
    custom_css: str | None = Field(None, max_length=50000)
    meta_title: str | None = None
    meta_description: str | None = None
    subdomain: str | None = Field(None, max_length=63)
    custom_domain: str | None = None

    @field_validator("custom_css")
    @classmethod
    def sanitize_custom_css(cls, v: str | None) -> str | None:
        """Sanitize custom CSS to prevent XSS and injection attacks."""
        if v is None:
            return None
        # Check for dangerous patterns
        for pattern in DANGEROUS_CSS_PATTERNS:
            if pattern.search(v):
                raise ValueError(f"CSS contains disallowed pattern")
        return v

    @field_validator("custom_domain")
    @classmethod
    def validate_custom_domain(cls, v: str | None) -> str | None:
        """Validate custom domain format."""
        if v is None or v == "":
            return None
        v = v.lower().strip()
        # Remove protocol if present
        if v.startswith("http://") or v.startswith("https://"):
            try:
                from urllib.parse import urlparse
                parsed = urlparse(v)
                v = parsed.netloc or parsed.path
            except Exception:
                raise ValueError("Invalid domain format")
        # Remove trailing slashes and paths
        v = v.split("/")[0]
        # Validate domain format
        if not DOMAIN_PATTERN.match(v):
            raise ValueError("Invalid domain format. Use format: example.com")
        # Block localhost and private domains
        blocked_domains = ["localhost", "127.0.0.1", "0.0.0.0", "internal", "local"]
        if any(v == blocked or v.endswith(f".{blocked}") for blocked in blocked_domains):
            raise ValueError("This domain is not allowed")
        return v

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
