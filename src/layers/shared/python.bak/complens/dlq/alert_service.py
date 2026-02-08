"""Alert service for DLQ permanent failure notifications.

Provides notifications to workspace owners when workflow failures
require manual intervention. Supports multiple notification channels:
- Email (via SES)
- SNS topics
- Webhook callbacks
- In-app notifications (stored in DynamoDB)

Usage:
    alert_service = AlertService()
    await alert_service.send_alert(
        workspace_id="ws_123",
        alert_type=AlertType.WORKFLOW_FAILURE,
        title="Workflow failed",
        message="Failed to send SMS: Invalid phone number",
        details={...},
    )
"""

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import boto3
import structlog
from botocore.exceptions import ClientError

logger = structlog.get_logger()


class AlertType(str, Enum):
    """Types of alerts."""

    WORKFLOW_FAILURE = "workflow_failure"
    PROVIDER_ERROR = "provider_error"
    CREDENTIAL_EXPIRED = "credential_expired"
    QUOTA_EXCEEDED = "quota_exceeded"
    CIRCUIT_BREAKER_OPEN = "circuit_breaker_open"
    DLQ_THRESHOLD = "dlq_threshold"
    SYSTEM_ERROR = "system_error"


class AlertSeverity(str, Enum):
    """Alert severity levels."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class NotificationChannel(str, Enum):
    """Notification channels."""

    EMAIL = "email"
    SNS = "sns"
    WEBHOOK = "webhook"
    IN_APP = "in_app"


@dataclass
class Alert:
    """Alert data structure."""

    workspace_id: str
    alert_type: AlertType
    severity: AlertSeverity
    title: str
    message: str
    details: dict[str, Any] = field(default_factory=dict)
    channels: list[NotificationChannel] = field(default_factory=list)
    alert_id: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class AlertResult:
    """Result of sending an alert."""

    success: bool
    alert_id: str
    channels_sent: list[NotificationChannel] = field(default_factory=list)
    channels_failed: list[tuple[NotificationChannel, str]] = field(default_factory=list)


class AlertService:
    """Service for sending alerts on permanent failures.

    Example:
        service = AlertService()

        result = await service.send_alert(
            workspace_id="ws_123",
            alert_type=AlertType.WORKFLOW_FAILURE,
            title="SMS delivery failed",
            message="Invalid phone number format",
            details={
                "workflow_id": "wf_456",
                "contact_id": "contact_789",
                "error_code": "21211",
            },
        )

        if result.success:
            print(f"Alert sent: {result.alert_id}")
    """

    # Default channels by severity
    DEFAULT_CHANNELS = {
        AlertSeverity.INFO: [NotificationChannel.IN_APP],
        AlertSeverity.WARNING: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        AlertSeverity.ERROR: [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        AlertSeverity.CRITICAL: [
            NotificationChannel.IN_APP,
            NotificationChannel.EMAIL,
            NotificationChannel.SNS,
        ],
    }

    # Severity by alert type
    DEFAULT_SEVERITY = {
        AlertType.WORKFLOW_FAILURE: AlertSeverity.ERROR,
        AlertType.PROVIDER_ERROR: AlertSeverity.ERROR,
        AlertType.CREDENTIAL_EXPIRED: AlertSeverity.CRITICAL,
        AlertType.QUOTA_EXCEEDED: AlertSeverity.WARNING,
        AlertType.CIRCUIT_BREAKER_OPEN: AlertSeverity.WARNING,
        AlertType.DLQ_THRESHOLD: AlertSeverity.ERROR,
        AlertType.SYSTEM_ERROR: AlertSeverity.CRITICAL,
    }

    def __init__(
        self,
        table_name: str | None = None,
        sns_topic_arn: str | None = None,
        from_email: str | None = None,
    ):
        """Initialize the alert service.

        Args:
            table_name: DynamoDB table name.
            sns_topic_arn: SNS topic ARN for alerts.
            from_email: Email address for sending alerts.
        """
        self.table_name = table_name or os.environ.get("TABLE_NAME")
        self.sns_topic_arn = sns_topic_arn or os.environ.get("DLQ_ALERT_TOPIC_ARN")
        self.from_email = from_email or os.environ.get("SES_FROM_EMAIL")

        self._dynamodb = None
        self._sns = None
        self._ses = None

        self.logger = logger.bind(service="alert_service")

    @property
    def dynamodb(self):
        """Get DynamoDB resource (lazy initialization)."""
        if self._dynamodb is None:
            self._dynamodb = boto3.resource("dynamodb")
        return self._dynamodb

    @property
    def sns(self):
        """Get SNS client (lazy initialization)."""
        if self._sns is None:
            self._sns = boto3.client("sns")
        return self._sns

    @property
    def ses(self):
        """Get SES client (lazy initialization)."""
        if self._ses is None:
            self._ses = boto3.client("ses")
        return self._ses

    async def send_alert(
        self,
        workspace_id: str,
        alert_type: AlertType,
        title: str,
        message: str,
        details: dict[str, Any] | None = None,
        severity: AlertSeverity | None = None,
        channels: list[NotificationChannel] | None = None,
    ) -> AlertResult:
        """Send an alert to workspace owners.

        Args:
            workspace_id: Workspace ID.
            alert_type: Type of alert.
            title: Alert title.
            message: Alert message.
            details: Additional details.
            severity: Alert severity (defaults based on type).
            channels: Notification channels (defaults based on severity).

        Returns:
            AlertResult with send status.
        """
        from complens.models.base import generate_ulid

        # Determine severity
        if severity is None:
            severity = self.DEFAULT_SEVERITY.get(alert_type, AlertSeverity.WARNING)

        # Determine channels
        if channels is None:
            channels = self.DEFAULT_CHANNELS.get(severity, [NotificationChannel.IN_APP])

        # Create alert
        alert = Alert(
            workspace_id=workspace_id,
            alert_type=alert_type,
            severity=severity,
            title=title,
            message=message,
            details=details or {},
            channels=channels,
            alert_id=f"alert-{generate_ulid()}",
        )

        self.logger.info(
            "Sending alert",
            alert_id=alert.alert_id,
            workspace_id=workspace_id,
            alert_type=alert_type.value,
            severity=severity.value,
            channels=[c.value for c in channels],
        )

        # Send to each channel
        result = AlertResult(
            success=True,
            alert_id=alert.alert_id,
        )

        for channel in channels:
            try:
                if channel == NotificationChannel.IN_APP:
                    await self._send_in_app(alert)
                elif channel == NotificationChannel.EMAIL:
                    await self._send_email(alert)
                elif channel == NotificationChannel.SNS:
                    await self._send_sns(alert)
                elif channel == NotificationChannel.WEBHOOK:
                    await self._send_webhook(alert)

                result.channels_sent.append(channel)

            except Exception as e:
                self.logger.error(
                    "Failed to send alert to channel",
                    channel=channel.value,
                    alert_id=alert.alert_id,
                    error=str(e),
                )
                result.channels_failed.append((channel, str(e)))

        # Consider success if at least one channel succeeded
        result.success = len(result.channels_sent) > 0

        return result

    async def _send_in_app(self, alert: Alert) -> None:
        """Send in-app notification (store in DynamoDB).

        Args:
            alert: Alert to send.
        """
        if not self.table_name:
            raise ValueError("TABLE_NAME not configured")

        table = self.dynamodb.Table(self.table_name)

        # Store notification for UI display
        table.put_item(
            Item={
                "PK": f"WS#{alert.workspace_id}",
                "SK": f"ALERT#{alert.alert_id}",
                "GSI1PK": f"WS#{alert.workspace_id}#ALERTS",
                "GSI1SK": alert.created_at.isoformat(),
                "id": alert.alert_id,
                "workspace_id": alert.workspace_id,
                "type": alert.alert_type.value,
                "severity": alert.severity.value,
                "title": alert.title,
                "message": alert.message,
                "details": alert.details,
                "created_at": alert.created_at.isoformat(),
                "read": False,
                "dismissed": False,
                "ttl": int(alert.created_at.timestamp()) + (7 * 24 * 60 * 60),  # 7 days
            }
        )

        self.logger.info(
            "In-app alert stored",
            alert_id=alert.alert_id,
            workspace_id=alert.workspace_id,
        )

    async def _send_email(self, alert: Alert) -> None:
        """Send email notification.

        Args:
            alert: Alert to send.
        """
        if not self.from_email:
            raise ValueError("SES_FROM_EMAIL not configured")

        # Get workspace notification email
        notification_email = await self._get_workspace_notification_email(
            alert.workspace_id
        )

        if not notification_email:
            self.logger.warning(
                "No notification email for workspace",
                workspace_id=alert.workspace_id,
            )
            return

        # Build email content
        subject = f"[{alert.severity.value.upper()}] {alert.title}"
        html_body = self._build_email_html(alert)
        text_body = self._build_email_text(alert)

        try:
            self.ses.send_email(
                Source=self.from_email,
                Destination={
                    "ToAddresses": [notification_email],
                },
                Message={
                    "Subject": {"Data": subject},
                    "Body": {
                        "Text": {"Data": text_body},
                        "Html": {"Data": html_body},
                    },
                },
            )

            self.logger.info(
                "Email alert sent",
                alert_id=alert.alert_id,
                to=notification_email,
            )

        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code", "")
            if error_code in ("MessageRejected", "MailFromDomainNotVerified"):
                self.logger.warning(
                    "Email alert blocked by SES",
                    error_code=error_code,
                )
            raise

    async def _send_sns(self, alert: Alert) -> None:
        """Send SNS notification.

        Args:
            alert: Alert to send.
        """
        if not self.sns_topic_arn:
            raise ValueError("DLQ_ALERT_TOPIC_ARN not configured")

        message = {
            "alert_id": alert.alert_id,
            "workspace_id": alert.workspace_id,
            "type": alert.alert_type.value,
            "severity": alert.severity.value,
            "title": alert.title,
            "message": alert.message,
            "details": alert.details,
            "timestamp": alert.created_at.isoformat(),
        }

        self.sns.publish(
            TopicArn=self.sns_topic_arn,
            Subject=f"[{alert.severity.value.upper()}] {alert.title}",
            Message=json.dumps(message, indent=2),
            MessageAttributes={
                "workspace_id": {
                    "DataType": "String",
                    "StringValue": alert.workspace_id,
                },
                "alert_type": {
                    "DataType": "String",
                    "StringValue": alert.alert_type.value,
                },
                "severity": {
                    "DataType": "String",
                    "StringValue": alert.severity.value,
                },
            },
        )

        self.logger.info(
            "SNS alert published",
            alert_id=alert.alert_id,
            topic_arn=self.sns_topic_arn,
        )

    async def _send_webhook(self, alert: Alert) -> None:
        """Send webhook notification.

        Args:
            alert: Alert to send.
        """
        # Get workspace webhook URL
        webhook_url = await self._get_workspace_webhook_url(alert.workspace_id)

        if not webhook_url:
            self.logger.debug(
                "No webhook URL for workspace",
                workspace_id=alert.workspace_id,
            )
            return

        import urllib.request
        import urllib.error

        payload = {
            "event": "alert",
            "alert_id": alert.alert_id,
            "workspace_id": alert.workspace_id,
            "type": alert.alert_type.value,
            "severity": alert.severity.value,
            "title": alert.title,
            "message": alert.message,
            "details": alert.details,
            "timestamp": alert.created_at.isoformat(),
        }

        req = urllib.request.Request(
            webhook_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                self.logger.info(
                    "Webhook alert sent",
                    alert_id=alert.alert_id,
                    status=response.status,
                )
        except urllib.error.URLError as e:
            self.logger.error(
                "Webhook alert failed",
                alert_id=alert.alert_id,
                error=str(e),
            )
            raise

    async def _get_workspace_notification_email(
        self,
        workspace_id: str,
    ) -> str | None:
        """Get notification email for a workspace.

        Args:
            workspace_id: Workspace ID.

        Returns:
            Email address or None.
        """
        if not self.table_name:
            return None

        try:
            table = self.dynamodb.Table(self.table_name)
            response = table.get_item(
                Key={
                    "PK": f"WS#{workspace_id}",
                    "SK": "META",
                },
            )
            item = response.get("Item", {})
            return item.get("notification_email")

        except ClientError:
            return None

    async def _get_workspace_webhook_url(
        self,
        workspace_id: str,
    ) -> str | None:
        """Get webhook URL for a workspace.

        Args:
            workspace_id: Workspace ID.

        Returns:
            Webhook URL or None.
        """
        if not self.table_name:
            return None

        try:
            table = self.dynamodb.Table(self.table_name)
            response = table.get_item(
                Key={
                    "PK": f"WS#{workspace_id}",
                    "SK": "META",
                },
            )
            item = response.get("Item", {})
            settings = item.get("settings", {})
            return settings.get("alert_webhook_url")

        except ClientError:
            return None

    def _build_email_html(self, alert: Alert) -> str:
        """Build HTML email body.

        Args:
            alert: Alert data.

        Returns:
            HTML string.
        """
        severity_colors = {
            AlertSeverity.INFO: "#3b82f6",
            AlertSeverity.WARNING: "#f59e0b",
            AlertSeverity.ERROR: "#ef4444",
            AlertSeverity.CRITICAL: "#dc2626",
        }
        color = severity_colors.get(alert.severity, "#6b7280")

        details_html = ""
        if alert.details:
            details_rows = "".join(
                f"<tr><td style='padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;'>{k}</td>"
                f"<td style='padding: 8px; border: 1px solid #e5e7eb;'>{v}</td></tr>"
                for k, v in alert.details.items()
            )
            details_html = f"""
            <h3 style="margin-top: 20px;">Details</h3>
            <table style="border-collapse: collapse; width: 100%;">
                {details_rows}
            </table>
            """

        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto;">
                <div style="background-color: {color}; color: white; padding: 15px; border-radius: 8px 8px 0 0;">
                    <h2 style="margin: 0;">{alert.title}</h2>
                    <span style="opacity: 0.8;">{alert.severity.value.upper()} - {alert.alert_type.value}</span>
                </div>
                <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                    <p style="font-size: 16px; line-height: 1.5;">{alert.message}</p>
                    {details_html}
                    <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
                        Alert ID: {alert.alert_id}<br>
                        Workspace: {alert.workspace_id}<br>
                        Time: {alert.created_at.isoformat()}
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

    def _build_email_text(self, alert: Alert) -> str:
        """Build plain text email body.

        Args:
            alert: Alert data.

        Returns:
            Text string.
        """
        details_text = ""
        if alert.details:
            details_text = "\n\nDetails:\n" + "\n".join(
                f"  {k}: {v}" for k, v in alert.details.items()
            )

        return f"""
{alert.severity.value.upper()}: {alert.title}

{alert.message}
{details_text}

---
Alert ID: {alert.alert_id}
Workspace: {alert.workspace_id}
Type: {alert.alert_type.value}
Time: {alert.created_at.isoformat()}
"""

    async def get_unread_alerts(
        self,
        workspace_id: str,
        limit: int = 50,
    ) -> list[dict]:
        """Get unread alerts for a workspace.

        Args:
            workspace_id: Workspace ID.
            limit: Maximum alerts to return.

        Returns:
            List of alert dicts.
        """
        if not self.table_name:
            return []

        try:
            table = self.dynamodb.Table(self.table_name)
            response = table.query(
                IndexName="GSI1",
                KeyConditionExpression="GSI1PK = :pk",
                FilterExpression="read = :read",
                ExpressionAttributeValues={
                    ":pk": f"WS#{workspace_id}#ALERTS",
                    ":read": False,
                },
                ScanIndexForward=False,
                Limit=limit,
            )
            return response.get("Items", [])

        except ClientError as e:
            self.logger.error(
                "Failed to get unread alerts",
                workspace_id=workspace_id,
                error=str(e),
            )
            return []

    async def mark_alert_read(
        self,
        workspace_id: str,
        alert_id: str,
    ) -> bool:
        """Mark an alert as read.

        Args:
            workspace_id: Workspace ID.
            alert_id: Alert ID.

        Returns:
            True if successful.
        """
        if not self.table_name:
            return False

        try:
            table = self.dynamodb.Table(self.table_name)
            table.update_item(
                Key={
                    "PK": f"WS#{workspace_id}",
                    "SK": f"ALERT#{alert_id}",
                },
                UpdateExpression="SET #read = :read",
                ExpressionAttributeNames={"#read": "read"},
                ExpressionAttributeValues={":read": True},
            )
            return True

        except ClientError as e:
            self.logger.error(
                "Failed to mark alert read",
                alert_id=alert_id,
                error=str(e),
            )
            return False


# Singleton instance
_alert_service: AlertService | None = None


def get_alert_service() -> AlertService:
    """Get the global AlertService instance.

    Returns:
        AlertService instance.
    """
    global _alert_service
    if _alert_service is None:
        _alert_service = AlertService()
    return _alert_service


async def send_alert(
    workspace_id: str,
    alert_type: AlertType,
    title: str,
    message: str,
    details: dict[str, Any] | None = None,
    severity: AlertSeverity | None = None,
) -> AlertResult:
    """Convenience function to send an alert.

    Args:
        workspace_id: Workspace ID.
        alert_type: Type of alert.
        title: Alert title.
        message: Alert message.
        details: Additional details.
        severity: Alert severity.

    Returns:
        AlertResult.
    """
    service = get_alert_service()
    return await service.send_alert(
        workspace_id=workspace_id,
        alert_type=alert_type,
        title=title,
        message=message,
        details=details,
        severity=severity,
    )
