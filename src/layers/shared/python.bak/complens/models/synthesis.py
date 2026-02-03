"""Synthesis engine data models.

Defines the structured types for the multi-stage page synthesis pipeline.
"""

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel as PydanticBaseModel, Field


class PageGoal(str, Enum):
    """Primary goal/intent of the page."""

    LEAD_GEN = "lead-gen"
    PORTFOLIO = "portfolio"
    PRODUCT_LAUNCH = "product-launch"
    SERVICES = "services"
    COMING_SOON = "coming-soon"
    EVENT = "event"
    COMPARISON = "comparison"


class PageIntent(PydanticBaseModel):
    """Stage 1 output: Analyzed page intent from user input."""

    goal: PageGoal = Field(..., description="Primary page goal")
    audience_intent: str = Field(
        ..., description="What the audience should do (e.g., 'convince to buy')"
    )
    content_type: str = Field(
        ..., description="Type of content (e.g., 'b2b saas', 'personal brand')"
    )
    urgency: Literal["low", "medium", "high"] = Field(
        default="medium", description="Affects CTA prominence"
    )
    keywords: list[str] = Field(
        default_factory=list, description="Key terms extracted from description"
    )


class ContentAssessment(PydanticBaseModel):
    """Stage 2 output: Quality scores for available content."""

    # Testimonials
    testimonials_score: int = Field(
        default=0, ge=0, le=10, description="Quality score 0-10"
    )
    testimonials_real: bool = Field(
        default=False, description="True if from profile, False if AI-generated"
    )
    testimonials_count: int = Field(default=0)

    # Stats/metrics
    stats_score: int = Field(default=0, ge=0, le=10)
    stats_real: bool = Field(default=False)
    stats_items: list[dict[str, str]] = Field(
        default_factory=list, description="Extracted real stats"
    )

    # Features
    features_score: int = Field(default=0, ge=0, le=10)
    features_count: int = Field(default=0)

    # Pricing
    pricing_available: bool = Field(default=False)
    pricing_items: list[dict[str, Any]] = Field(default_factory=list)

    # FAQ
    faq_score: int = Field(default=0, ge=0, le=10)
    faq_count: int = Field(default=0)

    # Gaps and recommendations
    gaps: list[str] = Field(
        default_factory=list,
        description="Missing content areas (e.g., 'no testimonials')",
    )
    strengths: list[str] = Field(
        default_factory=list,
        description="Strong content areas",
    )


class PlannedBlock(PydanticBaseModel):
    """A block in the synthesis plan (before content generation)."""

    type: str = Field(..., description="Block type (hero, features, etc.)")
    width: int = Field(default=4, ge=1, le=4, description="Grid width 1-4")
    emphasis: Literal["high", "medium", "low"] = Field(
        default="medium", description="Visual prominence"
    )
    content_source: Literal["profile", "generated", "hybrid"] = Field(
        default="generated", description="Where content comes from"
    )
    config_hints: dict[str, Any] = Field(
        default_factory=dict, description="Hints for content generation"
    )


class BlockPlan(PydanticBaseModel):
    """Stage 3 output: Planned block structure before content synthesis."""

    blocks: list[PlannedBlock] = Field(..., description="Ordered list of blocks")
    sequence_rationale: str = Field(
        ..., description="Why blocks are ordered this way"
    )
    layout_strategy: Literal["full-width", "side-by-side-cta", "grid", "mixed"] = Field(
        default="full-width"
    )
    excluded: dict[str, str] = Field(
        default_factory=dict,
        description="block_type -> exclusion reason",
    )


class ColorScheme(PydanticBaseModel):
    """Color palette for the page."""

    primary: str = Field(default="#6366f1", pattern=r"^#[0-9A-Fa-f]{6}$")
    secondary: str = Field(default="#818cf8", pattern=r"^#[0-9A-Fa-f]{6}$")
    accent: str = Field(default="#c7d2fe", pattern=r"^#[0-9A-Fa-f]{6}$")
    background: str = Field(default="#ffffff", pattern=r"^#[0-9A-Fa-f]{6}$")
    text: str = Field(default="#1f2937", pattern=r"^#[0-9A-Fa-f]{6}$")


class TypographyScale(PydanticBaseModel):
    """Typography settings."""

    heading_font: str = Field(default="system-ui")
    body_font: str = Field(default="system-ui")
    base_size: int = Field(default=16)
    scale_ratio: float = Field(default=1.25)


class SpacingScale(PydanticBaseModel):
    """Spacing settings."""

    base: int = Field(default=4)
    section_padding: str = Field(default="py-16")
    block_gap: str = Field(default="gap-8")


class DesignSystem(PydanticBaseModel):
    """Stage 4 output: Generated design system for the page."""

    colors: ColorScheme = Field(default_factory=ColorScheme)
    typography: TypographyScale = Field(default_factory=TypographyScale)
    spacing: SpacingScale = Field(default_factory=SpacingScale)
    style: Literal["professional", "bold", "minimal", "playful"] = Field(
        default="professional"
    )
    rationale: str = Field(
        default="", description="Why this design was chosen"
    )


class SynthesizedBlockContent(PydanticBaseModel):
    """Content for a single block from Stage 5."""

    block_type: str
    content: dict[str, Any] = Field(..., description="Block-specific content")


class SynthesizedSeo(PydanticBaseModel):
    """SEO metadata from content synthesis."""

    meta_title: str = Field(default="", description="SEO title")
    meta_description: str = Field(default="", description="SEO description")


class SynthesizedContent(PydanticBaseModel):
    """Stage 5 output: All block content generated together."""

    blocks: list[SynthesizedBlockContent] = Field(default_factory=list)
    business_name: str = Field(default="")
    tagline: str = Field(default="")
    tone: str = Field(default="professional")
    narrative_theme: str = Field(
        default="", description="Unifying theme across all blocks"
    )
    seo: SynthesizedSeo = Field(
        default_factory=SynthesizedSeo, description="Generated SEO metadata"
    )


class FormConfig(PydanticBaseModel):
    """Configuration for the lead capture form."""

    name: str = Field(default="Contact Form")
    fields: list[dict[str, Any]] = Field(default_factory=list)
    submit_button_text: str = Field(default="Get Started")
    success_message: str = Field(default="Thanks! We'll be in touch shortly.")
    add_tags: list[str] = Field(default_factory=lambda: ["lead", "website"])


class WorkflowConfig(PydanticBaseModel):
    """Configuration for the automation workflow."""

    name: str = Field(default="Lead Automation")
    send_welcome_email: bool = Field(default=True)
    notify_owner: bool = Field(default=True)
    owner_email: str | None = Field(default=None)
    welcome_message: str | None = Field(default=None)
    add_tags: list[str] = Field(default_factory=list)


class SynthesisMetadata(PydanticBaseModel):
    """Metadata about the synthesis process."""

    blocks_included: list[str] = Field(
        default_factory=list, description="Block types that were included"
    )
    blocks_excluded: dict[str, str] = Field(
        default_factory=dict, description="Block type -> reason for exclusion"
    )
    layout_decisions: dict[str, Any] = Field(
        default_factory=dict, description="Key layout choices made"
    )
    content_sources: dict[str, str] = Field(
        default_factory=dict,
        description="Block type -> where content came from",
    )
    generation_stages: list[str] = Field(
        default_factory=list, description="Stages that were executed"
    )


class PageBlock(PydanticBaseModel):
    """A fully configured page block."""

    id: str = Field(..., description="Unique block ID")
    type: str = Field(..., description="Block type")
    order: int = Field(default=0, description="Position in page")
    width: int = Field(default=4, ge=1, le=4, description="Legacy grid width (1-4)")
    config: dict[str, Any] = Field(default_factory=dict)

    # 12-column grid layout fields
    row: int | None = Field(default=None, description="Row index (0-indexed)")
    colSpan: int | None = Field(default=None, description="Column span in 12-col grid (4, 6, 8, or 12)")
    colStart: int | None = Field(default=None, description="Column start position (0-8)")


class SeoConfig(PydanticBaseModel):
    """SEO metadata configuration."""

    meta_title: str = Field(default="", max_length=70, description="SEO title (30-60 chars optimal)")
    meta_description: str = Field(default="", max_length=160, description="SEO description (120-160 chars optimal)")
    og_image_url: str | None = Field(default=None, description="Open Graph image URL")


class SynthesisResult(PydanticBaseModel):
    """Complete synthesis output from the engine."""

    synthesis_id: str = Field(..., description="Unique ID for this synthesis run")
    intent: PageIntent = Field(..., description="Analyzed page intent")
    assessment: ContentAssessment = Field(..., description="Content quality assessment")
    design_system: DesignSystem = Field(..., description="Design system")
    blocks: list[PageBlock] = Field(..., description="Fully configured blocks")
    form_config: FormConfig | None = Field(default=None)
    workflow_config: WorkflowConfig | None = Field(default=None)
    metadata: SynthesisMetadata = Field(default_factory=SynthesisMetadata)

    # SEO metadata
    seo: SeoConfig = Field(default_factory=SeoConfig, description="SEO metadata")

    # Business context passthrough
    business_name: str = Field(default="")
    tagline: str = Field(default="")


# Valid block types that can be requested
VALID_BLOCK_TYPES = {
    "hero",
    "features",
    "testimonials",
    "cta",
    "form",
    "faq",
    "pricing",
    "text",
    "image",
    "video",
    "stats",
    "divider",
    "chat",
    "gallery",
    "slider",
    "logo-cloud",
}


class SynthesizePageRequest(PydanticBaseModel):
    """Request model for the synthesize-page endpoint."""

    description: str = Field(
        ..., min_length=10, max_length=10000, description="Business/page description"
    )
    intent_hints: list[str] | None = Field(
        default=None, description="Hints like 'lead-gen', 'portfolio'"
    )
    style_preference: str | None = Field(
        default=None, description="Style preference"
    )
    page_id: str | None = Field(
        default=None, description="Existing page ID for update mode"
    )
    include_form: bool = Field(default=True)
    include_chat: bool = Field(default=True)
    block_types: list[str] | None = Field(
        default=None,
        description="Only generate these block types (e.g., ['hero', 'features', 'cta'])",
    )

    @classmethod
    def validate_block_types(cls, v: list[str] | None) -> list[str] | None:
        """Validate that all block types are valid."""
        if v is None:
            return v
        invalid_types = set(v) - VALID_BLOCK_TYPES
        if invalid_types:
            raise ValueError(f"Invalid block types: {', '.join(invalid_types)}")
        return v

    def model_post_init(self, __context: Any) -> None:
        """Post-initialization validation."""
        if self.block_types:
            self.validate_block_types(self.block_types)
