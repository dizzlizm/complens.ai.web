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
import random
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
        - Block widths for varied layouts (not just full-width)

        Layout widths use 1-4 scale:
        - width=4 → full width (12 columns)
        - width=3 → 2/3 width (8 columns)
        - width=2 → half width (6 columns)
        - width=1 → 1/3 width (4 columns)

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

        # Start with hero (always full width)
        planned_blocks.append(
            PlannedBlock(
                type="hero",
                width=4,
                emphasis="high",
                content_source="generated",
            )
        )

        # Features block - can be full or 2/3 width with supporting content
        if "features" in mapping["required"] or "features" in mapping["conditional"]:
            # For services/portfolio, pair features with stats or image
            features_width = 4  # Default full width
            if goal in ["services", "portfolio"] and assessment.stats_score >= 5:
                features_width = 3  # 2/3 width to pair with stats

            planned_blocks.append(
                PlannedBlock(
                    type="features",
                    width=features_width,
                    emphasis="high" if goal == "portfolio" else "medium",
                    content_source="profile" if assessment.features_score >= 5 else "generated",
                )
            )

            # Add a stats block next to features if we have stats and features is 2/3
            if features_width == 3 and assessment.stats_score >= 5:
                planned_blocks.append(
                    PlannedBlock(
                        type="stats",
                        width=1,  # 1/3 width to pair with features
                        emphasis="high" if assessment.stats_real else "low",
                        content_source="profile" if assessment.stats_real else "generated",
                        config_hints={"items": assessment.stats_items},
                    )
                )
        else:
            # Stats block as standalone - only if we have real stats
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

        # Stats block standalone if not already added
        stats_already_added = any(pb.type == "stats" for pb in planned_blocks)
        if not stats_already_added and assessment.stats_score >= 5 and "stats" not in mapping["excluded"]:
            planned_blocks.append(
                PlannedBlock(
                    type="stats",
                    width=4,
                    emphasis="high" if assessment.stats_real else "low",
                    content_source="profile" if assessment.stats_real else "generated",
                    config_hints={"items": assessment.stats_items},
                )
            )

        # Testimonials + Form side-by-side for lead-gen (half width each)
        has_testimonials = assessment.testimonials_score >= 5 and "testimonials" not in mapping["excluded"]
        wants_form = include_form and "form" not in mapping["excluded"]

        if has_testimonials and wants_form and goal == "lead-gen":
            # Side-by-side: testimonials (half) + form (half)
            planned_blocks.append(
                PlannedBlock(
                    type="testimonials",
                    width=2,  # Half width
                    emphasis="medium",
                    content_source="profile",
                )
            )
            planned_blocks.append(
                PlannedBlock(
                    type="form",
                    width=2,  # Half width
                    emphasis="high",
                    content_source="generated",
                )
            )
        else:
            # Add testimonials full width if available
            if has_testimonials:
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

            # Add form separately (consider 2/3 width with CTA)
            if wants_form:
                # For non-lead-gen, form can be 2/3 with CTA 1/3
                form_width = 3 if goal in ["services", "event"] else 4
                planned_blocks.append(
                    PlannedBlock(
                        type="form",
                        width=form_width,
                        emphasis="high",
                        content_source="generated",
                    )
                )

                # Add inline CTA next to form if form is 2/3
                if form_width == 3 and "cta" not in mapping["excluded"]:
                    planned_blocks.append(
                        PlannedBlock(
                            type="cta",
                            width=1,  # 1/3 width next to form
                            emphasis="medium",
                            content_source="generated",
                        )
                    )

        # FAQ block - can be half width paired with another block
        if assessment.faq_score >= 3 and "faq" not in mapping["excluded"]:
            # FAQ is often better at half width for readability
            faq_width = 2 if goal in ["services", "product-launch"] else 4
            planned_blocks.append(
                PlannedBlock(
                    type="faq",
                    width=faq_width,
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

        # Chat block - typically 1/3 width at bottom
        if include_chat and "chat" not in mapping.get("excluded", []):
            planned_blocks.append(
                PlannedBlock(
                    type="chat",
                    width=1,  # 1/3 width for chat widget
                    emphasis="low",
                    content_source="generated",
                )
            )

        # Final CTA block if not already added inline
        cta_already_added = any(pb.type == "cta" for pb in planned_blocks)
        if not cta_already_added and "cta" not in mapping["excluded"]:
            planned_blocks.append(
                PlannedBlock(
                    type="cta",
                    width=4,  # Full width final CTA
                    emphasis="medium",
                    content_source="generated",
                )
            )

        # Add excluded items from mapping
        for block_type in mapping["excluded"]:
            if block_type not in excluded:
                excluded[block_type] = f"Not relevant for {goal} pages"

        # Determine layout strategy based on block widths
        has_side_by_side = any(pb.width < 4 for pb in planned_blocks)
        has_mixed = len(set(pb.width for pb in planned_blocks)) > 1

        if has_mixed:
            layout_strategy = "mixed"
        elif has_side_by_side:
            layout_strategy = "side-by-side-cta"
        else:
            layout_strategy = "full-width"

        # Build rationale
        rationale_parts = [
            f"Optimized for {goal} goal.",
        ]
        if has_mixed:
            rationale_parts.append("Using mixed-width layout for visual interest.")
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
        order based on typical landing page structure. Uses intelligent layout
        widths based on block combinations.

        Layout widths use 1-4 scale:
        - width=4 → full width (12 columns)
        - width=3 → 2/3 width (8 columns)
        - width=2 → half width (6 columns)
        - width=1 → 1/3 width (4 columns)

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

        # Determine intelligent layout widths based on block combinations
        block_widths = self._calculate_block_widths(sorted_types, intent)

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
            if block_type in ["hero", "cta", "form"]:
                emphasis = "high"
            elif block_type in ["divider", "chat"]:
                emphasis = "low"

            # Get width from calculated widths
            width = block_widths.get(block_type, 4)

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
        has_mixed = len(set(pb.width for pb in planned_blocks)) > 1
        layout_strategy = "mixed" if has_mixed else ("side-by-side-cta" if has_side_by_side else "full-width")

        rationale = (
            f"User-specified blocks: {', '.join(sorted_types)}. "
            f"Using {layout_strategy} layout for optimal visual flow."
        )

        return BlockPlan(
            blocks=planned_blocks,
            sequence_rationale=rationale,
            layout_strategy=layout_strategy,
            excluded=excluded,
        )

    def _calculate_block_widths(
        self,
        block_types: list[str],
        intent: PageIntent,
    ) -> dict[str, int]:
        """Calculate intelligent widths for a set of blocks WITH VARIANCE.

        Determines which blocks should be full width vs. paired based on:
        - Block type characteristics (hero always full, chat typically small)
        - Logical pairings (testimonials + form, features + stats)
        - Page intent (lead-gen favors prominent forms)
        - RANDOMIZED VARIANCE for visual interest

        Args:
            block_types: List of block types to layout.
            intent: Page intent for context.

        Returns:
            Dict of block_type -> width (1-4 scale).
        """
        widths: dict[str, int] = {}
        types_set = set(block_types)
        goal = intent.goal.value

        # Choose a layout pattern for variety
        layout_pattern = self._choose_layout_pattern(block_types, intent)

        for block_type in block_types:
            # Default to full width
            width = 4

            # Blocks that should always be full width
            if block_type in ["hero", "pricing"]:
                width = 4

            # Chat is typically small
            elif block_type == "chat":
                width = 1  # 1/3 width

            # Divider is small
            elif block_type == "divider":
                width = 4  # Full width divider

            # Apply layout pattern for variance
            elif block_type in layout_pattern:
                width = layout_pattern[block_type]

            # Fallback: logical pairings
            elif block_type == "testimonials" and "form" in types_set and goal == "lead-gen":
                width = 2  # Half width

            elif block_type == "form" and "testimonials" in types_set and goal == "lead-gen":
                width = 2  # Half width

            elif block_type == "features" and "stats" in types_set:
                width = 3  # 2/3 width

            elif block_type == "stats" and "features" in types_set:
                width = 1  # 1/3 width

            elif block_type == "faq" and "cta" in types_set:
                width = 2  # Half width

            elif block_type == "cta" and "faq" in types_set:
                width = 2  # Half width

            elif block_type == "image" and "text" in types_set:
                width = 2  # Half width

            elif block_type == "text" and "image" in types_set:
                width = 2  # Half width

            elif block_type in ["gallery", "slider", "logo-cloud"]:
                width = 4

            elif block_type == "video" and "text" in types_set:
                width = 3

            widths[block_type] = width

        # Ensure minimum variance: at least 2 different widths if 4+ blocks
        widths = self._ensure_layout_variance(widths, block_types)

        return widths

    def _choose_layout_pattern(
        self,
        block_types: list[str],
        intent: PageIntent,
    ) -> dict[str, int]:
        """Choose a randomized layout pattern for visual variety.

        Returns a partial dict of block_type -> width overrides.
        """
        types_set = set(block_types)

        # Define layout pattern options
        patterns: list[dict[str, int]] = []

        # Pattern 1: Features 2/3 + Form 1/3 (conversion focused)
        if "features" in types_set and "form" in types_set:
            patterns.append({"features": 3, "form": 1})

        # Pattern 2: Form 2/3 + Chat 1/3 (engagement focused)
        if "form" in types_set and "chat" in types_set:
            patterns.append({"form": 3, "chat": 1})

        # Pattern 3: CTA 2/3 + Stats 1/3
        if "cta" in types_set and "stats" in types_set:
            patterns.append({"cta": 3, "stats": 1})

        # Pattern 4: Testimonials half + CTA half
        if "testimonials" in types_set and "cta" in types_set:
            patterns.append({"testimonials": 2, "cta": 2})

        # Pattern 5: FAQ half + Form half
        if "faq" in types_set and "form" in types_set:
            patterns.append({"faq": 2, "form": 2})

        # Pattern 6: Stats full + Features 2/3 + CTA 1/3
        if "features" in types_set and "cta" in types_set:
            patterns.append({"features": 3, "cta": 1})

        # Pattern 7: Image 2/3 + Form 1/3 (visual lead capture)
        if "image" in types_set and "form" in types_set:
            patterns.append({"image": 3, "form": 1})

        # Pattern 8: Video 2/3 + CTA 1/3
        if "video" in types_set and "cta" in types_set:
            patterns.append({"video": 3, "cta": 1})

        # If we have patterns, randomly choose one
        if patterns:
            return random.choice(patterns)

        return {}

    def _ensure_layout_variance(
        self,
        widths: dict[str, int],
        block_types: list[str],
    ) -> dict[str, int]:
        """Ensure minimum layout variance for visual interest.

        If all blocks are full width (4) and there are 4+ blocks,
        randomly vary some block widths.
        """
        # Skip if few blocks
        if len(block_types) < 4:
            return widths

        # Check current variance
        unique_widths = set(widths.values())
        if len(unique_widths) > 1:
            return widths  # Already has variance

        # Blocks that CAN be varied (not hero, pricing, gallery, etc.)
        variable_blocks = [
            bt for bt in block_types
            if bt not in ["hero", "pricing", "gallery", "slider", "divider"]
            and widths.get(bt, 4) == 4  # Currently full width
        ]

        if len(variable_blocks) < 2:
            return widths  # Not enough blocks to vary

        # Randomly select 2 blocks to make half-width (side by side)
        to_vary = random.sample(variable_blocks, min(2, len(variable_blocks)))
        for bt in to_vary:
            widths[bt] = 2  # Half width

        logger.debug(
            "Applied layout variance",
            varied_blocks=to_vary,
        )

        return widths

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
        """Stage 5: Generate block content using chunked AI calls.

        Uses an agentic approach - first establishes brand context, then
        generates each block type in focused batches to prevent content
        truncation and ensure complete data.
        """
        # Build profile context
        profile_context = profile.get_ai_context() if profile.business_name else ""

        # Step 1: Generate brand foundation (small, focused call)
        brand = self._synthesize_brand_foundation(
            profile, description, intent, design
        )

        # Step 2: Generate blocks in focused batches
        block_types = [pb.type for pb in plan.blocks]
        all_blocks: list[SynthesizedBlockContent] = []

        # Group blocks into logical batches (max 2-3 per call)
        batches = self._create_block_batches(block_types)

        for batch in batches:
            batch_blocks = self._synthesize_block_batch(
                batch, brand, profile_context, description, intent, design
            )
            all_blocks.extend(batch_blocks)

        # Step 3: Generate SEO (separate focused call)
        seo = self._synthesize_seo(brand, intent, design)

        return SynthesizedContent(
            blocks=all_blocks,
            business_name=brand.get("business_name", profile.business_name or "Business"),
            tagline=brand.get("tagline", profile.tagline or ""),
            tone=brand.get("tone", "professional"),
            narrative_theme=brand.get("narrative_theme", ""),
            seo=seo,
        )

    def _synthesize_brand_foundation(
        self,
        profile: BusinessProfile,
        description: str,
        intent: PageIntent,
        design: DesignSystem,
    ) -> dict[str, Any]:
        """Generate brand foundation - business name, tagline, tone, theme.

        This is a small, focused AI call that establishes the creative direction
        for all subsequent block generation.
        """
        profile_context = profile.get_ai_context() if profile.business_name else ""

        prompt = f"""Extract/generate brand foundation for a landing page.

BUSINESS CONTEXT:
{profile_context or "No profile available."}

USER DESCRIPTION:
{description}

PAGE GOAL: {intent.goal.value}
STYLE: {design.style}

Return JSON:
{{
  "business_name": "The business name (extract from context or infer)",
  "tagline": "Memorable 5-10 word tagline",
  "tone": "professional|friendly|bold|playful",
  "narrative_theme": "The unifying story/message (1 sentence)",
  "key_benefit": "The #1 benefit for visitors",
  "target_action": "What visitors should do (e.g., 'schedule a call')"
}}"""

        system = "Extract brand information. Return only valid JSON."

        try:
            result = invoke_claude_json(prompt, system, workspace_id=None)
            logger.info("Brand foundation generated", business_name=result.get("business_name"))
            return result
        except Exception as e:
            logger.warning("Brand foundation failed, using defaults", error=str(e))
            return {
                "business_name": profile.business_name or "Business",
                "tagline": profile.tagline or "",
                "tone": "professional",
                "narrative_theme": "",
                "key_benefit": "quality service",
                "target_action": "contact us",
            }

    def _create_block_batches(self, block_types: list[str]) -> list[list[str]]:
        """Group blocks into logical batches for focused generation.

        Keeps related blocks together while limiting batch size to prevent
        AI from truncating content.
        """
        batches: list[list[str]] = []

        # Define block groupings (related blocks generate better together)
        block_groups = {
            "hero": ["hero"],  # Hero alone - it's important
            "features": ["features", "stats"],  # Often paired
            "social_proof": ["testimonials", "logo-cloud"],
            "conversion": ["cta", "form"],  # Conversion blocks
            "info": ["faq", "pricing"],  # Information blocks
            "media": ["image", "video", "gallery", "slider"],
            "content": ["text", "divider"],
            "engagement": ["chat"],
        }

        # Track which blocks have been assigned
        assigned = set()

        # First pass: group related blocks
        for group_name, group_types in block_groups.items():
            batch = [bt for bt in block_types if bt in group_types and bt not in assigned]
            if batch:
                # Split large batches
                while len(batch) > 3:
                    batches.append(batch[:2])
                    assigned.update(batch[:2])
                    batch = batch[2:]
                if batch:
                    batches.append(batch)
                    assigned.update(batch)

        # Second pass: catch any remaining blocks
        remaining = [bt for bt in block_types if bt not in assigned]
        for i in range(0, len(remaining), 2):
            batches.append(remaining[i:i+2])

        return batches

    def _synthesize_block_batch(
        self,
        block_types: list[str],
        brand: dict[str, Any],
        profile_context: str,
        description: str,
        intent: PageIntent,
        design: DesignSystem,
    ) -> list[SynthesizedBlockContent]:
        """Generate content for a small batch of blocks.

        Focused AI call with explicit schemas for each block type.
        """
        # Build block-specific schemas
        schemas = self._get_block_schemas(block_types)

        prompt = f"""Generate landing page content for these blocks: {', '.join(block_types)}

BRAND CONTEXT:
- Business: {brand.get('business_name', 'Business')}
- Tagline: {brand.get('tagline', '')}
- Tone: {brand.get('tone', 'professional')}
- Theme: {brand.get('narrative_theme', '')}
- Key Benefit: {brand.get('key_benefit', '')}
- Target Action: {brand.get('target_action', 'contact us')}

BUSINESS DETAILS:
{profile_context or description}

RULES:
- Match the {brand.get('tone', 'professional')} tone consistently
- NO placeholder names - use realistic names or just titles
- NO fake statistics - only use real numbers if provided
- Headlines: SHORT (3-6 words), punchy
- Focus on BENEFITS, not features

Generate COMPLETE content for each block:

{schemas}

Return JSON:
{{
  "blocks": [
    // One object per block type with complete content
  ]
}}"""

        system = f"""Generate complete, high-quality content for {len(block_types)} landing page blocks.
Each block must have ALL required fields populated with real, usable content.
Return only valid JSON."""

        try:
            result = invoke_claude_json(prompt, system, workspace_id=None)

            blocks = []
            for block_data in result.get("blocks", []):
                block_type = block_data.get("block_type", "")
                content = block_data.get("content", {})

                # Validate content has required fields
                if block_type and content:
                    blocks.append(
                        SynthesizedBlockContent(
                            block_type=block_type,
                            content=content,
                        )
                    )
                    logger.debug(f"Generated {block_type} block", keys=list(content.keys()))

            # Log if we didn't get all blocks
            generated_types = {b.block_type for b in blocks}
            missing = set(block_types) - generated_types
            if missing:
                logger.warning("Some blocks not generated", missing=list(missing))

            return blocks

        except Exception as e:
            logger.error("Block batch synthesis failed", blocks=block_types, error=str(e))
            return []

    def _get_block_schemas(self, block_types: list[str]) -> str:
        """Get explicit JSON schemas for block types to guide AI generation."""
        schemas = []

        schema_templates = {
            "hero": '''HERO block:
{
  "block_type": "hero",
  "content": {
    "headline": "3-6 word punchy headline",
    "subheadline": "15-25 word value proposition",
    "buttonText": "CTA button text",
    "buttonLink": "#contact"
  }
}''',
            "features": '''FEATURES block:
{
  "block_type": "features",
  "content": {
    "title": "Section title",
    "subtitle": "Section subtitle",
    "items": [
      {"icon": "🎯", "title": "Benefit 1", "description": "2-3 sentence description"},
      {"icon": "⚡", "title": "Benefit 2", "description": "2-3 sentence description"},
      {"icon": "🛡️", "title": "Benefit 3", "description": "2-3 sentence description"}
    ]
  }
}''',
            "testimonials": '''TESTIMONIALS block:
{
  "block_type": "testimonials",
  "content": {
    "title": "What Our Clients Say",
    "items": [
      {"quote": "Detailed testimonial quote (2-3 sentences)", "author": "Full Name", "role": "Job Title", "company": "Company Name"},
      {"quote": "Another testimonial", "author": "Full Name", "role": "Job Title", "company": "Company Name"}
    ]
  }
}''',
            "cta": '''CTA block:
{
  "block_type": "cta",
  "content": {
    "headline": "Compelling call to action headline",
    "description": "1-2 sentence supporting text",
    "buttonText": "Action button text",
    "buttonLink": "#contact"
  }
}''',
            "faq": '''FAQ block:
{
  "block_type": "faq",
  "content": {
    "title": "Frequently Asked Questions",
    "items": [
      {"question": "Common question?", "answer": "Detailed helpful answer (2-3 sentences)"},
      {"question": "Another question?", "answer": "Another helpful answer"},
      {"question": "Third question?", "answer": "Third answer"}
    ]
  }
}''',
            "stats": '''STATS block:
{
  "block_type": "stats",
  "content": {
    "title": "Our Impact",
    "items": [
      {"value": "500+", "label": "Happy Clients"},
      {"value": "10+", "label": "Years Experience"},
      {"value": "98%", "label": "Satisfaction Rate"}
    ]
  }
}''',
            "pricing": '''PRICING block:
{
  "block_type": "pricing",
  "content": {
    "title": "Pricing Plans",
    "subtitle": "Choose the right plan for you",
    "items": [
      {"name": "Starter", "price": "$49/mo", "description": "For individuals", "features": ["Feature 1", "Feature 2"], "highlighted": false},
      {"name": "Professional", "price": "$99/mo", "description": "For teams", "features": ["All Starter features", "Feature 3"], "highlighted": true}
    ]
  }
}''',
            "form": '''FORM block:
{
  "block_type": "form",
  "content": {
    "title": "Get in Touch",
    "description": "Fill out the form and we'll respond within 24 hours."
  }
}''',
            "chat": '''CHAT block:
{
  "block_type": "chat",
  "content": {
    "title": "Questions?",
    "subtitle": "Chat with us for instant answers",
    "placeholder": "Type your question..."
  }
}''',
            "text": '''TEXT block:
{
  "block_type": "text",
  "content": {
    "content": "Rich text content with paragraphs...",
    "alignment": "left"
  }
}''',
            "image": '''IMAGE block:
{
  "block_type": "image",
  "content": {
    "alt": "Descriptive alt text",
    "caption": "Optional image caption"
  }
}''',
            "video": '''VIDEO block:
{
  "block_type": "video",
  "content": {
    "title": "Watch Our Story",
    "url": ""
  }
}''',
            "divider": '''DIVIDER block:
{
  "block_type": "divider",
  "content": {
    "style": "line"
  }
}''',
            "gallery": '''GALLERY block:
{
  "block_type": "gallery",
  "content": {
    "title": "Our Work",
    "images": []
  }
}''',
            "slider": '''SLIDER block:
{
  "block_type": "slider",
  "content": {
    "slides": []
  }
}''',
            "logo-cloud": '''LOGO-CLOUD block:
{
  "block_type": "logo-cloud",
  "content": {
    "title": "Trusted By",
    "logos": []
  }
}''',
        }

        for bt in block_types:
            if bt in schema_templates:
                schemas.append(schema_templates[bt])

        return "\n\n".join(schemas)

    def _synthesize_seo(
        self,
        brand: dict[str, Any],
        intent: PageIntent,
        design: DesignSystem,
    ) -> SynthesizedSeo:
        """Generate SEO metadata in a focused call."""
        business_name = brand.get("business_name", "Business")
        tagline = brand.get("tagline", "")
        key_benefit = brand.get("key_benefit", "")

        prompt = f"""Generate SEO metadata for a {intent.goal.value} landing page.

Business: {business_name}
Tagline: {tagline}
Key Benefit: {key_benefit}
Target Action: {brand.get('target_action', 'contact us')}

Return JSON:
{{
  "meta_title": "40-60 chars, format: [Business] - [Benefit] or [Benefit] | [Business]",
  "meta_description": "120-155 chars, action-oriented, include value prop and CTA"
}}"""

        system = "Generate SEO metadata. Return only valid JSON."

        try:
            result = invoke_claude_json(prompt, system, workspace_id=None)
            return SynthesizedSeo(
                meta_title=result.get("meta_title", f"{business_name} - {key_benefit}")[:70],
                meta_description=result.get("meta_description", tagline)[:160],
            )
        except Exception as e:
            logger.warning("SEO synthesis failed", error=str(e))
            return SynthesizedSeo(
                meta_title=f"{business_name} - {key_benefit}"[:70],
                meta_description=tagline[:160] if tagline else f"Learn more about {business_name}",
            )

    def _configure_blocks(
        self,
        plan: BlockPlan,
        synthesized: SynthesizedContent,
        design: DesignSystem,
    ) -> list[PageBlock]:
        """Stage 6: Build validated PageBlock list.

        Combines synthesized content with design system and plan.
        Uses the 12-column grid layout for proper responsive design.
        """
        blocks: list[PageBlock] = []

        # Create a lookup for synthesized content
        content_lookup = {
            bc.block_type: bc.content for bc in synthesized.blocks
        }

        # Convert planned widths (1-4 scale) to 12-column grid
        # and arrange blocks into rows
        current_row = 0
        current_col = 0  # Current column position within row
        row_blocks: list[tuple[int, PlannedBlock]] = []  # (order, planned) pairs in current row

        for order, planned in enumerate(plan.blocks):
            # Convert width (1-4) to colSpan (12-column grid)
            # width=4 -> full width (12), width=2 -> half (6), width=1 -> third (4)
            width_to_colspan = {1: 4, 2: 6, 3: 8, 4: 12}
            col_span = width_to_colspan.get(planned.width, 12)

            # Check if this block fits in the current row
            if current_col + col_span > 12:
                # Start a new row
                current_row += 1
                current_col = 0

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
                    width=planned.width,  # Keep legacy width for backwards compatibility
                    config=config,
                    # 12-column grid layout
                    row=current_row,
                    colSpan=col_span,
                    colStart=current_col,
                )
            )

            # Move to next column position
            current_col += col_span

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
        """Create workflow configuration with clear form-to-notification connection.

        IMPORTANT: This workflow is the KEY automation that connects form submissions
        to user notifications. It ensures:
        1. The page owner gets notified of new leads (notify_owner=True)
        2. Leads receive a welcome email (send_welcome_email=True)
        3. Contacts are tagged for segmentation

        The workflow is REQUIRED for lead capture to work properly.
        """
        business_name = synthesized.business_name or "Your Business"

        # Generate a contextual welcome message based on intent
        welcome_messages = {
            "lead-gen": f"Thanks for reaching out to {business_name}! We've received your message and will get back to you shortly.",
            "services": f"Thank you for your interest in {business_name}'s services! Our team will contact you within 24 hours.",
            "event": f"You're registered! We'll send you event details and reminders for {business_name}'s upcoming event.",
            "product-launch": f"Thanks for your interest in {business_name}! We'll notify you when we launch.",
            "portfolio": f"Thanks for reaching out to {business_name}! We look forward to discussing your project.",
            "coming-soon": f"You're on the list! We'll notify you when {business_name} launches.",
            "comparison": f"Thanks for your interest! We'll help you find the right solution from {business_name}.",
        }

        welcome_message = welcome_messages.get(
            intent.goal.value,
            f"Thanks for contacting {business_name}! We'll be in touch soon."
        )

        return WorkflowConfig(
            name=f"Lead Automation - {business_name}",
            send_welcome_email=True,
            notify_owner=True,  # CRITICAL: Ensures owner gets notified of new leads
            owner_email=None,  # Will use workspace notification email
            welcome_message=welcome_message,
            add_tags=["lead", "website", intent.goal.value],
        )
