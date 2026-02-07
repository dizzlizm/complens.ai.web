"""Error classifier for DLQ message analysis.

Classifies failed workflow messages into categories to determine
the appropriate remediation action:
- Transient: Temporary failures that should be retried
- Recoverable: Failures that can be auto-fixed then retried
- Permanent: Failures requiring manual intervention

Usage:
    classifier = ErrorClassifier()
    classification = classifier.classify(error_message, error_details)

    if classification.error_type == ErrorCategory.TRANSIENT:
        # Retry with backoff
        pass
    elif classification.error_type == ErrorCategory.RECOVERABLE:
        # Apply auto-fix, then retry
        pass
    else:
        # Alert for manual fix
        pass
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import structlog

logger = structlog.get_logger()


class ErrorCategory(str, Enum):
    """Error categories for DLQ remediation."""

    TRANSIENT = "transient"  # Retry will likely succeed
    RECOVERABLE = "recoverable"  # Can be auto-fixed
    PERMANENT = "permanent"  # Requires manual intervention
    UNKNOWN = "unknown"  # Unclassified error


class RecoveryAction(str, Enum):
    """Recommended recovery actions."""

    RETRY = "retry"  # Simple retry with backoff
    RETRY_WITH_BACKOFF = "retry_with_backoff"  # Exponential backoff
    FIX_AND_RETRY = "fix_and_retry"  # Apply fix then retry
    REDUCE_AND_RETRY = "reduce_and_retry"  # Reduce payload size
    REFRESH_AND_RETRY = "refresh_and_retry"  # Refresh credentials
    ALERT = "alert"  # Notify for manual fix
    DISCARD = "discard"  # Drop the message


class FixType(str, Enum):
    """Types of auto-fixes available."""

    PHONE_E164 = "phone_e164"  # Format phone to E.164
    EMAIL_NORMALIZE = "email_normalize"  # Normalize email
    TRIM_PAYLOAD = "trim_payload"  # Reduce payload size
    SANITIZE_HTML = "sanitize_html"  # Clean HTML content
    REFRESH_TOKEN = "refresh_token"  # Refresh OAuth token
    REDUCE_BATCH = "reduce_batch"  # Reduce batch size


@dataclass
class ErrorClassification:
    """Result of error classification."""

    error_type: ErrorCategory
    action: RecoveryAction
    confidence: float  # 0.0 to 1.0
    reason: str
    provider: str | None = None
    error_code: str | None = None
    fixes: list[FixType] = field(default_factory=list)
    retry_delay_seconds: int = 60
    max_retries: int = 3
    metadata: dict[str, Any] = field(default_factory=dict)


# Error patterns for classification
# Format: (pattern, category, action, reason, fixes, confidence)
ERROR_PATTERNS: list[tuple] = [
    # Transient - Network/Infrastructure
    (r"timeout|timed out|deadline exceeded", ErrorCategory.TRANSIENT,
     RecoveryAction.RETRY_WITH_BACKOFF, "Timeout - retry with backoff", [], 0.9),
    (r"connection (refused|reset|closed)", ErrorCategory.TRANSIENT,
     RecoveryAction.RETRY_WITH_BACKOFF, "Connection error - retry", [], 0.9),
    (r"temporarily unavailable|service unavailable|503", ErrorCategory.TRANSIENT,
     RecoveryAction.RETRY_WITH_BACKOFF, "Service temporarily unavailable", [], 0.95),
    (r"internal server error|500", ErrorCategory.TRANSIENT,
     RecoveryAction.RETRY_WITH_BACKOFF, "Server error - retry", [], 0.7),
    (r"gateway timeout|504", ErrorCategory.TRANSIENT,
     RecoveryAction.RETRY_WITH_BACKOFF, "Gateway timeout", [], 0.9),
    (r"bad gateway|502", ErrorCategory.TRANSIENT,
     RecoveryAction.RETRY_WITH_BACKOFF, "Bad gateway - retry", [], 0.8),

    # Transient - Rate limiting
    (r"rate limit|too many requests|429|throttl", ErrorCategory.TRANSIENT,
     RecoveryAction.RETRY_WITH_BACKOFF, "Rate limited - retry with backoff", [], 0.95),
    (r"quota exceeded|limit exceeded", ErrorCategory.TRANSIENT,
     RecoveryAction.RETRY_WITH_BACKOFF, "Quota exceeded - retry later", [], 0.9),
    (r"concurrent (request|execution) limit", ErrorCategory.TRANSIENT,
     RecoveryAction.RETRY_WITH_BACKOFF, "Concurrency limit - retry", [], 0.9),

    # Recoverable - Phone formatting
    (r"invalid phone|phone.*invalid|e\.?164", ErrorCategory.RECOVERABLE,
     RecoveryAction.FIX_AND_RETRY, "Invalid phone format - can normalize", [FixType.PHONE_E164], 0.85),
    (r"unverified.*number|number.*unverified", ErrorCategory.RECOVERABLE,
     RecoveryAction.FIX_AND_RETRY, "Unverified phone - can format", [FixType.PHONE_E164], 0.7),

    # Recoverable - Email formatting
    (r"invalid email|email.*invalid|malformed.*email", ErrorCategory.RECOVERABLE,
     RecoveryAction.FIX_AND_RETRY, "Invalid email format - can normalize", [FixType.EMAIL_NORMALIZE], 0.85),
    (r"email.*domain|domain.*invalid", ErrorCategory.RECOVERABLE,
     RecoveryAction.FIX_AND_RETRY, "Email domain issue - can normalize", [FixType.EMAIL_NORMALIZE], 0.7),

    # Recoverable - Payload issues
    (r"payload too large|message too long|body.*too.*large", ErrorCategory.RECOVERABLE,
     RecoveryAction.REDUCE_AND_RETRY, "Payload too large - can trim", [FixType.TRIM_PAYLOAD], 0.9),
    (r"character limit|exceeds.*limit|max.*length", ErrorCategory.RECOVERABLE,
     RecoveryAction.REDUCE_AND_RETRY, "Content too long - can trim", [FixType.TRIM_PAYLOAD], 0.85),

    # Recoverable - Auth refresh
    (r"token expired|expired.*token|refresh.*token", ErrorCategory.RECOVERABLE,
     RecoveryAction.REFRESH_AND_RETRY, "Token expired - can refresh", [FixType.REFRESH_TOKEN], 0.9),
    (r"access token.*invalid|invalid.*access.*token", ErrorCategory.RECOVERABLE,
     RecoveryAction.REFRESH_AND_RETRY, "Invalid access token - can refresh", [FixType.REFRESH_TOKEN], 0.8),

    # Permanent - Authentication
    (r"invalid credentials|authentication failed|401", ErrorCategory.PERMANENT,
     RecoveryAction.ALERT, "Invalid credentials - manual fix required", [], 0.95),
    (r"api key.*invalid|invalid.*api.*key", ErrorCategory.PERMANENT,
     RecoveryAction.ALERT, "Invalid API key - manual fix required", [], 0.95),
    (r"unauthorized|forbidden|403", ErrorCategory.PERMANENT,
     RecoveryAction.ALERT, "Authorization failed - check permissions", [], 0.85),

    # Permanent - Resource issues
    (r"not found|404|does not exist|no such", ErrorCategory.PERMANENT,
     RecoveryAction.ALERT, "Resource not found - manual fix required", [], 0.8),
    (r"contact.*not.*found|recipient.*not.*found", ErrorCategory.PERMANENT,
     RecoveryAction.ALERT, "Contact not found", [], 0.9),
    (r"workflow.*not.*found|workflow.*deleted", ErrorCategory.PERMANENT,
     RecoveryAction.DISCARD, "Workflow deleted - discard message", [], 0.95),

    # Permanent - Validation
    (r"validation (error|failed)|invalid (request|input)", ErrorCategory.PERMANENT,
     RecoveryAction.ALERT, "Validation error - check configuration", [], 0.7),
    (r"schema.*invalid|invalid.*schema", ErrorCategory.PERMANENT,
     RecoveryAction.ALERT, "Schema validation failed", [], 0.9),
    (r"required.*field.*missing|missing.*required", ErrorCategory.PERMANENT,
     RecoveryAction.ALERT, "Missing required field", [], 0.9),

    # Permanent - Account issues
    (r"account (suspended|disabled|blocked)", ErrorCategory.PERMANENT,
     RecoveryAction.ALERT, "Account suspended - contact support", [], 0.95),
    (r"subscription.*expired|plan.*limit", ErrorCategory.PERMANENT,
     RecoveryAction.ALERT, "Subscription issue - upgrade required", [], 0.9),
]

# Provider-specific error codes
PROVIDER_ERROR_CODES: dict[str, dict[str, tuple]] = {
    "twilio": {
        "21211": (ErrorCategory.RECOVERABLE, RecoveryAction.FIX_AND_RETRY,
                  "Invalid phone number", [FixType.PHONE_E164]),
        "21614": (ErrorCategory.RECOVERABLE, RecoveryAction.FIX_AND_RETRY,
                  "Invalid phone number", [FixType.PHONE_E164]),
        "30003": (ErrorCategory.TRANSIENT, RecoveryAction.RETRY_WITH_BACKOFF,
                  "Unreachable destination", []),
        "30004": (ErrorCategory.PERMANENT, RecoveryAction.ALERT,
                  "Message blocked", []),
        "30005": (ErrorCategory.PERMANENT, RecoveryAction.ALERT,
                  "Unknown destination", []),
        "30006": (ErrorCategory.PERMANENT, RecoveryAction.ALERT,
                  "Landline not supported", []),
        "30007": (ErrorCategory.TRANSIENT, RecoveryAction.RETRY_WITH_BACKOFF,
                  "Carrier violation - retry", []),
        "20003": (ErrorCategory.PERMANENT, RecoveryAction.ALERT,
                  "Permission denied", []),
        "20008": (ErrorCategory.TRANSIENT, RecoveryAction.RETRY_WITH_BACKOFF,
                  "Rate limit exceeded", []),
    },
    "ses": {
        "MessageRejected": (ErrorCategory.PERMANENT, RecoveryAction.ALERT,
                           "Email rejected by SES", []),
        "MailFromDomainNotVerified": (ErrorCategory.PERMANENT, RecoveryAction.ALERT,
                                       "Domain not verified", []),
        "ConfigurationSetDoesNotExist": (ErrorCategory.PERMANENT, RecoveryAction.ALERT,
                                          "Configuration set missing", []),
        "AccountSendingPaused": (ErrorCategory.PERMANENT, RecoveryAction.ALERT,
                                  "SES sending paused", []),
        "Throttling": (ErrorCategory.TRANSIENT, RecoveryAction.RETRY_WITH_BACKOFF,
                       "SES throttling", []),
    },
    "bedrock": {
        "ThrottlingException": (ErrorCategory.TRANSIENT, RecoveryAction.RETRY_WITH_BACKOFF,
                                "Bedrock throttling", []),
        "ServiceQuotaExceededException": (ErrorCategory.TRANSIENT, RecoveryAction.RETRY_WITH_BACKOFF,
                                           "Bedrock quota exceeded", []),
        "ModelTimeoutException": (ErrorCategory.TRANSIENT, RecoveryAction.RETRY_WITH_BACKOFF,
                                   "Model timeout", []),
        "ValidationException": (ErrorCategory.PERMANENT, RecoveryAction.ALERT,
                                "Bedrock validation error", []),
        "AccessDeniedException": (ErrorCategory.PERMANENT, RecoveryAction.ALERT,
                                   "Bedrock access denied", []),
    },
}


class ErrorClassifier:
    """Classifies DLQ errors for remediation.

    Example:
        classifier = ErrorClassifier()

        # Classify an error
        classification = classifier.classify(
            error_message="Invalid phone number format",
            error_details={"code": "21211", "provider": "twilio"},
        )

        print(f"Type: {classification.error_type}")
        print(f"Action: {classification.action}")
        print(f"Fixes: {classification.fixes}")
    """

    def __init__(self):
        """Initialize the error classifier."""
        self.logger = logger.bind(service="error_classifier")
        self._compiled_patterns: list[tuple] = []
        self._compile_patterns()

    def _compile_patterns(self) -> None:
        """Compile regex patterns for performance."""
        for pattern_tuple in ERROR_PATTERNS:
            pattern, *rest = pattern_tuple
            compiled = re.compile(pattern, re.IGNORECASE)
            self._compiled_patterns.append((compiled, *rest))

    def classify(
        self,
        error_message: str,
        error_details: dict[str, Any] | None = None,
        provider: str | None = None,
    ) -> ErrorClassification:
        """Classify an error for remediation.

        Args:
            error_message: Error message string.
            error_details: Additional error details dict.
            provider: Provider name (twilio, ses, bedrock, etc.).

        Returns:
            ErrorClassification with category and recommended action.
        """
        error_details = error_details or {}
        error_code = error_details.get("code") or error_details.get("error_code")

        # Normalize inputs
        error_message = str(error_message).lower() if error_message else ""
        provider = provider or error_details.get("provider", "").lower()

        self.logger.debug(
            "Classifying error",
            error_message=error_message[:100],
            provider=provider,
            error_code=error_code,
        )

        # Check provider-specific error codes first
        if provider and error_code:
            provider_classification = self._classify_by_provider_code(
                provider, str(error_code)
            )
            if provider_classification:
                provider_classification.provider = provider
                provider_classification.error_code = str(error_code)
                return provider_classification

        # Check error message patterns
        for compiled, category, action, reason, fixes, confidence in self._compiled_patterns:
            if compiled.search(error_message):
                return ErrorClassification(
                    error_type=category,
                    action=action,
                    confidence=confidence,
                    reason=reason,
                    provider=provider,
                    error_code=error_code,
                    fixes=fixes,
                    retry_delay_seconds=self._get_retry_delay(category, action),
                    max_retries=self._get_max_retries(category),
                )

        # Default to unknown - alert for manual review
        self.logger.warning(
            "Unknown error type",
            error_message=error_message[:200],
            provider=provider,
        )

        return ErrorClassification(
            error_type=ErrorCategory.UNKNOWN,
            action=RecoveryAction.ALERT,
            confidence=0.3,
            reason="Unknown error type - manual review required",
            provider=provider,
            error_code=error_code,
            retry_delay_seconds=300,
            max_retries=1,
        )

    def _classify_by_provider_code(
        self,
        provider: str,
        error_code: str,
    ) -> ErrorClassification | None:
        """Classify by provider-specific error code.

        Args:
            provider: Provider name.
            error_code: Error code string.

        Returns:
            ErrorClassification or None if not found.
        """
        provider_codes = PROVIDER_ERROR_CODES.get(provider)
        if not provider_codes:
            return None

        code_info = provider_codes.get(error_code)
        if not code_info:
            return None

        category, action, reason, fixes = code_info

        return ErrorClassification(
            error_type=category,
            action=action,
            confidence=0.95,  # High confidence for explicit codes
            reason=reason,
            fixes=fixes,
            retry_delay_seconds=self._get_retry_delay(category, action),
            max_retries=self._get_max_retries(category),
        )

    def _get_retry_delay(
        self,
        category: ErrorCategory,
        action: RecoveryAction,
    ) -> int:
        """Get recommended retry delay in seconds.

        Args:
            category: Error category.
            action: Recovery action.

        Returns:
            Delay in seconds.
        """
        if category == ErrorCategory.TRANSIENT:
            if action == RecoveryAction.RETRY_WITH_BACKOFF:
                return 60  # Start with 1 minute, will increase
            return 30

        if category == ErrorCategory.RECOVERABLE:
            return 10  # Quick retry after fix

        return 300  # Default 5 minutes

    def _get_max_retries(self, category: ErrorCategory) -> int:
        """Get maximum retry count for category.

        Args:
            category: Error category.

        Returns:
            Max retry count.
        """
        if category == ErrorCategory.TRANSIENT:
            return 5

        if category == ErrorCategory.RECOVERABLE:
            return 3

        return 1  # Permanent errors get one retry after alert

    def is_retryable(self, classification: ErrorClassification) -> bool:
        """Check if an error should be retried.

        Args:
            classification: Error classification.

        Returns:
            True if error should be retried.
        """
        return classification.action in (
            RecoveryAction.RETRY,
            RecoveryAction.RETRY_WITH_BACKOFF,
            RecoveryAction.FIX_AND_RETRY,
            RecoveryAction.REDUCE_AND_RETRY,
            RecoveryAction.REFRESH_AND_RETRY,
        )

    def get_provider_errors(self, provider: str) -> dict[str, tuple]:
        """Get all error codes for a provider.

        Args:
            provider: Provider name.

        Returns:
            Dict of error codes and their classifications.
        """
        return PROVIDER_ERROR_CODES.get(provider, {})


# Singleton instance
_error_classifier: ErrorClassifier | None = None


def get_error_classifier() -> ErrorClassifier:
    """Get the global ErrorClassifier instance.

    Returns:
        ErrorClassifier instance.
    """
    global _error_classifier
    if _error_classifier is None:
        _error_classifier = ErrorClassifier()
    return _error_classifier


def classify_error(
    error_message: str,
    error_details: dict[str, Any] | None = None,
    provider: str | None = None,
) -> ErrorClassification:
    """Convenience function to classify an error.

    Args:
        error_message: Error message.
        error_details: Additional details.
        provider: Provider name.

    Returns:
        ErrorClassification.
    """
    classifier = get_error_classifier()
    return classifier.classify(error_message, error_details, provider)
