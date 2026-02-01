"""Twilio integration service for SMS messaging.

Handles sending SMS messages via Twilio API and managing Twilio resources.
"""

import os
from typing import Any

import structlog
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException

logger = structlog.get_logger()


class TwilioError(Exception):
    """Custom exception for Twilio-related errors."""

    def __init__(self, message: str, code: str | None = None, details: dict | None = None):
        """Initialize TwilioError.

        Args:
            message: Error message.
            code: Twilio error code.
            details: Additional error details.
        """
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details or {}


class TwilioService:
    """Service for interacting with Twilio API.

    Supports both global credentials (from environment) and per-workspace
    credentials for multi-tenant scenarios.
    """

    def __init__(
        self,
        account_sid: str | None = None,
        auth_token: str | None = None,
    ):
        """Initialize Twilio service.

        Args:
            account_sid: Twilio Account SID. Falls back to TWILIO_ACCOUNT_SID env var.
            auth_token: Twilio Auth Token. Falls back to TWILIO_AUTH_TOKEN env var.
        """
        self.account_sid = account_sid or os.environ.get("TWILIO_ACCOUNT_SID")
        self.auth_token = auth_token or os.environ.get("TWILIO_AUTH_TOKEN")
        self._client: Client | None = None

    @property
    def client(self) -> Client:
        """Get Twilio client (lazy initialization).

        Returns:
            Twilio REST client.

        Raises:
            TwilioError: If credentials are not configured.
        """
        if self._client is None:
            if not self.account_sid or not self.auth_token:
                raise TwilioError(
                    "Twilio credentials not configured",
                    code="CREDENTIALS_MISSING",
                )
            self._client = Client(self.account_sid, self.auth_token)
        return self._client

    @property
    def is_configured(self) -> bool:
        """Check if Twilio is properly configured.

        Returns:
            True if credentials are available.
        """
        return bool(self.account_sid and self.auth_token)

    def send_sms(
        self,
        to: str,
        body: str,
        from_number: str | None = None,
        messaging_service_sid: str | None = None,
        status_callback: str | None = None,
        media_urls: list[str] | None = None,
    ) -> dict[str, Any]:
        """Send an SMS message.

        Args:
            to: Recipient phone number (E.164 format).
            body: Message content.
            from_number: Sender phone number. Falls back to TWILIO_PHONE_NUMBER env var.
            messaging_service_sid: Optional Twilio Messaging Service SID.
            status_callback: URL for delivery status webhooks.
            media_urls: List of media URLs for MMS.

        Returns:
            Dict with message details including sid, status, etc.

        Raises:
            TwilioError: If sending fails.
        """
        from_number = from_number or os.environ.get("TWILIO_PHONE_NUMBER")

        if not from_number and not messaging_service_sid:
            raise TwilioError(
                "Either from_number or messaging_service_sid is required",
                code="SENDER_MISSING",
            )

        if not to:
            raise TwilioError("Recipient phone number is required", code="RECIPIENT_MISSING")

        if not body:
            raise TwilioError("Message body is required", code="BODY_MISSING")

        # Normalize phone numbers
        to = self._normalize_phone(to)
        if from_number:
            from_number = self._normalize_phone(from_number)

        logger.info(
            "Sending SMS",
            to=to,
            from_number=from_number[:6] + "****" if from_number else None,
            body_length=len(body),
            has_media=bool(media_urls),
        )

        try:
            # Build message kwargs
            kwargs: dict[str, Any] = {
                "to": to,
                "body": body,
            }

            if messaging_service_sid:
                kwargs["messaging_service_sid"] = messaging_service_sid
            else:
                kwargs["from_"] = from_number

            if status_callback:
                kwargs["status_callback"] = status_callback

            if media_urls:
                kwargs["media_url"] = media_urls

            # Send message
            message = self.client.messages.create(**kwargs)

            result = {
                "message_sid": message.sid,
                "to": message.to,
                "from": message.from_,
                "body": message.body,
                "status": message.status,
                "num_segments": message.num_segments,
                "price": message.price,
                "price_unit": message.price_unit,
                "date_created": message.date_created.isoformat() if message.date_created else None,
            }

            logger.info(
                "SMS sent successfully",
                message_sid=message.sid,
                status=message.status,
            )

            return result

        except TwilioRestException as e:
            logger.error(
                "Twilio SMS send failed",
                error_code=e.code,
                error_message=e.msg,
                to=to,
            )
            raise TwilioError(
                f"Failed to send SMS: {e.msg}",
                code=str(e.code),
                details={"twilio_error": e.msg},
            ) from e

    def get_message(self, message_sid: str) -> dict[str, Any]:
        """Get message details by SID.

        Args:
            message_sid: Twilio message SID.

        Returns:
            Message details dict.

        Raises:
            TwilioError: If lookup fails.
        """
        try:
            message = self.client.messages(message_sid).fetch()

            return {
                "message_sid": message.sid,
                "to": message.to,
                "from": message.from_,
                "body": message.body,
                "status": message.status,
                "error_code": message.error_code,
                "error_message": message.error_message,
                "date_created": message.date_created.isoformat() if message.date_created else None,
                "date_sent": message.date_sent.isoformat() if message.date_sent else None,
            }

        except TwilioRestException as e:
            logger.error(
                "Twilio message fetch failed",
                message_sid=message_sid,
                error_code=e.code,
            )
            raise TwilioError(
                f"Failed to fetch message: {e.msg}",
                code=str(e.code),
            ) from e

    def validate_phone_number(self, phone: str) -> dict[str, Any]:
        """Validate and lookup phone number using Twilio Lookup API.

        Args:
            phone: Phone number to validate.

        Returns:
            Phone number details including carrier info.

        Raises:
            TwilioError: If lookup fails.
        """
        try:
            result = self.client.lookups.v2.phone_numbers(phone).fetch()

            return {
                "phone_number": result.phone_number,
                "country_code": result.country_code,
                "national_format": result.national_format,
                "valid": result.valid,
                "validation_errors": result.validation_errors,
            }

        except TwilioRestException as e:
            logger.error("Phone validation failed", phone=phone, error_code=e.code)
            raise TwilioError(
                f"Failed to validate phone: {e.msg}",
                code=str(e.code),
            ) from e

    def _normalize_phone(self, phone: str) -> str:
        """Normalize phone number to E.164 format.

        Args:
            phone: Phone number in various formats.

        Returns:
            Phone number in E.164 format.
        """
        # Remove all non-digit characters except leading +
        if phone.startswith("+"):
            cleaned = "+" + "".join(filter(str.isdigit, phone[1:]))
        else:
            cleaned = "".join(filter(str.isdigit, phone))
            # Assume US number if 10 digits
            if len(cleaned) == 10:
                cleaned = "+1" + cleaned
            elif len(cleaned) == 11 and cleaned.startswith("1"):
                cleaned = "+" + cleaned
            else:
                cleaned = "+" + cleaned

        return cleaned


def get_twilio_service(workspace_credentials: dict | None = None) -> TwilioService:
    """Factory function to get a TwilioService instance.

    Args:
        workspace_credentials: Optional workspace-specific credentials.
            Keys: account_sid, auth_token

    Returns:
        Configured TwilioService instance.
    """
    if workspace_credentials:
        return TwilioService(
            account_sid=workspace_credentials.get("account_sid"),
            auth_token=workspace_credentials.get("auth_token"),
        )
    return TwilioService()
