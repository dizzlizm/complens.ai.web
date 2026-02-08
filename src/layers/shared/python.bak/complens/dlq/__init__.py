"""Dead Letter Queue handling for automatic error remediation.

This module provides automatic recovery from workflow failures:
- ErrorClassifier: Categorizes errors as transient, recoverable, or permanent
- RemediationService: Applies automatic fixes for recoverable errors
- AlertService: Notifies on permanent failures requiring manual intervention
"""

from complens.dlq.alert_service import (
    Alert,
    AlertResult,
    AlertService,
    AlertSeverity,
    AlertType,
    NotificationChannel,
    get_alert_service,
    send_alert,
)
from complens.dlq.error_classifier import (
    ErrorCategory,
    ErrorClassification,
    ErrorClassifier,
    FixType,
    RecoveryAction,
    classify_error,
    get_error_classifier,
)
from complens.dlq.remediation_service import (
    EmailNormalizer,
    HtmlSanitizer,
    PayloadTrimmer,
    PhoneFormatter,
    RemediationResult,
    RemediationService,
    apply_fixes,
    get_remediation_service,
)

__all__ = [
    # Alert service
    "Alert",
    "AlertResult",
    "AlertService",
    "AlertSeverity",
    "AlertType",
    "NotificationChannel",
    "get_alert_service",
    "send_alert",
    # Error classifier
    "ErrorCategory",
    "ErrorClassification",
    "ErrorClassifier",
    "FixType",
    "RecoveryAction",
    "classify_error",
    "get_error_classifier",
    # Remediation service
    "EmailNormalizer",
    "HtmlSanitizer",
    "PayloadTrimmer",
    "PhoneFormatter",
    "RemediationResult",
    "RemediationService",
    "apply_fixes",
    "get_remediation_service",
]
