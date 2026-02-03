"""Block configuration schemas.

TypedDict definitions for each block type's configuration.
These provide type hints and can be used for validation.
"""

from typing import Any, NotRequired, Required, TypedDict


class HeroConfig(TypedDict, total=False):
    """Hero block configuration."""

    headline: Required[str]
    subheadline: NotRequired[str]
    buttonText: NotRequired[str]
    buttonLink: NotRequired[str]
    backgroundType: NotRequired[str]  # "gradient", "image", "solid"
    backgroundImage: NotRequired[str]
    gradientFrom: NotRequired[str]
    gradientTo: NotRequired[str]
    backgroundColor: NotRequired[str]
    textAlign: NotRequired[str]  # "left", "center", "right"
    showButton: NotRequired[bool]


class FeatureItem(TypedDict, total=False):
    """A single feature item."""

    icon: Required[str]
    title: Required[str]
    description: Required[str]


class FeaturesConfig(TypedDict, total=False):
    """Features block configuration."""

    title: Required[str]
    subtitle: NotRequired[str]
    columns: NotRequired[int]  # 2, 3, or 4
    items: Required[list[FeatureItem]]


class TestimonialItem(TypedDict, total=False):
    """A single testimonial."""

    quote: Required[str]
    author: Required[str]
    company: NotRequired[str]
    avatar: NotRequired[str]
    is_real: NotRequired[bool]  # Whether this is real or AI-generated concept


class TestimonialsConfig(TypedDict, total=False):
    """Testimonials block configuration."""

    title: NotRequired[str]
    items: Required[list[TestimonialItem]]


class StatItem(TypedDict, total=False):
    """A single stat/metric."""

    value: Required[str]
    label: Required[str]
    source: NotRequired[str]  # Where this stat came from
    is_real: NotRequired[bool]  # Whether this is real or placeholder


class StatsConfig(TypedDict, total=False):
    """Stats block configuration."""

    title: NotRequired[str]
    items: Required[list[StatItem]]


class CTAConfig(TypedDict, total=False):
    """CTA block configuration."""

    headline: Required[str]
    description: NotRequired[str]
    buttonText: NotRequired[str]
    buttonLink: NotRequired[str]
    backgroundColor: NotRequired[str]
    textColor: NotRequired[str]  # "light" or "dark"


class FAQItem(TypedDict):
    """A single FAQ item."""

    question: str
    answer: str


class FAQConfig(TypedDict, total=False):
    """FAQ block configuration."""

    title: NotRequired[str]
    items: Required[list[FAQItem]]


class FormBlockConfig(TypedDict, total=False):
    """Form block configuration."""

    formId: Required[str]
    title: NotRequired[str]
    description: NotRequired[str]


class ChatBlockConfig(TypedDict, total=False):
    """Chat block configuration."""

    title: NotRequired[str]
    subtitle: NotRequired[str]
    placeholder: NotRequired[str]
    position: NotRequired[str]  # "inline" or "floating"
    primaryColor: NotRequired[str]


class TextConfig(TypedDict, total=False):
    """Text/content block configuration."""

    content: Required[str]  # Markdown content
    align: NotRequired[str]


class ImageConfig(TypedDict, total=False):
    """Image block configuration."""

    src: Required[str]
    alt: NotRequired[str]
    caption: NotRequired[str]


class VideoConfig(TypedDict, total=False):
    """Video embed block configuration."""

    url: Required[str]
    title: NotRequired[str]


class DividerConfig(TypedDict, total=False):
    """Divider block configuration."""

    style: NotRequired[str]  # "line", "dots", "space"
    color: NotRequired[str]


class PricingTier(TypedDict, total=False):
    """A single pricing tier."""

    name: Required[str]
    price: Required[str]
    description: NotRequired[str]
    features: NotRequired[list[str]]
    cta_text: NotRequired[str]
    highlighted: NotRequired[bool]


class PricingConfig(TypedDict, total=False):
    """Pricing block configuration."""

    title: NotRequired[str]
    subtitle: NotRequired[str]
    tiers: Required[list[PricingTier]]


# Type alias for any block config
BlockConfig = (
    HeroConfig
    | FeaturesConfig
    | TestimonialsConfig
    | StatsConfig
    | CTAConfig
    | FAQConfig
    | FormBlockConfig
    | ChatBlockConfig
    | TextConfig
    | ImageConfig
    | VideoConfig
    | DividerConfig
    | PricingConfig
)

# Gallery Block
class GalleryImage(TypedDict, total=False):
    """A single gallery image."""

    url: Required[str]
    alt: NotRequired[str]
    caption: NotRequired[str]


class GalleryConfig(TypedDict, total=False):
    """Gallery block configuration."""

    title: NotRequired[str]
    images: Required[list[GalleryImage]]
    columns: NotRequired[int]  # 2, 3, or 4
    showCaptions: NotRequired[bool]
    enableLightbox: NotRequired[bool]


# Slider Block
class SliderSlide(TypedDict, total=False):
    """A single slider slide."""

    imageUrl: Required[str]
    headline: NotRequired[str]
    description: NotRequired[str]
    buttonText: NotRequired[str]
    buttonLink: NotRequired[str]


class SliderConfig(TypedDict, total=False):
    """Slider block configuration."""

    slides: Required[list[SliderSlide]]
    autoplay: NotRequired[bool]
    autoplayInterval: NotRequired[int]
    showDots: NotRequired[bool]
    showArrows: NotRequired[bool]


# Logo Cloud Block
class LogoItem(TypedDict, total=False):
    """A single logo."""

    name: Required[str]
    url: Required[str]
    link: NotRequired[str]


class LogoCloudConfig(TypedDict, total=False):
    """Logo cloud block configuration."""

    title: NotRequired[str]
    subtitle: NotRequired[str]
    logos: Required[list[LogoItem]]
    grayscale: NotRequired[bool]


# Schema registry mapping block types to their config types
# Used for validation and documentation
BLOCK_SCHEMAS: dict[str, type] = {
    "hero": HeroConfig,
    "features": FeaturesConfig,
    "testimonials": TestimonialsConfig,
    "stats": StatsConfig,
    "cta": CTAConfig,
    "faq": FAQConfig,
    "form": FormBlockConfig,
    "chat": ChatBlockConfig,
    "text": TextConfig,
    "image": ImageConfig,
    "video": VideoConfig,
    "divider": DividerConfig,
    "pricing": PricingConfig,
    "gallery": GalleryConfig,
    "slider": SliderConfig,
    "logo-cloud": LogoCloudConfig,
}


def validate_block_config(block_type: str, config: dict[str, Any]) -> list[str]:
    """Validate a block config against its schema.

    Args:
        block_type: The type of block.
        config: The block configuration.

    Returns:
        List of validation error messages (empty if valid).
    """
    errors: list[str] = []

    schema = BLOCK_SCHEMAS.get(block_type)
    if not schema:
        return errors  # Unknown block type, no validation

    # Get required keys from the TypedDict
    required_keys = getattr(schema, "__required_keys__", set())

    for key in required_keys:
        if key not in config:
            errors.append(f"Missing required field '{key}' for {block_type} block")

    return errors


# Default configs for each block type
DEFAULT_BLOCK_CONFIGS: dict[str, dict[str, Any]] = {
    "hero": {
        "headline": "Welcome",
        "subheadline": "",
        "buttonText": "Get Started",
        "buttonLink": "#contact",
        "backgroundType": "gradient",
        "gradientFrom": "#1e1b4b",
        "gradientTo": "#312e81",
        "textAlign": "center",
        "showButton": True,
    },
    "features": {
        "title": "Why Choose Us",
        "subtitle": "",
        "columns": 3,
        "items": [],
    },
    "testimonials": {
        "title": "What People Say",
        "items": [],
    },
    "stats": {
        "title": "",
        "items": [],
    },
    "cta": {
        "headline": "Ready to Get Started?",
        "description": "",
        "buttonText": "Get Started",
        "buttonLink": "#contact",
        "backgroundColor": "#6366f1",
        "textColor": "light",
    },
    "faq": {
        "title": "Frequently Asked Questions",
        "items": [],
    },
    "form": {
        "formId": "",
        "title": "Get in Touch",
        "description": "Fill out the form and we'll be in touch shortly.",
    },
    "chat": {
        "title": "Questions?",
        "subtitle": "Chat with us for instant answers",
        "placeholder": "Type your question...",
        "position": "inline",
        "primaryColor": "#6366f1",
    },
    "gallery": {
        "title": "Gallery",
        "images": [],
        "columns": 3,
        "showCaptions": True,
        "enableLightbox": True,
    },
    "slider": {
        "slides": [],
        "autoplay": True,
        "autoplayInterval": 5000,
        "showDots": True,
        "showArrows": True,
    },
    "logo-cloud": {
        "title": "Trusted By",
        "subtitle": "",
        "logos": [],
        "grayscale": True,
    },
}
