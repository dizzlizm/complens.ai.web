"""Business Profile model for AI context.

Stores comprehensive information about a business/user to provide
context for all AI operations (page generation, block improvement,
workflow generation, chat responses, etc.).
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.base import BaseModel


class Industry(str, Enum):
    """Industry categories."""
    TECHNOLOGY = "technology"
    ECOMMERCE = "ecommerce"
    CONSULTING = "consulting"
    HEALTHCARE = "healthcare"
    FINANCE = "finance"
    EDUCATION = "education"
    REAL_ESTATE = "real_estate"
    MARKETING = "marketing"
    CREATIVE = "creative"
    PROFESSIONAL_SERVICES = "professional_services"
    RETAIL = "retail"
    HOSPITALITY = "hospitality"
    NONPROFIT = "nonprofit"
    OTHER = "other"


class BusinessType(str, Enum):
    """Type of business."""
    SAAS = "saas"
    AGENCY = "agency"
    FREELANCER = "freelancer"
    ECOMMERCE_STORE = "ecommerce_store"
    LOCAL_BUSINESS = "local_business"
    CONSULTANT = "consultant"
    COACH = "coach"
    CREATOR = "creator"
    NONPROFIT = "nonprofit"
    OTHER = "other"


class BrandVoice(str, Enum):
    """Brand voice/tone."""
    PROFESSIONAL = "professional"
    FRIENDLY = "friendly"
    BOLD = "bold"
    PLAYFUL = "playful"
    AUTHORITATIVE = "authoritative"
    CASUAL = "casual"
    INSPIRATIONAL = "inspirational"
    TECHNICAL = "technical"


class Product(PydanticBaseModel):
    """A product or service offered."""
    name: str
    description: str
    price: str | None = None  # e.g., "$99/month", "Starting at $500"
    features: list[str] = Field(default_factory=list)
    target_audience: str | None = None


class TeamMember(PydanticBaseModel):
    """A team member or key person."""
    name: str
    role: str
    bio: str | None = None
    image_url: str | None = None


class Testimonial(PydanticBaseModel):
    """A customer testimonial."""
    quote: str
    author_name: str
    author_title: str | None = None
    company: str | None = None
    image_url: str | None = None


class FAQ(PydanticBaseModel):
    """A frequently asked question."""
    question: str
    answer: str


class BusinessProfile(BaseModel):
    """Comprehensive business profile for AI context.

    This profile is stored per workspace and provides context for all
    AI-powered features throughout the platform.
    """

    # Core identity
    id: str = Field(default_factory=lambda: str(uuid4()))
    workspace_id: str
    page_id: str | None = None  # If set, this is a page-specific profile
    business_name: str = ""
    tagline: str = ""  # Short memorable phrase
    description: str = ""  # Longer description (2-3 sentences)

    # Classification
    industry: Industry = Industry.OTHER
    business_type: BusinessType = BusinessType.OTHER

    # Target audience
    target_audience: str = ""  # Who they serve
    ideal_customer: str = ""  # Description of ideal customer
    customer_pain_points: list[str] = Field(default_factory=list)

    # Value proposition
    unique_value_proposition: str = ""  # What makes them different
    key_benefits: list[str] = Field(default_factory=list)
    differentiators: list[str] = Field(default_factory=list)  # vs competitors

    # Brand
    brand_voice: BrandVoice = BrandVoice.PROFESSIONAL
    brand_values: list[str] = Field(default_factory=list)
    brand_personality: str = ""  # e.g., "Innovative yet approachable"

    # Products/Services
    products: list[Product] = Field(default_factory=list)
    pricing_model: str = ""  # e.g., "subscription", "one-time", "hourly"

    # Social proof
    testimonials: list[Testimonial] = Field(default_factory=list)
    notable_clients: list[str] = Field(default_factory=list)
    achievements: list[str] = Field(default_factory=list)  # Awards, metrics, milestones

    # Team
    team_members: list[TeamMember] = Field(default_factory=list)
    founder_story: str = ""

    # Content
    faqs: list[FAQ] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)  # SEO keywords

    # Contact
    contact_email: str = ""
    phone: str = ""
    address: str = ""
    website: str = ""
    social_links: dict[str, str] = Field(default_factory=dict)  # platform -> url

    # AI learning
    ai_notes: str = ""  # Additional context for AI
    conversation_history: list[dict] = Field(default_factory=list)  # Q&A from onboarding

    # Profile completeness
    onboarding_completed: bool = False
    profile_score: int = 0  # 0-100 completeness score

    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def get_keys(self) -> dict[str, str]:
        """DynamoDB key structure for business profile.

        Page-specific profiles use: PK=WS#{ws_id}, SK=PROFILE#PAGE#{page_id}
        Workspace profiles use: PK=WS#{ws_id}, SK=BUSINESS_PROFILE
        """
        if self.page_id:
            return {
                "PK": f"WS#{self.workspace_id}",
                "SK": f"PROFILE#PAGE#{self.page_id}",
            }
        return {
            "PK": f"WS#{self.workspace_id}",
            "SK": "BUSINESS_PROFILE",
        }

    def get_gsi1_keys(self) -> dict[str, str] | None:
        """GSI1 not used for business profile."""
        return None

    def get_gsi2_keys(self) -> dict[str, str] | None:
        """GSI2 not used for business profile."""
        return None

    def calculate_profile_score(self) -> int:
        """Calculate profile completeness score (0-100)."""
        score = 0
        max_score = 100

        # Core identity (25 points)
        if self.business_name:
            score += 10
        if self.tagline:
            score += 5
        if self.description:
            score += 10

        # Classification (10 points) - handle both enum and string values
        industry_val = self.industry.value if hasattr(self.industry, 'value') else str(self.industry)
        business_type_val = self.business_type.value if hasattr(self.business_type, 'value') else str(self.business_type)
        if industry_val != "other":
            score += 5
        if business_type_val != "other":
            score += 5

        # Target audience (15 points)
        if self.target_audience:
            score += 10
        if self.customer_pain_points:
            score += 5

        # Value proposition (15 points)
        if self.unique_value_proposition:
            score += 10
        if self.key_benefits:
            score += 5

        # Brand (10 points) - handle both enum and string values
        brand_voice_val = self.brand_voice.value if hasattr(self.brand_voice, 'value') else str(self.brand_voice)
        if brand_voice_val != "professional":  # Changed from default
            score += 5
        if self.brand_values:
            score += 5

        # Products (15 points)
        if self.products:
            score += 15

        # Social proof (10 points)
        if self.testimonials:
            score += 5
        if self.achievements:
            score += 5

        self.profile_score = min(score, max_score)
        return self.profile_score

    def get_ai_context(self) -> str:
        """Generate a context string for AI prompts.

        This is the key method that provides context to all AI operations.
        Returns a formatted string with all relevant business information.
        """
        parts = []

        # Business identity
        parts.append("=== BUSINESS CONTEXT ===")
        if self.business_name:
            parts.append(f"Business: {self.business_name}")
        if self.tagline:
            parts.append(f"Tagline: {self.tagline}")
        if self.description:
            parts.append(f"Description: {self.description}")

        # Classification - handle both enum and string values (DynamoDB stores as string)
        industry_val = self.industry.value if hasattr(self.industry, 'value') else str(self.industry)
        business_type_val = self.business_type.value if hasattr(self.business_type, 'value') else str(self.business_type)
        if industry_val != "other":
            parts.append(f"Industry: {industry_val.replace('_', ' ').title()}")
        if business_type_val != "other":
            parts.append(f"Type: {business_type_val.replace('_', ' ').title()}")

        # Target audience
        if self.target_audience:
            parts.append(f"\nTarget Audience: {self.target_audience}")
        if self.ideal_customer:
            parts.append(f"Ideal Customer: {self.ideal_customer}")
        if self.customer_pain_points:
            parts.append(f"Customer Pain Points: {', '.join(self.customer_pain_points)}")

        # Value proposition
        if self.unique_value_proposition:
            parts.append(f"\nValue Proposition: {self.unique_value_proposition}")
        if self.key_benefits:
            parts.append(f"Key Benefits: {', '.join(self.key_benefits)}")
        if self.differentiators:
            parts.append(f"Differentiators: {', '.join(self.differentiators)}")

        # Brand voice - handle both enum and string values
        brand_voice_val = self.brand_voice.value if hasattr(self.brand_voice, 'value') else str(self.brand_voice)
        parts.append(f"\nBrand Voice: {brand_voice_val.title()}")
        if self.brand_personality:
            parts.append(f"Brand Personality: {self.brand_personality}")
        if self.brand_values:
            parts.append(f"Brand Values: {', '.join(self.brand_values)}")

        # Products/Services
        if self.products:
            parts.append("\nProducts/Services:")
            for product in self.products[:5]:  # Limit to 5
                parts.append(f"  - {product.name}: {product.description}")
                if product.price:
                    parts.append(f"    Price: {product.price}")

        # Social proof
        if self.achievements:
            parts.append(f"\nAchievements: {', '.join(self.achievements[:5])}")
        if self.notable_clients:
            parts.append(f"Notable Clients: {', '.join(self.notable_clients[:5])}")

        # Additional AI notes
        if self.ai_notes:
            parts.append(f"\nAdditional Context: {self.ai_notes}")

        return "\n".join(parts)


class CreateBusinessProfileRequest(PydanticBaseModel):
    """Request to create a business profile."""
    business_name: str = ""
    tagline: str = ""
    description: str = ""
    industry: Industry | None = None
    business_type: BusinessType | None = None
    target_audience: str = ""
    brand_voice: BrandVoice | None = None


class UpdateBusinessProfileRequest(PydanticBaseModel):
    """Request to update a business profile."""
    business_name: str | None = None
    tagline: str | None = None
    description: str | None = None
    industry: Industry | None = None
    business_type: BusinessType | None = None
    target_audience: str | None = None
    ideal_customer: str | None = None
    customer_pain_points: list[str] | None = None
    unique_value_proposition: str | None = None
    key_benefits: list[str] | None = None
    differentiators: list[str] | None = None
    brand_voice: BrandVoice | None = None
    brand_values: list[str] | None = None
    brand_personality: str | None = None
    products: list[Product] | None = None
    pricing_model: str | None = None
    testimonials: list[Testimonial] | None = None
    notable_clients: list[str] | None = None
    achievements: list[str] | None = None
    team_members: list[TeamMember] | None = None
    founder_story: str | None = None
    faqs: list[FAQ] | None = None
    keywords: list[str] | None = None
    contact_email: str | None = None
    phone: str | None = None
    address: str | None = None
    website: str | None = None
    social_links: dict[str, str] | None = None
    ai_notes: str | None = None
    onboarding_completed: bool | None = None


class AIOnboardingQuestion(PydanticBaseModel):
    """A question in the AI onboarding flow."""
    id: str
    question: str
    field: str  # Which profile field this populates
    input_type: str = "text"  # text, textarea, select, multiselect
    options: list[str] | None = None  # For select/multiselect
    placeholder: str = ""
    required: bool = False


class AIOnboardingResponse(PydanticBaseModel):
    """Response to an AI onboarding question."""
    question_id: str
    answer: str | list[str]


# Onboarding questions for AI to ask
ONBOARDING_QUESTIONS = [
    AIOnboardingQuestion(
        id="business_name",
        question="What's the name of your business or brand?",
        field="business_name",
        input_type="text",
        placeholder="e.g., Acme Corp, John Smith Consulting",
        required=True,
    ),
    AIOnboardingQuestion(
        id="business_type",
        question="What type of business are you?",
        field="business_type",
        input_type="select",
        options=[bt.value for bt in BusinessType],
    ),
    AIOnboardingQuestion(
        id="industry",
        question="What industry are you in?",
        field="industry",
        input_type="select",
        options=[ind.value for ind in Industry],
    ),
    AIOnboardingQuestion(
        id="description",
        question="In 2-3 sentences, what does your business do?",
        field="description",
        input_type="textarea",
        placeholder="We help [target audience] achieve [outcome] through [method]...",
    ),
    AIOnboardingQuestion(
        id="target_audience",
        question="Who is your ideal customer? Be specific!",
        field="target_audience",
        input_type="textarea",
        placeholder="e.g., Small business owners with 10-50 employees who struggle with...",
    ),
    AIOnboardingQuestion(
        id="pain_points",
        question="What are the top 3 problems your customers face?",
        field="customer_pain_points",
        input_type="textarea",
        placeholder="1. They spend too much time on...\n2. They can't find...\n3. They lose money because...",
    ),
    AIOnboardingQuestion(
        id="unique_value",
        question="What makes you different from competitors?",
        field="unique_value_proposition",
        input_type="textarea",
        placeholder="Unlike others who [common approach], we [your unique approach]...",
    ),
    AIOnboardingQuestion(
        id="brand_voice",
        question="How would you describe your brand's voice?",
        field="brand_voice",
        input_type="select",
        options=[bv.value for bv in BrandVoice],
    ),
    AIOnboardingQuestion(
        id="achievements",
        question="What are your biggest achievements, metrics, or social proof?",
        field="achievements",
        input_type="textarea",
        placeholder="e.g., Helped 500+ clients, $2M in savings, Featured in Forbes...",
    ),
]
