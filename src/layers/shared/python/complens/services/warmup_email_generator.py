"""AI-powered warmup email generator.

Generates varied, natural-sounding business emails for domain warm-up,
using Claude Haiku for cost-efficient content generation (~$0.001/email).
"""

import random

import structlog

from complens.services.ai_service import FAST_MODEL, get_business_context, invoke_claude_json

logger = structlog.get_logger()

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
    ) -> dict:
        """Generate a warmup email using AI.

        Args:
            workspace_id: Workspace ID for business context.
            domain: Sending domain.
            recipient_email: Recipient email address.
            exclude_subjects: Previously used subjects to avoid repetition.

        Returns:
            Dict with subject, body_text, body_html, content_type.
        """
        content_type = random.choice(CONTENT_TYPES)
        tone = random.choice(TONES)
        length = random.choice(LENGTHS)

        business_context = ""
        try:
            business_context = get_business_context(workspace_id)
        except Exception:
            logger.debug("Could not load business context, using generic", workspace_id=workspace_id)

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
{exclude_text}

The email must:
1. Have a compelling, natural subject line (NOT spammy)
2. Include realistic body content that encourages engagement (replies, clicks)
3. Feel like a genuine business communication, not a marketing blast
4. Include a plain text version and an HTML version
5. End with a casual question or call-to-action that invites a reply

Return JSON with exactly these fields:
- subject: string (email subject line)
- body_text: string (plain text version)
- body_html: string (HTML version with basic formatting)
- content_type: string ("{content_type}")"""

        try:
            result = invoke_claude_json(
                prompt=prompt,
                system="You are an email copywriter generating warm-up emails for domain reputation building. Create natural, engaging emails that look like genuine business communications. Return valid JSON only.",
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
