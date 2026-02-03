"""AI Page Builder Synthesis Engine.

Replaces the block assembly approach with a unified synthesis engine that creates
cohesive, high-conversion landing pages through a multi-stage pipeline:

1. Intent Analysis - Understand what kind of page is needed
2. Content Assessment - Score available content quality
3. Block Planning - Decide which blocks to include/exclude with layouts
4. Design System - Generate industry-aware colors and styling
5. Content Synthesis - Single AI call for cross-block narrative coherence
6. Block Configuration - Build validated PageBlock list
"""

import json
import re
from typing import Any
from uuid import uuid4

import structlog

from complens.models.business_profile import BusinessProfile
from complens.models.synthesis import (
    BlockPlan,
    ColorScheme,
    ContentAssessment,
    DesignSystem,
    FormConfig,
    PageBlock,
    PageGoal,
    PageIntent,
    PlannedBlock,
    SeoConfig,
    SynthesisMetadata,
    SynthesisResult,
    SynthesizedBlockContent,
    SynthesizedContent,
    SynthesizedSeo,
    WorkflowConfig,
)
from complens.repositories.business_profile import BusinessProfileRepository
from complens.services.ai_service import invoke_claude_json

logger = structlog.get_logger()


# Intent to block mapping: which blocks are required/conditional/excluded per goal
INTENT_BLOCK_MAPPING: dict[str, dict[str, list[str]]] = {
    "lead-gen": {
        "required": ["hero", "features", "cta", "form"],
        "conditional": ["testimonials", "faq", "stats"],
        "excluded": ["pricing"],
    },
    "portfolio": {
        "required": ["hero", "features"],
        "conditional": ["testimonials", "cta", "stats"],
        "excluded": ["pricing", "form"],
    },
    "product-launch": {
        "required": ["hero", "features", "pricing", "cta"],
        "conditional": ["testimonials", "faq", "stats"],
        "excluded": [],
    },
    "services": {
        "required": ["hero", "features", "cta"],
        "conditional": ["testimonials", "faq", "pricing", "stats"],
        "excluded": [],
    },
    "coming-soon": {
        "required": ["hero", "form"],
        "conditional": ["stats"],
        "excluded": ["features", "testimonials", "faq", "pricing", "cta"],
    },
    "event": {
        "required": ["hero", "features", "cta", "form"],
        "conditional": ["faq", "stats"],
        "excluded": ["pricing", "testimonials"],
    },
    "comparison": {
        "required": ["hero", "features", "cta"],
        "conditional": ["pricing", "faq", "testimonials"],
        "excluded": [],
    },
}

# Industry to color mapping for design system
INDUSTRY_COLORS: dict[str, ColorScheme] = {
    "technology": ColorScheme(
        primary="#3B82F6", secondary="#60A5FA", accent="#DBEAFE"
    ),
    "healthcare": ColorScheme(
        primary="#10B981", secondary="#34D399", accent="#D1FAE5"
    ),
    "finance": ColorScheme(
        primary="#1E3A8A", secondary="#3B82F6", accent="#DBEAFE"
    ),
    "creative": ColorScheme(
        primary="#EC4899", secondary="#F472B6", accent="#FCE7F3"
    ),
    "real_estate": ColorScheme(
        primary="#166534", secondary="#22C55E", accent="#DCFCE7"
    ),
    "education": ColorScheme(
        primary="#3B82F6", secondary="#F97316", accent="#FFEDD5"
    ),
    "consulting": ColorScheme(
        primary="#1E40AF", secondary="#3B82F6", accent="#DBEAFE"
    ),
    "retail": ColorScheme(
        primary="#DC2626", secondary="#F87171", accent="#FEE2E2"
    ),
    "hospitality": ColorScheme(
        primary="#F59E0B", secondary="#FBBF24", accent="#FEF3C7"
    ),
    "marketing": ColorScheme(
        primary="#8B5CF6", secondary="#A78BFA", accent="#EDE9FE"
    ),
}


class SynthesisEngine:
    """Unified page synthesis engine."""

    def __init__(self) -> None:
        """Initialize the synthesis engine."""
        self.profile_repo = BusinessProfileRepository()

    def synthesize(
        self,
        workspace_id: str,
        description: str,
        page_id: str | None = None,
        intent_hints: list[str] | None = None,
        style_preference: str | None = None,
        include_form: bool = True,
        include_chat: bool = True,
        block_types: list[str] | None = None,
    ) -> SynthesisResult:
        """Main entry point for page synthesis.

        Orchestrates all six stages of the synthesis pipeline.

        Args:
            workspace_id: The workspace ID.
            description: User's description of what they want.
            page_id: Optional existing page ID for update mode.
            intent_hints: Optional hints like ['lead-gen', 'portfolio'].
            style_preference: Optional style like 'professional', 'bold'.
            include_form: Whether to include a form block.
            include_chat: Whether to include a chat block.
            block_types: Optional list of specific block types to generate.
                         If provided, only these blocks will be generated.

        Returns:
            Complete SynthesisResult with all blocks and metadata.
        """
        logger.info(
            "Starting page synthesis",
            workspace_id=workspace_id,
            has_page_id=bool(page_id),
            description_length=len(description),
        )

        stages_executed: list[str] = []

        # Get business profile for context
        profile = self._get_profile(workspace_id, page_id)

        # Stage 1: Intent Analysis
        logger.debug("Stage 1: Analyzing intent")
        intent = self._analyze_intent(description, intent_hints, profile)
        stages_executed.append("intent_analysis")

        # Stage 2: Content Assessment
        logger.debug("Stage 2: Assessing content")
        assessment = self._assess_content(profile, description, intent)
        stages_executed.append("content_assessment")

        # Stage 3: Block Planning
        logger.debug("Stage 3: Planning blocks")
        plan = self._plan_blocks(intent, assessment, include_form, include_chat, block_types)
        stages_executed.append("block_planning")

        # Stage 4: Design System
        logger.debug("Stage 4: Generating design system")
        design = self._generate_design_system(profile, intent, style_preference)
        stages_executed.append("design_system")

        # Stage 5: Content Synthesis
        logger.debug("Stage 5: Synthesizing content")
        synthesized = self._synthesize_content(
            profile, description, intent, plan, design
        )
        stages_executed.append("content_synthesis")

        # Stage 6: Block Configuration
        logger.debug("Stage 6: Configuring blocks")
        blocks = self._configure_blocks(plan, synthesized, design)
        stages_executed.append("block_configuration")

        # Build form config if needed
        form_config = None
        if include_form:
            form_config = self._create_form_config(intent, design, synthesized)

        # Build workflow config
        workflow_config = self._create_workflow_config(intent, synthesized)

        # Build metadata
        metadata = SynthesisMetadata(
            blocks_included=[b.type for b in blocks],
            blocks_excluded=plan.excluded,
            layout_decisions={
                "strategy": plan.layout_strategy,
                "rationale": plan.sequence_rationale,
            },
            content_sources={
                pb.type: pb.content_source for pb in plan.blocks
            },
            generation_stages=stages_executed,
        )

        # Build SEO config from synthesized content
        # Truncate to fit Pydantic validation limits (AI may generate longer content)
        meta_title = (synthesized.seo.meta_title if synthesized.seo else "") or ""
        meta_description = (synthesized.seo.meta_description if synthesized.seo else "") or ""

        # Truncate with ellipsis if exceeds limits
        if len(meta_title) > 70:
            meta_title = meta_title[:67] + "..."
        if len(meta_description) > 160:
            meta_description = meta_description[:157] + "..."

        seo = SeoConfig(
            meta_title=meta_title,
            meta_description=meta_description,
        )

        result = SynthesisResult(
            synthesis_id=str(uuid4()),
            intent=intent,
            assessment=assessment,
            design_system=design,
            blocks=blocks,
            form_config=form_config,
            workflow_config=workflow_config,
            metadata=metadata,
            seo=seo,
            business_name=synthesized.business_name or profile.business_name or "",
            tagline=synthesized.tagline or profile.tagline or "",
        )

        logger.info(
            "Synthesis complete",
            synthesis_id=result.synthesis_id,
            blocks_count=len(blocks),
            excluded_count=len(plan.excluded),
        )

        return result

    def _get_profile(
        self, workspace_id: str, page_id: str | None = None
    ) -> BusinessProfile:
        """Get the business profile for context."""
        return self.profile_repo.get_or_create(workspace_id, page_id)

    def _analyze_intent(
        self,
        description: str,
        intent_hints: list[str] | None,
        profile: BusinessProfile,
    ) -> PageIntent:
        """Stage 1: Analyze what kind of page the user needs.

        Uses AI to determine the page goal, audience intent, and urgency.
        """
        # Build context from profile
        profile_context = ""
        if profile.business_name:
            profile_context += f"Business: {profile.business_name}\n"
        if profile.industry:
            profile_context += f"Industry: {profile.industry}\n"
        if profile.business_type:
            profile_context += f"Type: {profile.business_type}\n"
        if profile.target_audience:
            profile_context += f"Target Audience: {profile.target_audience}\n"

        hint_context = ""
        if intent_hints:
            hint_context = f"\nUser hints: {', '.join(intent_hints)}"

        prompt = f"""Analyze this page request and determine the intent.

Business Context:
{profile_context or "No business profile available."}

User Description:
{description}
{hint_context}

Return JSON with:
{{
  "goal": "lead-gen|portfolio|product-launch|services|coming-soon|event|comparison",
  "audience_intent": "What the visitor should do (e.g., 'contact us for a quote')",
  "content_type": "Type of business/content (e.g., 'b2b saas', 'personal brand')",
  "urgency": "low|medium|high",
  "keywords": ["key", "terms", "extracted"]
}}

Choose the goal that best matches:
- lead-gen: Getting contact info, lead magnets, consultation booking
- portfolio: Showcasing work, projects, case studies
- product-launch: Launching a product with pricing
- services: Service business offerings
- coming-soon: Pre-launch teaser page
- event: Event/webinar promotion
- comparison: Product comparison or feature breakdown"""

        system = "You are an expert at understanding marketing page requirements. Return only valid JSON."

        try:
            result = invoke_claude_json(prompt, system)

            # Map goal string to enum
            goal_str = result.get("goal", "lead-gen")
            try:
                goal = PageGoal(goal_str)
            except ValueError:
                goal = PageGoal.LEAD_GEN

            return PageIntent(
                goal=goal,
                audience_intent=result.get("audience_intent", "Contact us to learn more"),
                content_type=result.get("content_type", "business"),
                urgency=result.get("urgency", "medium"),
                keywords=result.get("keywords", []),
            )

        except Exception as e:
            logger.warning("Intent analysis failed, using defaults", error=str(e))
            # Fallback based on hints or default
            if intent_hints and "portfolio" in intent_hints:
                goal = PageGoal.PORTFOLIO
            elif intent_hints and "product" in intent_hints:
                goal = PageGoal.PRODUCT_LAUNCH
            else:
                goal = PageGoal.LEAD_GEN

            return PageIntent(
                goal=goal,
                audience_intent="Contact us to learn more",
                content_type="business",
                urgency="medium",
                keywords=[],
            )

    def _assess_content(
        self,
        profile: BusinessProfile,
        description: str,
        intent: PageIntent,
    ) -> ContentAssessment:
        """Stage 2: Assess the quality and availability of content.

        Scores testimonials, stats, features, pricing, FAQ to determine
        what can be included with real content vs. AI-generated.
        """
        assessment = ContentAssessment()

        # Assess testimonials
        if profile.testimonials:
            assessment.testimonials_count = len(profile.testimonials)
            assessment.testimonials_real = True
            # Score based on quality indicators
            score = min(10, len(profile.testimonials) * 3)
            if any(t.company for t in profile.testimonials):
                score += 2
            if any(t.image_url for t in profile.testimonials):
                score += 1
            assessment.testimonials_score = min(10, score)
        else:
            assessment.gaps.append("No real testimonials in profile")

        # Assess stats - extract real numbers from profile and description
        stats_items = []

        # Check achievements for numbers
        number_pattern = re.compile(r"(\d+[\d,]*\+?)\s*(\w+)")
        for achievement in profile.achievements:
            matches = number_pattern.findall(achievement)
            for match in matches:
                stats_items.append({"value": match[0], "label": match[1], "source": "profile"})

        # Check description for numbers
        desc_matches = number_pattern.findall(description)
        for match in desc_matches:
            stats_items.append({"value": match[0], "label": match[1], "source": "description"})

        if stats_items:
            assessment.stats_items = stats_items[:4]  # Max 4 stats
            assessment.stats_real = True
            assessment.stats_score = min(10, len(stats_items) * 2 + 3)
            assessment.strengths.append(f"{len(stats_items)} real statistics found")
        else:
            assessment.gaps.append("No real statistics available")

        # Assess features
        if profile.products:
            assessment.features_count = sum(
                len(p.features) for p in profile.products if p.features
            )
            assessment.features_score = min(10, assessment.features_count * 2 + 3)
            if assessment.features_count > 0:
                assessment.strengths.append(f"{assessment.features_count} product features")
        elif profile.key_benefits:
            assessment.features_count = len(profile.key_benefits)
            assessment.features_score = min(10, len(profile.key_benefits) * 2)
            assessment.strengths.append(f"{len(profile.key_benefits)} key benefits")
        else:
            assessment.features_score = 3  # Will need to generate
            assessment.gaps.append("Limited feature/benefit information")

        # Assess pricing
        if profile.products and any(p.price for p in profile.products):
            assessment.pricing_available = True
            assessment.pricing_items = [
                {"name": p.name, "price": p.price, "description": p.description}
                for p in profile.products if p.price
            ]
            assessment.strengths.append("Pricing information available")
        else:
            assessment.gaps.append("No pricing data available")

        # Assess FAQ
        if profile.faqs:
            assessment.faq_count = len(profile.faqs)
            assessment.faq_score = min(10, len(profile.faqs) * 2)
            assessment.strengths.append(f"{len(profile.faqs)} FAQ items")
        else:
            assessment.faq_score = 3  # Will need to generate

        return assessment

    def _plan_blocks(
        self,
        intent: PageIntent,
        assessment: ContentAssessment,
        include_form: bool,
        include_chat: bool,
        block_types: list[str] | None = None,
    ) -> BlockPlan:
        """Stage 3: Plan which blocks to include and their layout.

        Makes intelligent decisions about:
        - Which blocks to include based on intent and content quality
        - Block sequence for optimal conversion
        - Block widths for side-by-side layouts

        Args:
            intent: Analyzed page intent.
            assessment: Content quality assessment.
            include_form: Whether to include a form block.
            include_chat: Whether to include a chat block.
            block_types: If provided, only include these specific block types.
        """
        goal = intent.goal.value
        mapping = INTENT_BLOCK_MAPPING.get(goal, INTENT_BLOCK_MAPPING["lead-gen"])

        planned_blocks: list[PlannedBlock] = []
        excluded: dict[str, str] = {}

        # If block_types is specified, use constrained planning
        if block_types:
            return self._plan_blocks_constrained(
                intent, assessment, block_types, include_form, include_chat
            )

        # Start with hero (always included)
        planned_blocks.append(
            PlannedBlock(
                type="hero",
                width=4,
                emphasis="high",
                content_source="generated",
            )
        )

        # Features block
        if "features" in mapping["required"] or "features" in mapping["conditional"]:
            planned_blocks.append(
                PlannedBlock(
                    type="features",
                    width=4,
                    emphasis="high" if goal == "portfolio" else "medium",
                    content_source="profile" if assessment.features_score >= 5 else "generated",
                )
            )

        # Stats block - only if we have real stats
        if assessment.stats_score >= 5 and "stats" not in mapping["excluded"]:
            planned_blocks.append(
                PlannedBlock(
                    type="stats",
                    width=4,
                    emphasis="high" if assessment.stats_real else "low",
                    content_source="profile" if assessment.stats_real else "generated",
                    config_hints={"items": assessment.stats_items},
                )
            )
        elif "stats" in mapping["conditional"]:
            excluded["stats"] = "No real statistics available (score: {})".format(
                assessment.stats_score
            )

        # Testimonials - only if quality is sufficient
        if assessment.testimonials_score >= 5 and "testimonials" not in mapping["excluded"]:
            planned_blocks.append(
                PlannedBlock(
                    type="testimonials",
                    width=4,
                    emphasis="medium",
                    content_source="profile",
                )
            )
        elif "testimonials" in mapping["conditional"]:
            excluded["testimonials"] = "No real testimonials in profile (score: {})".format(
                assessment.testimonials_score
            )

        # FAQ block
        if assessment.faq_score >= 3 and "faq" not in mapping["excluded"]:
            planned_blocks.append(
                PlannedBlock(
                    type="faq",
                    width=4,
                    emphasis="low",
                    content_source="profile" if assessment.faq_count > 0 else "generated",
                )
            )

        # Pricing block - only if we have pricing data and it's relevant
        if assessment.pricing_available and "pricing" not in mapping["excluded"]:
            planned_blocks.append(
                PlannedBlock(
                    type="pricing",
                    width=4,
                    emphasis="high",
                    content_source="profile",
                )
            )
        elif "pricing" in mapping["required"]:
            # Product launch needs pricing, generate placeholder
            planned_blocks.append(
                PlannedBlock(
                    type="pricing",
                    width=4,
                    emphasis="high",
                    content_source="generated",
                )
            )

        # Form block - side by side with CTA for lead-gen
        if include_form and "form" not in mapping["excluded"]:
            # Determine layout strategy
            if goal == "lead-gen" and assessment.testimonials_score >= 5:
                # Side-by-side testimonial + form
                # Find testimonials and update width
                for pb in planned_blocks:
                    if pb.type == "testimonials":
                        pb.width = 2
                planned_blocks.append(
                    PlannedBlock(
                        type="form",
                        width=2,
                        emphasis="high",
                        content_source="generated",
                    )
                )
            else:
                planned_blocks.append(
                    PlannedBlock(
                        type="form",
                        width=4,
                        emphasis="high",
                        content_source="generated",
                    )
                )

        # Chat block
        if include_chat and "chat" not in mapping.get("excluded", []):
            planned_blocks.append(
                PlannedBlock(
                    type="chat",
                    width=4,
                    emphasis="low",
                    content_source="generated",
                )
            )

        # CTA block (usually at the end)
        if "cta" not in mapping["excluded"]:
            planned_blocks.append(
                PlannedBlock(
                    type="cta",
                    width=4,
                    emphasis="medium",
                    content_source="generated",
                )
            )

        # Add excluded items from mapping
        for block_type in mapping["excluded"]:
            if block_type not in excluded:
                excluded[block_type] = f"Not relevant for {goal} pages"

        # Determine layout strategy
        has_side_by_side = any(pb.width < 4 for pb in planned_blocks)
        layout_strategy = "side-by-side-cta" if has_side_by_side else "full-width"

        # Build rationale
        rationale_parts = [
            f"Optimized for {goal} goal.",
        ]
        if assessment.strengths:
            rationale_parts.append(f"Leveraging: {', '.join(assessment.strengths[:2])}.")
        if excluded:
            rationale_parts.append(f"Excluded {len(excluded)} blocks with weak content.")

        return BlockPlan(
            blocks=planned_blocks,
            sequence_rationale=" ".join(rationale_parts),
            layout_strategy=layout_strategy,
            excluded=excluded,
        )

    def _plan_blocks_constrained(
        self,
        intent: PageIntent,
        assessment: ContentAssessment,
        block_types: list[str],
        include_form: bool,
        include_chat: bool,
    ) -> BlockPlan:
        """Plan blocks when specific block types are requested.

        This creates a plan with only the requested block types, in a logical
        order based on typical landing page structure.

        Args:
            intent: Analyzed page intent.
            assessment: Content quality assessment.
            block_types: The specific block types to include.
            include_form: Whether form was explicitly requested.
            include_chat: Whether chat was explicitly requested.

        Returns:
            BlockPlan with only the requested blocks.
        """
        # Define a sensible ordering for blocks
        block_order = [
            "hero",
            "features",
            "stats",
            "testimonials",
            "logo-cloud",
            "pricing",
            "faq",
            "gallery",
            "slider",
            "text",
            "image",
            "video",
            "form",
            "chat",
            "cta",
            "divider",
        ]

        # Sort requested blocks by the predefined order
        sorted_types = sorted(
            block_types,
            key=lambda t: block_order.index(t) if t in block_order else len(block_order),
        )

        planned_blocks: list[PlannedBlock] = []

        for block_type in sorted_types:
            # Determine content source based on assessment
            content_source = "generated"
            config_hints: dict[str, Any] = {}

            if block_type == "testimonials" and assessment.testimonials_real:
                content_source = "profile"
            elif block_type == "stats" and assessment.stats_real:
                content_source = "profile"
                config_hints["items"] = assessment.stats_items
            elif block_type == "features" and assessment.features_score >= 5:
                content_source = "profile"
            elif block_type == "faq" and assessment.faq_count > 0:
                content_source = "profile"
            elif block_type == "pricing" and assessment.pricing_available:
                content_source = "profile"

            # Determine emphasis
            emphasis = "medium"
            if block_type in ["hero", "cta"]:
                emphasis = "high"
            elif block_type in ["divider", "chat"]:
                emphasis = "low"

            # Default to full width
            width = 4

            # Special case: form and testimonials side-by-side for lead-gen
            if (
                block_type == "form"
                and "testimonials" in sorted_types
                and intent.goal.value == "lead-gen"
            ):
                width = 2
            if (
                block_type == "testimonials"
                and "form" in sorted_types
                and intent.goal.value == "lead-gen"
            ):
                width = 2

            planned_blocks.append(
                PlannedBlock(
                    type=block_type,
                    width=width,
                    emphasis=emphasis,
                    content_source=content_source,
                    config_hints=config_hints,
                )
            )

        # Build excluded dict for blocks not in the request
        all_block_types = set(block_order)
        excluded = {
            bt: "Not requested by user"
            for bt in all_block_types
            if bt not in block_types
        }

        has_side_by_side = any(pb.width < 4 for pb in planned_blocks)
        layout_strategy = "side-by-side-cta" if has_side_by_side else "full-width"

        rationale = (
            f"User-specified blocks: {', '.join(sorted_types)}. "
            f"Ordered for optimal landing page flow."
        )

        return BlockPlan(
            blocks=planned_blocks,
            sequence_rationale=rationale,
            layout_strategy=layout_strategy,
            excluded=excluded,
        )

    def _generate_design_system(
        self,
        profile: BusinessProfile,
        intent: PageIntent,
        style_preference: str | None,
    ) -> DesignSystem:
        """Stage 4: Generate industry-aware design system.

        Selects colors and style based on industry and intent.
        """
        # Determine style
        style = "professional"
        if style_preference and style_preference in ["professional", "bold", "minimal", "playful"]:
            style = style_preference
        elif intent.urgency == "high":
            style = "bold"
        elif intent.goal == PageGoal.PORTFOLIO:
            style = "minimal"
        elif intent.goal == PageGoal.COMING_SOON:
            style = "minimal"

        # Get industry-based colors
        industry = profile.industry if hasattr(profile.industry, 'value') else str(profile.industry)
        colors = INDUSTRY_COLORS.get(industry, ColorScheme())

        # Adjust colors based on style
        if style == "bold":
            colors.primary = "#DC2626"  # Bold red
            colors.secondary = "#F87171"
        elif style == "minimal":
            colors.primary = "#171717"  # Near black
            colors.secondary = "#525252"
            colors.accent = "#D4D4D4"
        elif style == "playful":
            colors.primary = "#EC4899"  # Pink
            colors.secondary = "#F472B6"
            colors.accent = "#FBCFE8"

        rationale = f"Style '{style}' selected for {intent.goal.value} page"
        if industry != "other":
            rationale += f" in {industry} industry"

        return DesignSystem(
            colors=colors,
            style=style,
            rationale=rationale,
        )

    def _synthesize_content(
        self,
        profile: BusinessProfile,
        description: str,
        intent: PageIntent,
        plan: BlockPlan,
        design: DesignSystem,
    ) -> SynthesizedContent:
        """Stage 5: Generate all block content in a single AI call.

        Creates cohesive content with consistent tone and narrative.
        """
        # Build profile context
        profile_context = profile.get_ai_context() if profile.business_name else ""

        # Build block list for AI
        block_types = [pb.type for pb in plan.blocks]

        prompt = f"""Generate cohesive landing page content for all these blocks: {', '.join(block_types)}

BUSINESS CONTEXT:
{profile_context or "No profile - use description below."}

USER DESCRIPTION:
{description}

PAGE INTENT:
- Goal: {intent.goal.value}
- Audience intent: {intent.audience_intent}
- Content type: {intent.content_type}
- Style: {design.style}

IMPORTANT RULES:
1. ALL content must be consistent in tone and messaging
2. NO placeholder names like "Sarah M." or "James T." - use realistic full names or job titles
3. NO fake stats like "100%", "24/7", "5+" unless from the profile
4. Headlines must be SHORT and PUNCHY (3-6 words)
5. Features focus on BENEFITS not features
6. Include a unifying narrative theme across all blocks

Return JSON:
{{
  "business_name": "Extracted or inferred business name",
  "tagline": "Short memorable tagline (5-10 words)",
  "tone": "professional|friendly|bold|playful",
  "narrative_theme": "The unifying story/theme",
  "seo": {{
    "meta_title": "SEO title (40-60 chars, include business name and key benefit)",
    "meta_description": "Compelling SEO description (120-155 chars, include CTA and value prop)"
  }},
  "blocks": [
    {{
      "block_type": "hero",
      "content": {{
        "headline": "Short Punchy Headline",
        "subheadline": "Compelling value prop (15-25 words)",
        "buttonText": "CTA Text",
        "buttonLink": "#contact"
      }}
    }},
    {{
      "block_type": "features",
      "content": {{
        "title": "Section title",
        "subtitle": "Section subtitle",
        "items": [
          {{"icon": "🚀", "title": "Benefit Title", "description": "Benefit description"}}
        ]
      }}
    }},
    // ... generate content for each block type in the list
  ]
}}

SEO GUIDELINES:
- meta_title: 40-60 characters, format "[Business Name] - [Key Benefit]" or "[Key Benefit] | [Business Name]"
- meta_description: 120-155 characters, action-oriented, include what the visitor will get

Generate content for: {', '.join(block_types)}"""

        system = """You are an expert copywriter creating high-converting landing page content.
Your content must be:
- Cohesive and consistent in tone
- Benefit-focused, not feature-focused
- Free of placeholder content
- Tailored to the specific business and audience

Return only valid JSON."""

        try:
            result = invoke_claude_json(prompt, system, workspace_id=None)

            # Parse blocks
            blocks = []
            for block_data in result.get("blocks", []):
                blocks.append(
                    SynthesizedBlockContent(
                        block_type=block_data.get("block_type", ""),
                        content=block_data.get("content", {}),
                    )
                )

            # Parse SEO metadata
            seo_data = result.get("seo", {})
            seo = SynthesizedSeo(
                meta_title=seo_data.get("meta_title", ""),
                meta_description=seo_data.get("meta_description", ""),
            )

            return SynthesizedContent(
                blocks=blocks,
                business_name=result.get("business_name", ""),
                tagline=result.get("tagline", ""),
                tone=result.get("tone", "professional"),
                narrative_theme=result.get("narrative_theme", ""),
                seo=seo,
            )

        except Exception as e:
            logger.error("Content synthesis failed", error=str(e))
            # Return minimal content
            return SynthesizedContent(
                business_name=profile.business_name or "Business",
                tagline=profile.tagline or "",
                tone="professional",
            )

    def _configure_blocks(
        self,
        plan: BlockPlan,
        synthesized: SynthesizedContent,
        design: DesignSystem,
    ) -> list[PageBlock]:
        """Stage 6: Build validated PageBlock list.

        Combines synthesized content with design system and plan.
        """
        blocks: list[PageBlock] = []

        # Create a lookup for synthesized content
        content_lookup = {
            bc.block_type: bc.content for bc in synthesized.blocks
        }

        for order, planned in enumerate(plan.blocks):
            block_id = str(uuid4())[:8]
            content = content_lookup.get(planned.type, {})

            # Apply design system colors to relevant configs
            config = self._apply_design_to_config(
                planned.type, content, design, planned
            )

            blocks.append(
                PageBlock(
                    id=block_id,
                    type=planned.type,
                    order=order,
                    width=planned.width,
                    config=config,
                )
            )

        return blocks

    def _apply_design_to_config(
        self,
        block_type: str,
        content: dict[str, Any],
        design: DesignSystem,
        planned: PlannedBlock,
    ) -> dict[str, Any]:
        """Apply design system to block config."""
        config = dict(content)

        if block_type == "hero":
            # Add gradient colors from design
            style_gradients = {
                "professional": ["#1e1b4b", "#312e81"],
                "bold": ["#0f0f0f", "#1f1f1f"],
                "minimal": ["#fafafa", "#f5f5f5"],
                "playful": ["#831843", "#701a75"],
            }
            gradients = style_gradients.get(design.style, style_gradients["professional"])
            config.setdefault("backgroundType", "gradient")
            config.setdefault("gradientFrom", gradients[0])
            config.setdefault("gradientTo", gradients[1])
            config.setdefault("textAlign", "center")
            config.setdefault("showButton", True)
            config.setdefault("buttonLink", "#contact")

        elif block_type == "cta":
            config.setdefault("backgroundColor", design.colors.primary)
            config.setdefault("textColor", "light" if design.style != "minimal" else "dark")
            config.setdefault("buttonLink", "#contact")

        elif block_type == "chat":
            config.setdefault("primaryColor", design.colors.primary)
            config.setdefault("position", "inline")
            config.setdefault("title", "Questions?")
            config.setdefault("subtitle", "Chat with us for instant answers")
            config.setdefault("placeholder", "Type your question...")

        elif block_type == "form":
            config.setdefault("formId", "")  # Will be filled in after form creation
            config.setdefault("title", "Get in Touch")
            config.setdefault("description", "Fill out the form and we'll be in touch shortly.")

        elif block_type == "features":
            config.setdefault("columns", min(len(config.get("items", [])), 3) or 3)

        elif block_type == "stats":
            # Use real stats from assessment if available
            if planned.config_hints.get("items"):
                config["items"] = [
                    {
                        "value": item["value"],
                        "label": item["label"],
                        "source": item.get("source", ""),
                        "is_real": True,
                    }
                    for item in planned.config_hints["items"][:4]
                ]

        elif block_type == "gallery":
            # Gallery blocks need images - start with empty array for user to fill
            config.setdefault("title", config.get("title", "Gallery"))
            config.setdefault("images", [])
            config.setdefault("columns", 3)
            config.setdefault("showCaptions", True)
            config.setdefault("enableLightbox", True)

        elif block_type == "slider":
            # Slider blocks need slides - start with empty array for user to fill
            config.setdefault("slides", [])
            config.setdefault("autoplay", True)
            config.setdefault("autoplayInterval", 5000)
            config.setdefault("showDots", True)
            config.setdefault("showArrows", True)

        elif block_type == "logo-cloud":
            # Logo cloud blocks need logos - start with empty array for user to fill
            config.setdefault("title", config.get("title", "Trusted By"))
            config.setdefault("subtitle", "")
            config.setdefault("logos", [])
            config.setdefault("grayscale", True)

        return config

    def _create_form_config(
        self,
        intent: PageIntent,
        design: DesignSystem,
        synthesized: SynthesizedContent,
    ) -> FormConfig:
        """Create form configuration based on intent."""
        # Get CTA text from synthesized content
        cta_text = "Get Started"
        for block in synthesized.blocks:
            if block.block_type == "hero" and "buttonText" in block.content:
                cta_text = block.content["buttonText"]
                break

        # Standard lead capture fields
        fields = [
            {
                "name": "email",
                "label": "Email",
                "type": "email",
                "required": True,
                "placeholder": "your@email.com",
                "map_to_contact_field": "email",
            },
            {
                "name": "first_name",
                "label": "Name",
                "type": "text",
                "required": True,
                "placeholder": "Your name",
                "map_to_contact_field": "first_name",
            },
            {
                "name": "phone",
                "label": "Phone",
                "type": "phone",
                "required": False,
                "placeholder": "(555) 123-4567",
                "map_to_contact_field": "phone",
            },
            {
                "name": "message",
                "label": "Message",
                "type": "textarea",
                "required": False,
                "placeholder": "How can we help?",
            },
        ]

        return FormConfig(
            name=f"Contact - {synthesized.business_name}",
            fields=fields,
            submit_button_text=cta_text,
            success_message="Thanks! We'll be in touch shortly.",
            add_tags=["lead", "website", intent.goal.value],
        )

    def _create_workflow_config(
        self,
        intent: PageIntent,
        synthesized: SynthesizedContent,
    ) -> WorkflowConfig:
        """Create workflow configuration."""
        return WorkflowConfig(
            name=f"Lead Automation - {synthesized.business_name}",
            send_welcome_email=True,
            notify_owner=True,
            add_tags=["lead", intent.goal.value],
        )
