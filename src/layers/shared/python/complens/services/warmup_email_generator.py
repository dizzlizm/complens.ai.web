"""AI-powered warmup email generator.

Generates varied, natural-sounding business emails for domain warm-up,
using Claude Haiku for cost-efficient content generation (~$0.001/email).

When a workspace has uploaded knowledge base documents, the generator
pulls relevant content snippets to produce emails that reference real
business information (products, features, FAQs) instead of generic filler.
"""

import random

import structlog

from complens.services.ai_service import FAST_MODEL, get_business_context, invoke_claude_json

logger = structlog.get_logger()

# Maps content_type to KB retrieval queries that pull relevant context
KB_QUERIES_BY_CONTENT_TYPE: dict[str, str] = {
    "newsletter": "latest updates product features announcements",
    "product_update": "product features capabilities new releases",
    "team_announcement": "company team culture values mission",
    "industry_insight": "industry trends market analysis competitive landscape",
    "customer_tip": "tips best practices how to getting started",
    "company_milestone": "achievements milestones growth metrics",
    "event_invitation": "events webinars conferences workshops",
    "weekly_digest": "recent updates highlights key takeaways",
}

CONTENT_TYPES = [
    "newsletter",
    "product_update",
    "team_announcement",
    "industry_insight",
    "customer_tip",
    "company_milestone",
    "event_invitation",
    "weekly_digest",
]

TONES = ["professional", "friendly", "enthusiastic", "thoughtful", "casual"]

LENGTHS = [
    "short (2-3 paragraphs)",
    "medium (3-4 paragraphs)",
    "long (4-6 paragraphs)",
]

LENGTH_MAP: dict[str, str] = {
    "short": "short (2-3 paragraphs)",
    "medium": "medium (3-4 paragraphs)",
    "long": "long (4-6 paragraphs)",
}


class WarmupEmailGenerator:
    """Generates AI-powered warmup emails with varied content types and tones."""

    def generate_email(
        self,
        workspace_id: str,
        domain: str,
        recipient_email: str,
        exclude_subjects: list[str] | None = None,
        site_id: str | None = None,
        preferred_tones: list[str] | None = None,
        preferred_content_types: list[str] | None = None,
        email_length: str | None = None,
    ) -> dict:
        """Generate a warmup email using AI.

        Enriches the prompt with real business data when available:
        - KB documents (product info, FAQs, features)
        - Published landing page titles/URLs
        - Deal pipeline summary (total value, recent wins)

        Args:
            workspace_id: Workspace ID for business context.
            domain: Sending domain.
            recipient_email: Recipient email address.
            exclude_subjects: Previously used subjects to avoid repetition.
            site_id: Optional site ID (from WarmupDomain). Resolved from
                DomainSetup if not provided.
            preferred_tones: User-selected tone preferences. Falls back to random.
            preferred_content_types: User-selected content type preferences. Falls back to random.
            email_length: Email length preference (short/medium/long). Falls back to random.

        Returns:
            Dict with subject, body_text, body_html, content_type.
        """
        content_type = random.choice(preferred_content_types) if preferred_content_types else random.choice(CONTENT_TYPES)
        tone = random.choice(preferred_tones) if preferred_tones else random.choice(TONES)
        length = LENGTH_MAP.get(email_length or "", "") or random.choice(LENGTHS)

        # Use provided site_id, or resolve from domain
        if not site_id:
            site_id = self._resolve_site_id(workspace_id, domain)

        business_context = ""
        try:
            business_context = get_business_context(workspace_id, site_id=site_id)
        except Exception:
            logger.debug("Could not load business context, using generic", workspace_id=workspace_id)

        # Gather enrichment context from KB, pages, and deals
        kb_context = self._get_kb_context(workspace_id, content_type, site_id=site_id)
        page_context = self._get_page_context(workspace_id, site_id=site_id)
        deal_context = self._get_deal_context(workspace_id)

        logger.info(
            "Warmup email context gathered",
            domain=domain,
            has_business_profile=bool(business_context),
            business_context_len=len(business_context),
            has_kb_context=bool(kb_context),
            kb_context_len=len(kb_context),
            has_page_context=bool(page_context),
            has_deal_context=bool(deal_context),
        )

        # KB is the PRIMARY content source — the email's topic comes from here
        kb_section = ""
        if kb_context:
            kb_section = f"""
=== THIS EMAIL'S TOPIC (real content from the knowledge base — build the entire email around this) ===
{kb_context}
=== END TOPIC ==="""

        # Business profile is SECONDARY — only used for voice/tone/audience, not content
        business_section = ""
        if business_context:
            business_section = f"""
=== BUSINESS VOICE (use for tone and audience only, NOT for email content) ===
{business_context}
=== END VOICE ==="""

        # Build supplementary context
        extra_parts: list[str] = []
        if page_context:
            extra_parts.append(f"Published landing pages (link to these):\n{page_context}")
        if deal_context:
            extra_parts.append(f"Business metrics:\n{deal_context}")
        extra_section = "\n\n".join(extra_parts)

        exclude_text = ""
        if exclude_subjects:
            subjects_str = "\n".join(f"- {s}" for s in exclude_subjects[:20])
            exclude_text = f"\n\nDo NOT reuse any of these previously sent subjects:\n{subjects_str}"

        # KB-first approach:
        # With KB: deep dive on the KB topic — this is the only way to get specific content
        # Without KB: super short and generic — just enough for domain warmup, no fabrication
        if kb_context:
            truthfulness_rule = (
                "8. The topic above is REAL content from the knowledge base. Make it the "
                "entire focus of this email. Go deep on this one thing — explain it, "
                "share why it matters, make the reader care about it."
            )
            approach_note = ""
        else:
            truthfulness_rule = (
                "8. You have NO knowledge base content. Write a very brief, friendly email — "
                "just a short hello, one observation, or a question. 2-3 sentences MAX. "
                "DO NOT invent any products, features, services, statistics, or claims."
            )
            approach_note = (
                "\nIMPORTANT: No knowledge base docs available. Keep this extremely short and generic. "
                "This is just for domain warmup — a friendly check-in, nothing more. "
                "Do not pretend to know what this business sells or does."
            )

        prompt = f"""Generate a short business email for domain warm-up.

MOST IMPORTANT RULE: ONE TOPIC PER EMAIL.
Pick a single thing to talk about — one feature, one insight, one question, one KPI, one story.
The entire email should be about that ONE thing. Do NOT list multiple features or bullet-point
several updates. A real person emails about one thing at a time.

Email parameters:
- Content type: {content_type}
- Tone: {tone}
- Length: {length}
- Sending domain: {domain}
- Recipient: {recipient_email}
{business_section}
{kb_section}
{f"{extra_section}" if extra_section else ""}
{approach_note}
{exclude_text}

REQUIREMENTS:
1. Subject line about that ONE topic. Specific and natural, never generic.
2. Opening: get to the point immediately. No "Hope this finds you well" filler.
3. Body: stay on the single topic. Go deeper, not wider. No bullet lists of features.
4.{f" Write for the target audience in the business context." if business_context else " Keep it conversational."}
5. End with a question related to that one topic.
6. HTML: clean, short paragraphs. No heavy styling.
7. Write like a human — contractions, personality. Not a marketing bot.
{truthfulness_rule}
9. NEVER fabricate facts. If it's not in the context above, don't say it.

Return JSON with exactly these fields:
- subject: string (email subject line)
- body_text: string (plain text version)
- body_html: string (HTML version with basic formatting)
- content_type: string ("{content_type}")"""

        try:
            system_prompt = (
                "You write emails for this company. Rules: "
                "1) ONE topic per email — pick a single thing and go deep, never list multiple items. "
                "2) ONLY state facts explicitly in the context — never invent anything. "
                "3) Shorter and honest beats longer and fabricated. "
                "Return valid JSON only."
            )

            result = invoke_claude_json(
                prompt=prompt,
                system=system_prompt,
                model=FAST_MODEL,
            )

            if not all(k in result for k in ("subject", "body_text", "body_html")):
                raise ValueError("Missing required fields in AI response")

            result["content_type"] = content_type

            logger.info(
                "Warmup email generated",
                domain=domain,
                content_type=content_type,
                subject=result["subject"][:50],
                has_kb_context=bool(kb_context),
            )

            return result

        except Exception:
            logger.exception(
                "Failed to generate warmup email, using fallback",
                domain=domain,
                content_type=content_type,
            )
            return self._fallback_email(domain, content_type)

    @staticmethod
    def _resolve_site_id(workspace_id: str, domain: str) -> str | None:
        """Resolve site_id from a sending domain.

        Looks up the DomainSetup record which links a domain to a site.

        Args:
            workspace_id: Workspace ID.
            domain: Sending domain name.

        Returns:
            Site ID if the domain belongs to a site, None otherwise.
        """
        try:
            from complens.repositories.domain import DomainRepository

            domain_repo = DomainRepository()
            domain_setup = domain_repo.get_by_domain(workspace_id, domain)
            if domain_setup and domain_setup.site_id:
                return domain_setup.site_id
        except Exception:
            logger.debug("Could not resolve site_id from domain", domain=domain)
        return None

    @staticmethod
    def _get_kb_context(workspace_id: str, content_type: str, site_id: str | None = None) -> str:
        """Retrieve a single KB snippet for the email to focus on.

        Queries KB for relevant content, then randomly picks ONE snippet so
        each email is about a single topic. Variety comes from randomness
        across invocations.

        Args:
            workspace_id: Workspace ID.
            content_type: Email content type (newsletter, product_update, etc.).
            site_id: Optional site ID for site-scoped retrieval.

        Returns:
            A single KB snippet string, or empty string if none available.
        """
        try:
            from complens.repositories.document import DocumentRepository
            from complens.services.knowledge_base_service import KnowledgeBaseService

            doc_repo = DocumentRepository()
            if site_id:
                indexed_docs, _ = doc_repo.list_by_site(workspace_id, site_id, limit=1)
            else:
                indexed_docs, _ = doc_repo.list_by_workspace(workspace_id, status="indexed", limit=1)
            if not indexed_docs:
                return ""

            kb_service = KnowledgeBaseService()
            query = KB_QUERIES_BY_CONTENT_TYPE.get(content_type, "product features updates")
            results = kb_service.retrieve(workspace_id, query, max_results=8, site_id=site_id)

            # Collect unique snippets
            seen_texts: set[str] = set()
            snippets: list[str] = []
            for r in (results or []):
                text = r.get("text", "").strip()
                if text and text[:100] not in seen_texts:
                    seen_texts.add(text[:100])
                    snippets.append(text[:1500])

            if not snippets:
                return ""

            # Pick ONE random snippet — each email focuses on a single topic
            chosen = random.choice(snippets)

            logger.info(
                "KB snippet selected for warmup",
                workspace_id=workspace_id,
                content_type=content_type,
                available_snippets=len(snippets),
                chosen_len=len(chosen),
                chosen_preview=chosen[:80],
            )

            return chosen

        except Exception:
            logger.debug("Could not load KB context for warmup", workspace_id=workspace_id)
            return ""

    @staticmethod
    def _get_page_context(workspace_id: str, site_id: str | None = None) -> str:
        """Get published landing page titles and URLs for email references.

        Args:
            workspace_id: Workspace ID.
            site_id: Optional site ID to filter pages.

        Returns:
            Formatted page list string, or empty string if none.
        """
        try:
            from complens.repositories.page import PageRepository

            page_repo = PageRepository()
            pages = page_repo.list_published(workspace_id, limit=10)

            if not pages:
                return ""

            # Filter to site pages when site_id is provided
            if site_id:
                pages = [p for p in pages if getattr(p, "site_id", None) == site_id]

            lines = []
            for page in pages:
                title = page.title or page.slug
                url = ""
                if page.subdomain:
                    url = f"https://{page.subdomain}.complens.ai"
                elif page.custom_domain:
                    url = f"https://{page.custom_domain}"
                lines.append(f"- {title}" + (f" ({url})" if url else ""))

            return "\n".join(lines)

        except Exception:
            logger.debug("Could not load page context for warmup", workspace_id=workspace_id)
            return ""

    @staticmethod
    def _get_deal_context(workspace_id: str) -> str:
        """Get pipeline summary for business milestone type emails.

        Args:
            workspace_id: Workspace ID.

        Returns:
            Formatted deal summary string, or empty string if none.
        """
        try:
            from complens.repositories.deal import DealRepository

            deal_repo = DealRepository()
            deals, _ = deal_repo.list_by_workspace(workspace_id, limit=200)

            if not deals:
                return ""

            total_value = sum(d.value or 0 for d in deals)
            active_deals = [d for d in deals if d.stage not in ("Won", "Lost")]
            won_deals = [d for d in deals if d.stage == "Won"]

            parts = [f"Total pipeline value: ${total_value:,.0f}"]
            parts.append(f"Active deals: {len(active_deals)}")
            if won_deals:
                won_value = sum(d.value or 0 for d in won_deals)
                parts.append(f"Won deals: {len(won_deals)} (${won_value:,.0f})")

            return "\n".join(parts)

        except Exception:
            logger.debug("Could not load deal context for warmup", workspace_id=workspace_id)
            return ""

    @staticmethod
    def _fallback_email(domain: str, content_type: str) -> dict:
        """Generate a simple fallback email when AI generation fails.

        Args:
            domain: Sending domain.
            content_type: Content type category.

        Returns:
            Dict with subject, body_text, body_html, content_type.
        """
        subject = f"Quick update from the {domain} team"
        body_text = (
            f"Hi there,\n\n"
            f"Just a quick note from the team at {domain}. "
            f"We've been working on some exciting updates and wanted to keep you in the loop.\n\n"
            f"Would love to hear your thoughts - feel free to reply to this email!\n\n"
            f"Best regards,\n"
            f"The {domain} Team"
        )
        body_html = (
            f"<p>Hi there,</p>"
            f"<p>Just a quick note from the team at {domain}. "
            f"We've been working on some exciting updates and wanted to keep you in the loop.</p>"
            f"<p>Would love to hear your thoughts - feel free to reply to this email!</p>"
            f"<p>Best regards,<br>The {domain} Team</p>"
        )
        return {
            "subject": subject,
            "body_text": body_text,
            "body_html": body_html,
            "content_type": content_type,
        }
