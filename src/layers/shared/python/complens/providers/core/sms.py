"""Twilio SMS Provider.

Provides SMS messaging capabilities via Twilio.
"""

from typing import Any

import structlog

from complens.integrations.base_provider import (
    ActionInput,
    BaseProvider,
    ProviderCredentials,
    TriggerConfig,
)
from complens.integrations.manifest import (
    ActionDefinition,
    AuthConfig,
    AuthMethod,
    FieldDefinition,
    FieldType,
    OutputDefinition,
    ProviderManifest,
    TriggerDefinition,
)
from complens.nodes.base import NodeResult
from complens.services.twilio_service import TwilioError, TwilioService

logger = structlog.get_logger()


class TwilioProvider(BaseProvider):
    """Twilio SMS provider.

    Provides the following actions:
    - send_sms: Send an SMS message
    - validate_phone: Validate a phone number

    Provides the following triggers:
    - sms_received: Triggered when an SMS is received
    """

    def __init__(self, twilio_service: TwilioService | None = None):
        """Initialize the Twilio provider.

        Args:
            twilio_service: Optional TwilioService instance (for testing).
        """
        super().__init__()
        self._twilio_service = twilio_service

    def get_twilio_service(
        self,
        credentials: ProviderCredentials | None = None,
    ) -> TwilioService:
        """Get the Twilio service, optionally with workspace credentials.

        Args:
            credentials: Optional workspace credentials.

        Returns:
            TwilioService instance.
        """
        if self._twilio_service is not None:
            return self._twilio_service

        if credentials and credentials.credentials:
            return TwilioService(
                account_sid=credentials.credentials.get("account_sid"),
                auth_token=credentials.credentials.get("auth_token"),
            )

        return TwilioService()

    def get_manifest(self) -> ProviderManifest:
        """Return the Twilio provider manifest."""
        return ProviderManifest(
            id="twilio",
            name="Twilio",
            description="Send SMS messages and receive inbound SMS via Twilio",
            version="1.0.0",
            icon="message-square",
            category="sms",
            website="https://www.twilio.com/",
            documentation="https://www.twilio.com/docs/sms",
            auth=AuthConfig(
                method=AuthMethod.API_KEY,
                fields=[
                    FieldDefinition(
                        name="account_sid",
                        label="Account SID",
                        type=FieldType.STRING,
                        description="Twilio Account SID",
                        required=True,
                        sensitive=True,
                    ),
                    FieldDefinition(
                        name="auth_token",
                        label="Auth Token",
                        type=FieldType.STRING,
                        description="Twilio Auth Token",
                        required=True,
                        sensitive=True,
                    ),
                    FieldDefinition(
                        name="phone_number",
                        label="Phone Number",
                        type=FieldType.PHONE,
                        description="Default Twilio phone number to send from",
                        required=True,
                    ),
                    FieldDefinition(
                        name="messaging_service_sid",
                        label="Messaging Service SID",
                        type=FieldType.STRING,
                        description="Optional Twilio Messaging Service SID",
                        required=False,
                    ),
                ],
                test_endpoint="test_credentials",
            ),
            actions=[
                ActionDefinition(
                    id="send_sms",
                    name="Send SMS",
                    description="Send an SMS message to a phone number",
                    category="communication",
                    icon="message-square",
                    fields=[
                        FieldDefinition(
                            name="to",
                            label="To",
                            type=FieldType.TEMPLATE,
                            description="Recipient phone number (supports template variables like {{contact.phone}})",
                            required=True,
                            default="{{contact.phone}}",
                        ),
                        FieldDefinition(
                            name="body",
                            label="Message",
                            type=FieldType.TEXT,
                            description="SMS message content (max 1600 characters)",
                            required=True,
                            validation={"max_length": 1600},
                        ),
                        FieldDefinition(
                            name="from_number",
                            label="From Number",
                            type=FieldType.PHONE,
                            description="Sender phone number (overrides default)",
                            required=False,
                        ),
                        FieldDefinition(
                            name="media_urls",
                            label="Media URLs",
                            type=FieldType.STRING,
                            description="Comma-separated URLs for MMS attachments",
                            required=False,
                        ),
                    ],
                    outputs=[
                        OutputDefinition(
                            name="message_sid",
                            type="string",
                            description="Twilio message SID",
                        ),
                        OutputDefinition(
                            name="status",
                            type="string",
                            description="Message status",
                        ),
                        OutputDefinition(
                            name="num_segments",
                            type="number",
                            description="Number of SMS segments",
                        ),
                    ],
                    timeout_seconds=30,
                    retryable=True,
                    rate_limit={"requests_per_minute": 100},
                ),
                ActionDefinition(
                    id="validate_phone",
                    name="Validate Phone Number",
                    description="Validate and lookup phone number information",
                    category="utility",
                    icon="phone",
                    fields=[
                        FieldDefinition(
                            name="phone",
                            label="Phone Number",
                            type=FieldType.TEMPLATE,
                            description="Phone number to validate",
                            required=True,
                            default="{{contact.phone}}",
                        ),
                    ],
                    outputs=[
                        OutputDefinition(
                            name="valid",
                            type="boolean",
                            description="Whether the phone number is valid",
                        ),
                        OutputDefinition(
                            name="phone_number",
                            type="string",
                            description="Normalized phone number (E.164 format)",
                        ),
                        OutputDefinition(
                            name="country_code",
                            type="string",
                            description="Phone number country code",
                        ),
                    ],
                    timeout_seconds=10,
                    retryable=True,
                ),
            ],
            triggers=[
                TriggerDefinition(
                    id="sms_received",
                    name="SMS Received",
                    description="Triggered when an inbound SMS is received",
                    category="communication",
                    icon="message-square",
                    fields=[
                        FieldDefinition(
                            name="keyword_filter",
                            label="Keyword Filter",
                            type=FieldType.STRING,
                            description="Optional keyword to filter messages (case-insensitive)",
                            required=False,
                        ),
                        FieldDefinition(
                            name="from_filter",
                            label="From Number Filter",
                            type=FieldType.STRING,
                            description="Optional phone number pattern to filter (e.g., +1555*)",
                            required=False,
                        ),
                    ],
                    outputs=[
                        OutputDefinition(
                            name="from_number",
                            type="string",
                            description="Sender phone number",
                        ),
                        OutputDefinition(
                            name="to_number",
                            type="string",
                            description="Recipient phone number",
                        ),
                        OutputDefinition(
                            name="body",
                            type="string",
                            description="Message content",
                        ),
                        OutputDefinition(
                            name="message_sid",
                            type="string",
                            description="Twilio message SID",
                        ),
                    ],
                    webhook_required=True,
                ),
            ],
            capabilities=["webhooks", "mms", "lookup"],
        )

    async def execute_action(self, input: ActionInput) -> NodeResult:
        """Execute a Twilio action.

        Args:
            input: Action input with config and context.

        Returns:
            NodeResult with action result.
        """
        if input.action_id == "send_sms":
            return await self._send_sms(input)
        elif input.action_id == "validate_phone":
            return await self._validate_phone(input)
        else:
            return self._build_error_result(
                error=f"Unknown action: {input.action_id}",
                retryable=False,
            )

    async def _send_sms(self, input: ActionInput) -> NodeResult:
        """Send an SMS message.

        Args:
            input: Action input.

        Returns:
            NodeResult with send status.
        """
        config = input.config

        to_number = config.get("to", "")
        body = config.get("body", "")
        from_number = config.get("from_number")
        media_urls_str = config.get("media_urls", "")

        if not to_number:
            return self._build_error_result(
                error="Recipient phone number is required",
                error_code="RECIPIENT_MISSING",
                retryable=False,
            )

        if not body:
            return self._build_error_result(
                error="Message body is required",
                error_code="BODY_MISSING",
                retryable=False,
            )

        # Parse media URLs
        media_urls = None
        if media_urls_str:
            media_urls = [url.strip() for url in media_urls_str.split(",") if url.strip()]

        self.logger.info(
            "Sending SMS via Twilio",
            to=to_number[:6] + "****" if len(to_number) > 6 else to_number,
            body_length=len(body),
            has_media=bool(media_urls),
        )

        twilio = self.get_twilio_service(input.credentials)

        # Check if Twilio is configured
        if not twilio.is_configured:
            self.logger.warning("Twilio not configured, simulating send")
            return NodeResult.completed(
                output={
                    "message_sid": f"SM_SIMULATED_{input.context.workflow_run.id[:24]}",
                    "to": to_number,
                    "body": body,
                    "status": "simulated",
                    "simulated": True,
                    "num_segments": 1,
                },
                variables={"last_sms_sid": "SIMULATED"},
            )

        try:
            result = twilio.send_sms(
                to=to_number,
                body=body,
                from_number=from_number,
                media_urls=media_urls,
            )

            return NodeResult.completed(
                output={
                    "message_sid": result["message_sid"],
                    "to": result["to"],
                    "from": result.get("from"),
                    "body": body,
                    "status": result["status"],
                    "num_segments": result.get("num_segments", 1),
                },
                variables={"last_sms_sid": result["message_sid"]},
            )

        except TwilioError as e:
            self.logger.error(
                "Twilio send failed",
                error=e.message,
                error_code=e.code,
            )
            return self._build_error_result(
                error=f"Failed to send SMS: {e.message}",
                error_code=e.code,
                details=e.details,
                retryable=self._is_retryable_error(e.code),
            )

    async def _validate_phone(self, input: ActionInput) -> NodeResult:
        """Validate a phone number.

        Args:
            input: Action input.

        Returns:
            NodeResult with validation result.
        """
        config = input.config
        phone = config.get("phone", "")

        if not phone:
            return self._build_error_result(
                error="Phone number is required",
                error_code="PHONE_MISSING",
                retryable=False,
            )

        twilio = self.get_twilio_service(input.credentials)

        if not twilio.is_configured:
            # Basic validation without Twilio
            return NodeResult.completed(
                output={
                    "valid": True,
                    "phone_number": phone,
                    "country_code": "unknown",
                    "simulated": True,
                }
            )

        try:
            result = twilio.validate_phone_number(phone)

            return NodeResult.completed(
                output={
                    "valid": result.get("valid", False),
                    "phone_number": result.get("phone_number"),
                    "country_code": result.get("country_code"),
                    "national_format": result.get("national_format"),
                    "validation_errors": result.get("validation_errors"),
                }
            )

        except TwilioError as e:
            self.logger.error(
                "Phone validation failed",
                error=e.message,
            )
            return self._build_error_result(
                error=f"Phone validation failed: {e.message}",
                error_code=e.code,
                retryable=True,
            )

    async def setup_trigger(self, config: TriggerConfig) -> dict[str, Any]:
        """Set up a Twilio trigger (webhook configuration).

        Args:
            config: Trigger configuration.

        Returns:
            Setup result with webhook URL info.
        """
        if config.trigger_id == "sms_received":
            # Return the webhook URL for Twilio to call
            # The actual webhook is set up in the Twilio console
            webhook_url = f"/webhooks/twilio/{config.workspace_id}"

            return {
                "status": "configured",
                "webhook_url": webhook_url,
                "instructions": (
                    "Configure this webhook URL in your Twilio phone number settings "
                    "under 'A Message Comes In'"
                ),
                "config": {
                    "keyword_filter": config.config.get("keyword_filter"),
                    "from_filter": config.config.get("from_filter"),
                },
            }

        return {"status": "not_supported", "trigger_id": config.trigger_id}

    async def authenticate(
        self,
        credentials: dict[str, Any],
        workspace_id: str,
    ) -> ProviderCredentials:
        """Validate Twilio credentials.

        Args:
            credentials: Twilio credentials (account_sid, auth_token).
            workspace_id: Workspace ID.

        Returns:
            Validated ProviderCredentials.

        Raises:
            ValueError: If credentials are invalid.
        """
        account_sid = credentials.get("account_sid")
        auth_token = credentials.get("auth_token")

        if not account_sid or not auth_token:
            raise ValueError("Account SID and Auth Token are required")

        # Test the credentials
        twilio = TwilioService(account_sid=account_sid, auth_token=auth_token)

        try:
            # Try to fetch the account to verify credentials
            twilio.client.api.accounts(account_sid).fetch()
        except Exception as e:
            raise ValueError(f"Invalid Twilio credentials: {str(e)}")

        return ProviderCredentials(
            provider_id=self.provider_id,
            workspace_id=workspace_id,
            credentials=credentials,
        )

    async def test_connection(
        self,
        credentials: ProviderCredentials,
    ) -> dict[str, Any]:
        """Test Twilio connection.

        Args:
            credentials: Twilio credentials.

        Returns:
            Test result.
        """
        twilio = self.get_twilio_service(credentials)

        if not twilio.is_configured:
            return {
                "success": False,
                "message": "Twilio credentials not configured",
            }

        try:
            # Fetch account info
            account = twilio.client.api.accounts(twilio.account_sid).fetch()
            return {
                "success": True,
                "message": "Twilio connection successful",
                "account": {
                    "friendly_name": account.friendly_name,
                    "status": account.status,
                    "type": account.type,
                },
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Twilio connection failed: {str(e)}",
            }

    def _is_retryable_error(self, error_code: str | None) -> bool:
        """Check if a Twilio error is retryable.

        Args:
            error_code: Twilio error code.

        Returns:
            True if error is retryable.
        """
        if not error_code:
            return True

        # Non-retryable Twilio error codes
        non_retryable = {
            "21211",  # Invalid 'To' Phone Number
            "21212",  # Invalid 'To' Phone Number
            "21408",  # Permission to send SMS has not been enabled
            "21610",  # Message cannot be sent to this destination
            "21614",  # 'To' number is not a valid mobile number
            "30004",  # Message blocked
            "30005",  # Unknown destination handset
            "30006",  # Landline or unreachable carrier
            "CREDENTIALS_MISSING",
            "SENDER_MISSING",
            "RECIPIENT_MISSING",
            "BODY_MISSING",
        }

        return error_code not in non_retryable


def get_provider() -> TwilioProvider:
    """Get an instance of the Twilio provider."""
    return TwilioProvider()
