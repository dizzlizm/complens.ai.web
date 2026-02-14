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


class WarmupEmailGenerator:
    """Generates AI-powered warmup emails with varied content types and tones."""

    def generate_email(
        self,
        workspace_id: str,
        domain: str,
        recipient_email: str,
        exclude_subjects: list[str] | None = None,
        site_id: str | None = None,
    ) -> dict:
        """Generate a warmup email using AI.

        Enriches the prompt with real business data when available:
        - KB documents (product info, FAQs, features)
        - Published landing page titles/URLs
        - Partner pipeline summary (total value, active partners)

        Args:
            workspace_id: Workspace ID for business context.
            domain: Sending domain.
            recipient_email: Recipient email address.
            exclude_subjects: Previously used subjects to avoid repetition.
            site_id: Optional site ID (from WarmupDomain). Resolved from
                DomainSetup if not provided.

        Returns:
            Dict with subject, body_text, body_html, content_type.
        """
        content_type = random.choice(CONTENT_TYPES)
        tone = random.choice(TONES)
        length = random.choice(LENGTHS)

        # Use provided site_id, or resolve from domain
        if not site_id:
            site_id = self._resolve_site_id(workspace_id, domain)

        business_context = ""
        try:
            business_context = get_business_context(workspace_id, site_id=site_id)
        except Exception:
            logger.debug("Could not load business context, using generic", workspace_id=workspace_id)

        # Gather enrichment context from KB, pages, and partners
        kb_context = self._get_kb_context(workspace_id, content_type, site_id=site_id)
        page_context = self._get_page_context(workspace_id, site_id=site_id)
        deal_context = self._get_partner_context(workspace_id)

        enrichment_parts: list[str] = []
        if kb_context:
            enrichment_parts.append(f"Real business content to reference (from knowledge base):\n{kb_context}")
        if page_context:
            enrichment_parts.append(f"Published landing pages (use for links/references):\n{page_context}")
        if deal_context:
            enrichment_parts.append(f"Business metrics (use naturally for milestones/updates):\n{deal_context}")

        enrichment_text = "\n\n".join(enrichment_parts)

        exclude_text = ""
        if exclude_subjects:
            subjects_str = "\n".join(f"- {s}" for s in exclude_subjects[:20])
            exclude_text = f"\n\nDo NOT reuse any of these previously sent subjects:\n{subjects_str}"

        prompt = f"""Generate a realistic business email for domain warm-up purposes.
The email should look like a genuine {content_type} from a real company.

Requirements:
- Content type: {content_type}
- Tone: {tone}
- Length: {length}
- Sending domain: {domain}
- Recipient: {recipient_email}
{f"- Business context: {business_context}" if business_context else "- Use generic but realistic business content"}
{f"\n{enrichment_text}" if enrichment_text else ""}
{exclude_text}

The email must:
1. Have a compelling, natural subject line (NOT spammy)
2. Include realistic body content that encourages engagement (replies, clicks)
3. Feel like a genuine business communication, not a marketing blast
4. Include a plain text version and an HTML version
5. End with a casual question or call-to-action that invites a reply
{f"6. Naturally weave in real product/business details from the knowledge base content above" if kb_context else ""}

Return JSON with exactly these fields:
- subject: string (email subject line)
- body_text: string (plain text version)
- body_html: string (HTML version with basic formatting)
- content_type: string ("{content_type}")"""

        try:
            result = invoke_claude_json(
                prompt=prompt,
                system="You are an email copywriter generating warm-up emails for domain reputation building. Create natural, engaging emails that look like genuine business communications. When provided with real business content from a knowledge base, incorporate it naturally - reference actual features, products, and information rather than making things up. Return valid JSON only.",
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
        """Retrieve relevant KB snippets for the given content type.

        Args:
            workspace_id: Workspace ID.
            content_type: Email content type (newsletter, product_update, etc.).
            site_id: Optional site ID for site-scoped retrieval.

        Returns:
            Formatted KB snippets string, or empty string if none available.
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
            results = kb_service.retrieve(workspace_id, query, max_results=3, site_id=site_id)

            if not results:
                return ""

            snippets = []
            for r in results:
                text = r.get("text", "").strip()
                if text:
                    # Truncate long snippets to keep prompt size manageable
                    snippets.append(text[:500])

            return "\n---\n".join(snippets) if snippets else ""

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
    def _get_partner_context(workspace_id: str) -> str:
        """Get pipeline summary for business milestone type emails.

        Args:
            workspace_id: Workspace ID.

        Returns:
            Formatted partner summary string, or empty string if none.
        """
        try:
            from complens.repositories.partner import PartnerRepository

            partner_repo = PartnerRepository()
            partners, _ = partner_repo.list_by_workspace(workspace_id, limit=200)

            if not partners:
                return ""

            total_value = sum(p.value or 0 for p in partners)
            active_partners = [p for p in partners if p.stage not in ("Active", "Inactive")]
            activated_partners = [p for p in partners if p.stage == "Active"]

            parts = [f"Total pipeline value: ${total_value:,.0f}"]
            parts.append(f"Partners in pipeline: {len(active_partners)}")
            if activated_partners:
                active_value = sum(p.value or 0 for p in activated_partners)
                parts.append(f"Active partners: {len(activated_partners)} (${active_value:,.0f})")

            return "\n".join(parts)

        except Exception:
            logger.debug("Could not load partner context for warmup", workspace_id=workspace_id)
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
