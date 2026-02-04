"""Remediation service for auto-fixing recoverable DLQ errors.

Provides automatic fixes for common recoverable errors:
- Phone number formatting (E.164)
- Email normalization
- Payload size reduction
- HTML sanitization
- OAuth token refresh

Usage:
    service = RemediationService()
    fixed_message = service.apply_fixes(
        message=original_message,
        fixes=[FixType.PHONE_E164, FixType.EMAIL_NORMALIZE],
    )
"""

import html
import re
from dataclasses import dataclass, field
from typing import Any, Callable

import structlog

from complens.dlq.error_classifier import FixType

logger = structlog.get_logger()


@dataclass
class RemediationResult:
    """Result of applying remediation fixes."""

    success: bool
    message: dict[str, Any]  # Fixed message
    fixes_applied: list[FixType] = field(default_factory=list)
    fixes_failed: list[tuple[FixType, str]] = field(default_factory=list)
    changes: list[str] = field(default_factory=list)  # Description of changes


class PhoneFormatter:
    """Formats phone numbers to E.164 format."""

    # Country codes for common regions
    COUNTRY_CODES = {
        "us": "1",
        "ca": "1",
        "uk": "44",
        "gb": "44",
        "au": "61",
        "de": "49",
        "fr": "33",
        "in": "91",
        "mx": "52",
        "br": "55",
    }

    # Default country code if not specified
    DEFAULT_COUNTRY = "1"  # US/Canada

    @classmethod
    def format_e164(
        cls,
        phone: str,
        country: str | None = None,
    ) -> str | None:
        """Format a phone number to E.164.

        Args:
            phone: Phone number string.
            country: Optional country code hint.

        Returns:
            E.164 formatted number or None if invalid.
        """
        if not phone:
            return None

        # Remove all non-digit characters except leading +
        has_plus = phone.strip().startswith("+")
        digits = re.sub(r"[^\d]", "", phone)

        if not digits:
            return None

        # If already has +, assume it's E.164
        if has_plus and len(digits) >= 10:
            return f"+{digits}"

        # Get country code
        country_code = cls.DEFAULT_COUNTRY
        if country:
            country_code = cls.COUNTRY_CODES.get(country.lower(), cls.DEFAULT_COUNTRY)

        # Handle US/Canada numbers
        if country_code == "1":
            if len(digits) == 10:
                return f"+1{digits}"
            elif len(digits) == 11 and digits.startswith("1"):
                return f"+{digits}"

        # Handle other countries - assume full number if 10+ digits
        if len(digits) >= 10:
            # Check if it already starts with country code
            if digits.startswith(country_code):
                return f"+{digits}"
            return f"+{country_code}{digits}"

        return None

    @classmethod
    def is_valid_e164(cls, phone: str) -> bool:
        """Check if a phone is valid E.164 format.

        Args:
            phone: Phone number string.

        Returns:
            True if valid E.164.
        """
        if not phone:
            return False

        # E.164: + followed by 1-15 digits
        pattern = r"^\+[1-9]\d{1,14}$"
        return bool(re.match(pattern, phone.strip()))


class EmailNormalizer:
    """Normalizes email addresses."""

    @classmethod
    def normalize(cls, email: str) -> str | None:
        """Normalize an email address.

        Args:
            email: Email address string.

        Returns:
            Normalized email or None if invalid.
        """
        if not email:
            return None

        # Basic cleanup
        email = email.strip().lower()

        # Remove any mailto: prefix
        if email.startswith("mailto:"):
            email = email[7:]

        # Basic validation
        if not cls.is_valid_email(email):
            return None

        return email

    @classmethod
    def is_valid_email(cls, email: str) -> bool:
        """Check if an email is valid.

        Args:
            email: Email address string.

        Returns:
            True if valid.
        """
        if not email:
            return False

        # Basic email pattern
        pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
        return bool(re.match(pattern, email.strip()))


class PayloadTrimmer:
    """Trims payload to fit size limits."""

    # Default limits by provider
    LIMITS = {
        "twilio_sms": 1600,  # 1600 chars for SMS
        "ses_subject": 200,  # 200 chars for subject
        "ses_body": 10_000_000,  # 10MB for body
        "bedrock_prompt": 100_000,  # Approximate prompt limit
        "default": 50_000,  # 50KB default
    }

    @classmethod
    def trim(
        cls,
        content: str,
        limit_type: str = "default",
        suffix: str = "...",
    ) -> str:
        """Trim content to fit within limits.

        Args:
            content: Content to trim.
            limit_type: Type of limit to apply.
            suffix: Suffix to add when trimmed.

        Returns:
            Trimmed content.
        """
        if not content:
            return content

        limit = cls.LIMITS.get(limit_type, cls.LIMITS["default"])

        if len(content) <= limit:
            return content

        # Leave room for suffix
        trim_length = limit - len(suffix)
        return content[:trim_length] + suffix

    @classmethod
    def trim_message_body(
        cls,
        message: dict[str, Any],
        provider: str = "default",
    ) -> dict[str, Any]:
        """Trim message body fields.

        Args:
            message: Message dict.
            provider: Provider name.

        Returns:
            Message with trimmed body.
        """
        message = message.copy()

        # Common body field names
        body_fields = ["body", "message", "content", "text", "message_body"]

        limit_type = f"{provider}_sms" if provider == "twilio" else "default"

        for field in body_fields:
            if field in message and isinstance(message[field], str):
                message[field] = cls.trim(message[field], limit_type)

        return message


class HtmlSanitizer:
    """Sanitizes HTML content."""

    # Tags to remove completely (with content)
    REMOVE_TAGS = ["script", "style", "iframe", "object", "embed"]

    # Tags to convert to text
    STRIP_TAGS = ["a", "b", "i", "u", "strong", "em", "span", "div", "p", "br"]

    @classmethod
    def sanitize(cls, content: str, strip_all: bool = False) -> str:
        """Sanitize HTML content.

        Args:
            content: HTML content.
            strip_all: If True, remove all HTML tags.

        Returns:
            Sanitized content.
        """
        if not content:
            return content

        # Remove dangerous tags with content
        for tag in cls.REMOVE_TAGS:
            pattern = rf"<{tag}[^>]*>.*?</{tag}>"
            content = re.sub(pattern, "", content, flags=re.IGNORECASE | re.DOTALL)

        if strip_all:
            # Remove all remaining tags
            content = re.sub(r"<[^>]+>", "", content)
        else:
            # Just strip the safe tags (keep content)
            for tag in cls.STRIP_TAGS:
                content = re.sub(rf"</?{tag}[^>]*>", "", content, flags=re.IGNORECASE)

        # Decode HTML entities
        content = html.unescape(content)

        # Clean up whitespace
        content = re.sub(r"\s+", " ", content).strip()

        return content


class RemediationService:
    """Service for applying automatic fixes to failed messages.

    Example:
        service = RemediationService()

        # Apply specific fixes
        result = service.apply_fixes(
            message={"to": "555-123-4567", "body": "Hello"},
            fixes=[FixType.PHONE_E164],
        )

        if result.success:
            print(f"Fixed message: {result.message}")
            print(f"Changes: {result.changes}")
    """

    def __init__(self):
        """Initialize the remediation service."""
        self.logger = logger.bind(service="remediation_service")

        # Registry of fix handlers
        self._fix_handlers: dict[FixType, Callable] = {
            FixType.PHONE_E164: self._fix_phone_e164,
            FixType.EMAIL_NORMALIZE: self._fix_email_normalize,
            FixType.TRIM_PAYLOAD: self._fix_trim_payload,
            FixType.SANITIZE_HTML: self._fix_sanitize_html,
            FixType.REDUCE_BATCH: self._fix_reduce_batch,
            FixType.REFRESH_TOKEN: self._fix_refresh_token,
        }

    def apply_fixes(
        self,
        message: dict[str, Any],
        fixes: list[FixType],
        context: dict[str, Any] | None = None,
    ) -> RemediationResult:
        """Apply a list of fixes to a message.

        Args:
            message: Original message dict.
            fixes: List of fixes to apply.
            context: Additional context (provider, workspace, etc.).

        Returns:
            RemediationResult with fixed message.
        """
        context = context or {}
        result = RemediationResult(
            success=True,
            message=message.copy(),
        )

        for fix_type in fixes:
            handler = self._fix_handlers.get(fix_type)

            if not handler:
                self.logger.warning(
                    "Unknown fix type",
                    fix_type=fix_type.value,
                )
                result.fixes_failed.append((fix_type, "Unknown fix type"))
                continue

            try:
                fixed_message, change = handler(result.message, context)
                result.message = fixed_message

                if change:
                    result.fixes_applied.append(fix_type)
                    result.changes.append(change)
                    self.logger.info(
                        "Fix applied",
                        fix_type=fix_type.value,
                        change=change,
                    )

            except Exception as e:
                self.logger.error(
                    "Fix failed",
                    fix_type=fix_type.value,
                    error=str(e),
                )
                result.fixes_failed.append((fix_type, str(e)))

        # Check if any critical fixes failed
        if result.fixes_failed and not result.fixes_applied:
            result.success = False

        return result

    def _fix_phone_e164(
        self,
        message: dict[str, Any],
        context: dict[str, Any],
    ) -> tuple[dict[str, Any], str | None]:
        """Fix phone number to E.164 format.

        Args:
            message: Message dict.
            context: Fix context.

        Returns:
            Tuple of (fixed_message, change_description).
        """
        message = message.copy()
        changes = []

        # Common phone field names
        phone_fields = ["to", "phone", "phone_number", "recipient", "to_number"]
        country = context.get("country")

        for field in phone_fields:
            if field in message:
                original = message[field]
                if not original:
                    continue

                # Handle single phone or list
                if isinstance(original, list):
                    fixed = []
                    for phone in original:
                        formatted = PhoneFormatter.format_e164(phone, country)
                        fixed.append(formatted or phone)
                    if fixed != original:
                        message[field] = fixed
                        changes.append(f"{field}: formatted to E.164")
                else:
                    formatted = PhoneFormatter.format_e164(original, country)
                    if formatted and formatted != original:
                        message[field] = formatted
                        changes.append(f"{field}: {original} → {formatted}")

        change_desc = "; ".join(changes) if changes else None
        return message, change_desc

    def _fix_email_normalize(
        self,
        message: dict[str, Any],
        context: dict[str, Any],
    ) -> tuple[dict[str, Any], str | None]:
        """Normalize email addresses.

        Args:
            message: Message dict.
            context: Fix context.

        Returns:
            Tuple of (fixed_message, change_description).
        """
        message = message.copy()
        changes = []

        # Common email field names
        email_fields = ["to", "email", "recipient", "to_email", "reply_to"]

        for field in email_fields:
            if field in message:
                original = message[field]
                if not original:
                    continue

                if isinstance(original, list):
                    fixed = []
                    for email in original:
                        normalized = EmailNormalizer.normalize(email)
                        fixed.append(normalized or email)
                    if fixed != original:
                        message[field] = fixed
                        changes.append(f"{field}: normalized emails")
                else:
                    normalized = EmailNormalizer.normalize(original)
                    if normalized and normalized != original:
                        message[field] = normalized
                        changes.append(f"{field}: {original} → {normalized}")

        change_desc = "; ".join(changes) if changes else None
        return message, change_desc

    def _fix_trim_payload(
        self,
        message: dict[str, Any],
        context: dict[str, Any],
    ) -> tuple[dict[str, Any], str | None]:
        """Trim payload to fit size limits.

        Args:
            message: Message dict.
            context: Fix context.

        Returns:
            Tuple of (fixed_message, change_description).
        """
        provider = context.get("provider", "default")
        message = PayloadTrimmer.trim_message_body(message, provider)

        # Check if any trimming was needed
        change_desc = f"Trimmed message body for {provider}" if provider else None
        return message, change_desc

    def _fix_sanitize_html(
        self,
        message: dict[str, Any],
        context: dict[str, Any],
    ) -> tuple[dict[str, Any], str | None]:
        """Sanitize HTML content.

        Args:
            message: Message dict.
            context: Fix context.

        Returns:
            Tuple of (fixed_message, change_description).
        """
        message = message.copy()
        changes = []

        # Fields that might contain HTML
        html_fields = ["body", "html_body", "content", "message"]
        strip_all = context.get("strip_html", False)

        for field in html_fields:
            if field in message and isinstance(message[field], str):
                original = message[field]
                sanitized = HtmlSanitizer.sanitize(original, strip_all)
                if sanitized != original:
                    message[field] = sanitized
                    changes.append(f"Sanitized HTML in {field}")

        change_desc = "; ".join(changes) if changes else None
        return message, change_desc

    def _fix_reduce_batch(
        self,
        message: dict[str, Any],
        context: dict[str, Any],
    ) -> tuple[dict[str, Any], str | None]:
        """Reduce batch size for bulk operations.

        Args:
            message: Message dict.
            context: Fix context.

        Returns:
            Tuple of (fixed_message, change_description).
        """
        message = message.copy()
        original_size = context.get("original_batch_size", 0)
        max_size = context.get("max_batch_size", 10)

        # Check for batch-related fields
        batch_fields = ["recipients", "to", "contacts", "items"]

        for field in batch_fields:
            if field in message and isinstance(message[field], list):
                original_len = len(message[field])
                if original_len > max_size:
                    message[field] = message[field][:max_size]
                    return message, f"Reduced {field} from {original_len} to {max_size}"

        return message, None

    def _fix_refresh_token(
        self,
        message: dict[str, Any],
        context: dict[str, Any],
    ) -> tuple[dict[str, Any], str | None]:
        """Refresh OAuth token (placeholder - actual refresh happens elsewhere).

        Args:
            message: Message dict.
            context: Fix context.

        Returns:
            Tuple of (fixed_message, change_description).
        """
        # Token refresh is typically handled by the credential service
        # This just marks that it should be refreshed
        message = message.copy()
        message["_refresh_token"] = True

        workspace_id = context.get("workspace_id")
        provider_id = context.get("provider_id")

        if workspace_id and provider_id:
            return message, f"Marked token for refresh: {provider_id}"

        return message, None

    def can_fix(self, fix_type: FixType) -> bool:
        """Check if a fix type is supported.

        Args:
            fix_type: Fix type to check.

        Returns:
            True if supported.
        """
        return fix_type in self._fix_handlers


# Singleton instance
_remediation_service: RemediationService | None = None


def get_remediation_service() -> RemediationService:
    """Get the global RemediationService instance.

    Returns:
        RemediationService instance.
    """
    global _remediation_service
    if _remediation_service is None:
        _remediation_service = RemediationService()
    return _remediation_service


def apply_fixes(
    message: dict[str, Any],
    fixes: list[FixType],
    context: dict[str, Any] | None = None,
) -> RemediationResult:
    """Convenience function to apply fixes.

    Args:
        message: Original message.
        fixes: List of fixes to apply.
        context: Fix context.

    Returns:
        RemediationResult.
    """
    service = get_remediation_service()
    return service.apply_fixes(message, fixes, context)
