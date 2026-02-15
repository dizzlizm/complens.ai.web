"""Warmup hourly sender Lambda.

Triggered hourly by EventBridge. For each active domain with auto_warmup_enabled,
generates and sends AI-powered warmup emails to the seed list.
"""

import math
from datetime import datetime, timezone
from typing import Any

import structlog

from complens.repositories.warmup_domain import WarmupDomainRepository
from complens.services.email_service import EmailService
from complens.services.warmup_email_generator import WarmupEmailGenerator
from complens.services.warmup_service import WarmupService

logger = structlog.get_logger()


def handler(event: dict[str, Any], context: Any) -> dict:
    """Process hourly warmup email sending for all active domains.

    Triggered by EventBridge rate(1 hour).
    """
    logger.info("Warmup hourly sender started")

    repo = WarmupDomainRepository()
    service = WarmupService(repo=repo)
    email_service = EmailService()
    generator = WarmupEmailGenerator()

    active_domains = repo.list_active()
    total_sent = 0
    domains_processed = 0

    for warmup in active_domains:
        if not warmup.auto_warmup_enabled:
            continue
        if not warmup.seed_list:
            logger.debug("Skipping domain with empty seed list", domain=warmup.domain)
            continue

        # Only send from SES-verified domains
        auth = email_service.check_domain_auth(warmup.domain)
        if not auth.get("verified"):
            logger.warning(
                "Skipping unverified domain",
                domain=warmup.domain,
            )
            continue

        now = datetime.now(timezone.utc)
        current_hour = now.hour

        if not service._is_within_send_window(
            current_hour, warmup.send_window_start, warmup.send_window_end,
        ):
            logger.debug(
                "Skipping domain outside send window",
                domain=warmup.domain,
                hour=current_hour,
            )
            continue

        daily_limit = warmup.daily_limit
        if daily_limit == -1:
            # Warmup complete, no need for auto warmup emails
            continue

        # Calculate how many emails to send this hour
        today = now.strftime("%Y-%m-%d")
        counter = repo.get_daily_counter(warmup.domain, today)
        sent_today = counter["send_count"] if counter else 0
        remaining_today = max(0, daily_limit - sent_today)

        if remaining_today == 0:
            continue

        remaining_hours = _remaining_window_hours(
            current_hour, warmup.send_window_start, warmup.send_window_end,
        )
        emails_this_hour = math.ceil(remaining_today / max(remaining_hours, 1))

        # Cap at seed list size — each recipient gets at most 1 warmup email per hour
        emails_this_hour = min(emails_this_hour, len(warmup.seed_list))

        # Generate one email per domain per day — reuse for all recipients
        recent_emails = repo.get_recent_warmup_emails(warmup.domain, today, limit=20)
        exclude_subjects = [e["subject"] for e in recent_emails if e.get("subject")]

        first_recipient = warmup.seed_list[0]
        try:
            email_content = generator.generate_email(
                workspace_id=warmup.workspace_id,
                domain=warmup.domain,
                recipient_email=first_recipient,
                exclude_subjects=exclude_subjects,
                site_id=warmup.site_id,
                preferred_tones=warmup.preferred_tones or None,
                preferred_content_types=warmup.preferred_content_types or None,
                email_length=warmup.email_length,
            )
        except Exception:
            logger.exception(
                "Failed to generate warmup email",
                domain=warmup.domain,
            )
            continue

        # Pick from-email: use a verified email matching this domain, else noreply
        from_addr = _get_verified_sender(warmup.workspace_id, warmup.domain)
        from_name = warmup.from_name or warmup.domain
        from_email = f"{from_name} <{from_addr}>"
        reply_to_list = [from_addr] if from_addr and not from_addr.startswith("noreply@") else None

        sent_for_domain = 0
        for i in range(emails_this_hour):
            recipient = warmup.seed_list[i % len(warmup.seed_list)]

            try:
                email_service.send_email(
                    to=[recipient],
                    subject=email_content["subject"],
                    body_text=email_content.get("body_text"),
                    body_html=email_content.get("body_html"),
                    from_email=from_email,
                    reply_to=reply_to_list,
                    tags={"warmup": "true", "domain": warmup.domain},
                    _skip_warmup_check=True,
                )
            except Exception:
                logger.exception(
                    "Failed to send warmup email",
                    domain=warmup.domain,
                    recipient=recipient,
                )
                continue

            sent_for_domain += 1

            # Increment daily send counter (we skipped the warmup check above)
            try:
                repo.increment_daily_send(warmup.domain, today, daily_limit)
            except Exception:
                logger.warning("Failed to increment daily send counter", domain=warmup.domain)

            # Record per-recipient for detailed audit log
            try:
                repo.record_warmup_email(
                    domain=warmup.domain,
                    date_str=today,
                    email_data={
                        "subject": email_content["subject"],
                        "recipient": recipient,
                        "from_email": from_email,
                        "content_type": email_content.get("content_type", ""),
                        "sent_at": datetime.now(timezone.utc).isoformat(),
                        "kb_source": email_content.get("kb_source", ""),
                        "kb_excerpt": email_content.get("kb_excerpt", ""),
                        "kb_reasoning": email_content.get("kb_reasoning", ""),
                        "profile_alignment": email_content.get("profile_alignment", ""),
                    },
                )
            except Exception:
                logger.warning(
                    "Failed to record warmup email",
                    domain=warmup.domain,
                    recipient=recipient,
                )

        total_sent += sent_for_domain
        domains_processed += 1

        logger.info(
            "Warmup emails sent for domain",
            domain=warmup.domain,
            sent=sent_for_domain,
            target=emails_this_hour,
        )

    logger.info(
        "Warmup hourly sender completed",
        domains_processed=domains_processed,
        total_sent=total_sent,
    )

    return {
        "status": "success",
        "domains_processed": domains_processed,
        "total_sent": total_sent,
    }


def _remaining_window_hours(
    current_hour: int, window_start: int, window_end: int,
) -> int:
    """Calculate remaining hours in the send window from current hour.

    Args:
        current_hour: Current UTC hour (0-23).
        window_start: Window start hour.
        window_end: Window end hour.

    Returns:
        Number of remaining hours in the window (minimum 1).
    """
    if window_start <= window_end:
        remaining = window_end - current_hour
    else:
        if current_hour >= window_start:
            remaining = (24 - current_hour) + window_end
        else:
            remaining = window_end - current_hour
    return max(remaining, 1)


def _get_verified_sender(workspace_id: str, domain: str) -> str:
    """Get a verified sender email for a domain from workspace settings.

    Looks through the workspace's registered_emails for a verified email
    whose domain matches the warmup domain.

    Args:
        workspace_id: Workspace ID.
        domain: Warmup domain name.

    Returns:
        Verified email address, or "noreply@{domain}" as fallback.
    """
    try:
        import boto3

        ses = boto3.client("ses")
        from complens.repositories.workspace import WorkspaceRepository

        ws_repo = WorkspaceRepository()
        workspace = ws_repo.get_by_id(workspace_id)
        if not workspace or not workspace.settings:
            return f"noreply@{domain}"

        registered = workspace.settings.get("registered_emails", [])
        if not registered:
            return f"noreply@{domain}"

        # Find emails matching this domain
        matching = [
            entry["email"]
            for entry in registered
            if isinstance(entry, dict)
            and entry.get("email", "").endswith(f"@{domain}")
        ]

        if not matching:
            return f"noreply@{domain}"

        # Verify with SES which ones are actually verified
        response = ses.get_identity_verification_attributes(Identities=matching)
        attrs = response.get("VerificationAttributes", {})

        for email in matching:
            status = attrs.get(email, {}).get("VerificationStatus")
            if status == "Success":
                return email

        return f"noreply@{domain}"

    except Exception:
        logger.debug("Could not resolve verified sender", workspace_id=workspace_id, domain=domain)
        return f"noreply@{domain}"
