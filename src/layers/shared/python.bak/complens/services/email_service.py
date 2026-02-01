"""Email integration service using Amazon SES.

Handles sending emails via AWS SES with support for templates and attachments.
"""

import os
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import boto3
import structlog
from botocore.exceptions import ClientError

logger = structlog.get_logger()


class EmailError(Exception):
    """Custom exception for email-related errors."""

    def __init__(self, message: str, code: str | None = None, details: dict | None = None):
        """Initialize EmailError.

        Args:
            message: Error message.
            code: Error code.
            details: Additional error details.
        """
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}


class EmailService:
    """Service for sending emails via Amazon SES.

    Supports plain text, HTML, and templated emails with optional attachments.
    """

    def __init__(
        self,
        region_name: str | None = None,
        configuration_set: str | None = None,
    ):
        """Initialize Email service.

        Args:
            region_name: AWS region for SES. Falls back to AWS_REGION env var.
            configuration_set: Optional SES configuration set for tracking.
        """
        self.region_name = region_name or os.environ.get("AWS_REGION", "us-east-1")
        self.configuration_set = configuration_set or os.environ.get("SES_CONFIGURATION_SET")
        self._client = None

    @property
    def client(self):
        """Get SES client (lazy initialization).

        Returns:
            Boto3 SES client.
        """
        if self._client is None:
            self._client = boto3.client("ses", region_name=self.region_name)
        return self._client

    def send_email(
        self,
        to: str | list[str],
        subject: str,
        body_text: str | None = None,
        body_html: str | None = None,
        from_email: str | None = None,
        reply_to: list[str] | None = None,
        cc: list[str] | None = None,
        bcc: list[str] | None = None,
        attachments: list[dict] | None = None,
        tags: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Send an email.

        Args:
            to: Recipient email address(es).
            subject: Email subject.
            body_text: Plain text body.
            body_html: HTML body.
            from_email: Sender email. Falls back to SES_FROM_EMAIL env var.
            reply_to: Reply-to addresses.
            cc: CC addresses.
            bcc: BCC addresses.
            attachments: List of attachment dicts with keys: filename, content, content_type.
            tags: Message tags for tracking.

        Returns:
            Dict with message_id and status.

        Raises:
            EmailError: If sending fails.
        """
        from_email = from_email or os.environ.get("SES_FROM_EMAIL")

        if not from_email:
            raise EmailError(
                "Sender email address is required",
                code="SENDER_MISSING",
            )

        if not to:
            raise EmailError("Recipient email address is required", code="RECIPIENT_MISSING")

        if not body_text and not body_html:
            raise EmailError("Email body is required", code="BODY_MISSING")

        # Normalize to list
        if isinstance(to, str):
            to = [to]

        logger.info(
            "Sending email",
            to=to,
            from_email=from_email,
            subject=subject[:50] + "..." if len(subject) > 50 else subject,
            has_html=bool(body_html),
            has_attachments=bool(attachments),
        )

        try:
            # Use raw email if we have attachments, otherwise use simple send
            if attachments:
                return self._send_raw_email(
                    to=to,
                    subject=subject,
                    body_text=body_text,
                    body_html=body_html,
                    from_email=from_email,
                    reply_to=reply_to,
                    cc=cc,
                    bcc=bcc,
                    attachments=attachments,
                    tags=tags,
                )
            else:
                return self._send_simple_email(
                    to=to,
                    subject=subject,
                    body_text=body_text,
                    body_html=body_html,
                    from_email=from_email,
                    reply_to=reply_to,
                    cc=cc,
                    bcc=bcc,
                    tags=tags,
                )

        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_message = e.response["Error"]["Message"]

            logger.error(
                "SES send failed",
                error_code=error_code,
                error_message=error_message,
                to=to,
            )

            raise EmailError(
                f"Failed to send email: {error_message}",
                code=error_code,
                details={"aws_error": error_message},
            ) from e

    def _send_simple_email(
        self,
        to: list[str],
        subject: str,
        body_text: str | None,
        body_html: str | None,
        from_email: str,
        reply_to: list[str] | None,
        cc: list[str] | None,
        bcc: list[str] | None,
        tags: dict[str, str] | None,
    ) -> dict[str, Any]:
        """Send a simple email without attachments.

        Args:
            to: Recipient email addresses.
            subject: Email subject.
            body_text: Plain text body.
            body_html: HTML body.
            from_email: Sender email.
            reply_to: Reply-to addresses.
            cc: CC addresses.
            bcc: BCC addresses.
            tags: Message tags.

        Returns:
            Response dict with message_id.
        """
        # Build body
        body: dict[str, Any] = {}
        if body_text:
            body["Text"] = {"Data": body_text, "Charset": "UTF-8"}
        if body_html:
            body["Html"] = {"Data": body_html, "Charset": "UTF-8"}

        # Build destination
        destination: dict[str, list[str]] = {"ToAddresses": to}
        if cc:
            destination["CcAddresses"] = cc
        if bcc:
            destination["BccAddresses"] = bcc

        # Build request
        kwargs: dict[str, Any] = {
            "Source": from_email,
            "Destination": destination,
            "Message": {
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": body,
            },
        }

        if reply_to:
            kwargs["ReplyToAddresses"] = reply_to

        if self.configuration_set:
            kwargs["ConfigurationSetName"] = self.configuration_set

        if tags:
            kwargs["Tags"] = [{"Name": k, "Value": v} for k, v in tags.items()]

        response = self.client.send_email(**kwargs)

        result = {
            "message_id": response["MessageId"],
            "status": "sent",
            "to": to,
            "from": from_email,
            "subject": subject,
        }

        logger.info(
            "Email sent successfully",
            message_id=response["MessageId"],
        )

        return result

    def _send_raw_email(
        self,
        to: list[str],
        subject: str,
        body_text: str | None,
        body_html: str | None,
        from_email: str,
        reply_to: list[str] | None,
        cc: list[str] | None,
        bcc: list[str] | None,
        attachments: list[dict],
        tags: dict[str, str] | None,
    ) -> dict[str, Any]:
        """Send a raw email with attachments.

        Args:
            to: Recipient email addresses.
            subject: Email subject.
            body_text: Plain text body.
            body_html: HTML body.
            from_email: Sender email.
            reply_to: Reply-to addresses.
            cc: CC addresses.
            bcc: BCC addresses.
            attachments: List of attachment dicts.
            tags: Message tags.

        Returns:
            Response dict with message_id.
        """
        # Create multipart message
        msg = MIMEMultipart("mixed")
        msg["Subject"] = subject
        msg["From"] = from_email
        msg["To"] = ", ".join(to)

        if cc:
            msg["Cc"] = ", ".join(cc)
        if reply_to:
            msg["Reply-To"] = ", ".join(reply_to)

        # Create body part
        body_part = MIMEMultipart("alternative")

        if body_text:
            text_part = MIMEText(body_text, "plain", "utf-8")
            body_part.attach(text_part)

        if body_html:
            html_part = MIMEText(body_html, "html", "utf-8")
            body_part.attach(html_part)

        msg.attach(body_part)

        # Add attachments
        for attachment in attachments:
            filename = attachment.get("filename", "attachment")
            content = attachment.get("content")
            content_type = attachment.get("content_type", "application/octet-stream")

            if content:
                att = MIMEApplication(content)
                att.add_header(
                    "Content-Disposition",
                    "attachment",
                    filename=filename,
                )
                att.add_header("Content-Type", content_type)
                msg.attach(att)

        # Build destinations
        destinations = to.copy()
        if cc:
            destinations.extend(cc)
        if bcc:
            destinations.extend(bcc)

        # Build request
        kwargs: dict[str, Any] = {
            "Source": from_email,
            "Destinations": destinations,
            "RawMessage": {"Data": msg.as_string()},
        }

        if self.configuration_set:
            kwargs["ConfigurationSetName"] = self.configuration_set

        if tags:
            kwargs["Tags"] = [{"Name": k, "Value": v} for k, v in tags.items()]

        response = self.client.send_raw_email(**kwargs)

        result = {
            "message_id": response["MessageId"],
            "status": "sent",
            "to": to,
            "from": from_email,
            "subject": subject,
            "attachments": len(attachments),
        }

        logger.info(
            "Raw email sent successfully",
            message_id=response["MessageId"],
            attachments=len(attachments),
        )

        return result

    def send_templated_email(
        self,
        to: str | list[str],
        template_name: str,
        template_data: dict[str, Any],
        from_email: str | None = None,
        reply_to: list[str] | None = None,
        cc: list[str] | None = None,
        bcc: list[str] | None = None,
        tags: dict[str, str] | None = None,
    ) -> dict[str, Any]:
        """Send an email using an SES template.

        Args:
            to: Recipient email address(es).
            template_name: SES template name.
            template_data: Template variable values.
            from_email: Sender email.
            reply_to: Reply-to addresses.
            cc: CC addresses.
            bcc: BCC addresses.
            tags: Message tags.

        Returns:
            Dict with message_id and status.

        Raises:
            EmailError: If sending fails.
        """
        import json

        from_email = from_email or os.environ.get("SES_FROM_EMAIL")

        if not from_email:
            raise EmailError("Sender email is required", code="SENDER_MISSING")

        # Normalize to list
        if isinstance(to, str):
            to = [to]

        logger.info(
            "Sending templated email",
            to=to,
            template=template_name,
        )

        try:
            # Build destination
            destination: dict[str, list[str]] = {"ToAddresses": to}
            if cc:
                destination["CcAddresses"] = cc
            if bcc:
                destination["BccAddresses"] = bcc

            kwargs: dict[str, Any] = {
                "Source": from_email,
                "Destination": destination,
                "Template": template_name,
                "TemplateData": json.dumps(template_data),
            }

            if reply_to:
                kwargs["ReplyToAddresses"] = reply_to

            if self.configuration_set:
                kwargs["ConfigurationSetName"] = self.configuration_set

            if tags:
                kwargs["Tags"] = [{"Name": k, "Value": v} for k, v in tags.items()]

            response = self.client.send_templated_email(**kwargs)

            result = {
                "message_id": response["MessageId"],
                "status": "sent",
                "to": to,
                "from": from_email,
                "template": template_name,
            }

            logger.info(
                "Templated email sent successfully",
                message_id=response["MessageId"],
            )

            return result

        except ClientError as e:
            error_code = e.response["Error"]["Code"]
            error_message = e.response["Error"]["Message"]

            logger.error(
                "SES templated send failed",
                error_code=error_code,
                template=template_name,
            )

            raise EmailError(
                f"Failed to send templated email: {error_message}",
                code=error_code,
            ) from e

    def verify_email_identity(self, email: str) -> dict[str, Any]:
        """Request verification of an email address.

        Args:
            email: Email address to verify.

        Returns:
            Verification request result.

        Raises:
            EmailError: If verification request fails.
        """
        try:
            self.client.verify_email_identity(EmailAddress=email)

            logger.info("Email verification requested", email=email)

            return {
                "email": email,
                "status": "verification_requested",
            }

        except ClientError as e:
            error_message = e.response["Error"]["Message"]
            raise EmailError(
                f"Failed to request verification: {error_message}",
                code=e.response["Error"]["Code"],
            ) from e

    def get_send_quota(self) -> dict[str, Any]:
        """Get current SES sending quota and usage.

        Returns:
            Dict with quota information.
        """
        try:
            response = self.client.get_send_quota()

            return {
                "max_24_hour_send": response["Max24HourSend"],
                "max_send_rate": response["MaxSendRate"],
                "sent_last_24_hours": response["SentLast24Hours"],
            }

        except ClientError as e:
            logger.error("Failed to get send quota", error=str(e))
            raise EmailError(
                "Failed to get send quota",
                code=e.response["Error"]["Code"],
            ) from e


def get_email_service(region_name: str | None = None) -> EmailService:
    """Factory function to get an EmailService instance.

    Args:
        region_name: Optional AWS region override.

    Returns:
        Configured EmailService instance.
    """
    return EmailService(region_name=region_name)
