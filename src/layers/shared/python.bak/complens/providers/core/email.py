"""SES Email Provider.

Provides email sending capabilities via Amazon SES.
"""

from typing import Any

import structlog

from complens.integrations.base_provider import (
    ActionInput,
    BaseProvider,
    ProviderCredentials,
)
from complens.integrations.manifest import (
    ActionDefinition,
    AuthConfig,
    AuthMethod,
    FieldDefinition,
    FieldType,
    OutputDefinition,
    ProviderManifest,
)
from complens.nodes.base import NodeResult
from complens.services.email_service import EmailError, EmailService

logger = structlog.get_logger()


class SesProvider(BaseProvider):
    """Amazon SES email provider.

    Provides the following actions:
    - send_email: Send a single email
    - send_templated_email: Send using an SES template
    """

    def __init__(self, email_service: EmailService | None = None):
        """Initialize the SES provider.

        Args:
            email_service: Optional EmailService instance (for testing).
        """
        super().__init__()
        self._email_service = email_service

    @property
    def email_service(self) -> EmailService:
        """Get the email service (lazy initialization)."""
        if self._email_service is None:
            self._email_service = EmailService()
        return self._email_service

    def get_manifest(self) -> ProviderManifest:
        """Return the SES provider manifest."""
        return ProviderManifest(
            id="ses",
            name="Amazon SES",
            description="Send emails using Amazon Simple Email Service",
            version="1.0.0",
            icon="mail",
            category="email",
            website="https://aws.amazon.com/ses/",
            documentation="https://docs.aws.amazon.com/ses/",
            auth=AuthConfig(
                method=AuthMethod.CUSTOM,
                fields=[
                    FieldDefinition(
                        name="from_email",
                        label="From Email",
                        type=FieldType.EMAIL,
                        description="Default sender email address (must be verified in SES)",
                        required=True,
                    ),
                    FieldDefinition(
                        name="region",
                        label="AWS Region",
                        type=FieldType.SELECT,
                        description="AWS region for SES",
                        required=False,
                        default="us-east-1",
                        options=[
                            {"value": "us-east-1", "label": "US East (N. Virginia)"},
                            {"value": "us-west-2", "label": "US West (Oregon)"},
                            {"value": "eu-west-1", "label": "Europe (Ireland)"},
                            {"value": "eu-central-1", "label": "Europe (Frankfurt)"},
                            {"value": "ap-southeast-1", "label": "Asia Pacific (Singapore)"},
                            {"value": "ap-southeast-2", "label": "Asia Pacific (Sydney)"},
                        ],
                    ),
                ],
                test_endpoint="verify_sender",
            ),
            actions=[
                ActionDefinition(
                    id="send_email",
                    name="Send Email",
                    description="Send an email to one or more recipients",
                    category="communication",
                    icon="mail",
                    fields=[
                        FieldDefinition(
                            name="to",
                            label="To",
                            type=FieldType.TEMPLATE,
                            description="Recipient email address (supports template variables like {{contact.email}})",
                            required=True,
                            default="{{contact.email}}",
                        ),
                        FieldDefinition(
                            name="subject",
                            label="Subject",
                            type=FieldType.TEMPLATE,
                            description="Email subject line",
                            required=True,
                        ),
                        FieldDefinition(
                            name="body_text",
                            label="Plain Text Body",
                            type=FieldType.TEXT,
                            description="Plain text email content",
                            required=False,
                        ),
                        FieldDefinition(
                            name="body_html",
                            label="HTML Body",
                            type=FieldType.TEXT,
                            description="HTML email content",
                            required=False,
                        ),
                        FieldDefinition(
                            name="from_email",
                            label="From Email",
                            type=FieldType.EMAIL,
                            description="Sender email (overrides default)",
                            required=False,
                        ),
                        FieldDefinition(
                            name="reply_to",
                            label="Reply-To",
                            type=FieldType.EMAIL,
                            description="Reply-to email address",
                            required=False,
                        ),
                        FieldDefinition(
                            name="cc",
                            label="CC",
                            type=FieldType.STRING,
                            description="CC recipients (comma-separated)",
                            required=False,
                        ),
                        FieldDefinition(
                            name="bcc",
                            label="BCC",
                            type=FieldType.STRING,
                            description="BCC recipients (comma-separated)",
                            required=False,
                        ),
                    ],
                    outputs=[
                        OutputDefinition(
                            name="message_id",
                            type="string",
                            description="SES message ID",
                        ),
                        OutputDefinition(
                            name="status",
                            type="string",
                            description="Send status",
                        ),
                    ],
                    timeout_seconds=30,
                    retryable=True,
                ),
                ActionDefinition(
                    id="send_templated_email",
                    name="Send Templated Email",
                    description="Send an email using an SES template",
                    category="communication",
                    icon="mail",
                    fields=[
                        FieldDefinition(
                            name="to",
                            label="To",
                            type=FieldType.TEMPLATE,
                            description="Recipient email address",
                            required=True,
                            default="{{contact.email}}",
                        ),
                        FieldDefinition(
                            name="template_name",
                            label="Template Name",
                            type=FieldType.STRING,
                            description="SES template name",
                            required=True,
                        ),
                        FieldDefinition(
                            name="template_data",
                            label="Template Data",
                            type=FieldType.JSON,
                            description="JSON object with template variable values",
                            required=False,
                            default={},
                        ),
                        FieldDefinition(
                            name="from_email",
                            label="From Email",
                            type=FieldType.EMAIL,
                            description="Sender email (overrides default)",
                            required=False,
                        ),
                    ],
                    outputs=[
                        OutputDefinition(
                            name="message_id",
                            type="string",
                            description="SES message ID",
                        ),
                        OutputDefinition(
                            name="status",
                            type="string",
                            description="Send status",
                        ),
                    ],
                    timeout_seconds=30,
                    retryable=True,
                ),
            ],
            triggers=[],
            capabilities=["batch", "templates", "tracking"],
        )

    async def execute_action(self, input: ActionInput) -> NodeResult:
        """Execute an email action.

        Args:
            input: Action input with config and context.

        Returns:
            NodeResult with send status.
        """
        if input.action_id == "send_email":
            return await self._send_email(input)
        elif input.action_id == "send_templated_email":
            return await self._send_templated_email(input)
        else:
            return self._build_error_result(
                error=f"Unknown action: {input.action_id}",
                retryable=False,
            )

    async def _send_email(self, input: ActionInput) -> NodeResult:
        """Send a regular email.

        Args:
            input: Action input.

        Returns:
            NodeResult with send status.
        """
        config = input.config
        context = input.context

        to_email = config.get("to", "")
        if not to_email:
            return self._build_error_result(
                error="Recipient email address is required",
                error_code="RECIPIENT_MISSING",
                retryable=False,
            )

        subject = config.get("subject", "")
        body_text = config.get("body_text", "")
        body_html = config.get("body_html", "")

        if not body_text and not body_html:
            return self._build_error_result(
                error="Email body (text or HTML) is required",
                error_code="BODY_MISSING",
                retryable=False,
            )

        # Get optional fields
        from_email = config.get("from_email")
        reply_to = config.get("reply_to")
        cc = config.get("cc")
        bcc = config.get("bcc")

        # Parse comma-separated lists
        cc_list = [e.strip() for e in cc.split(",")] if cc else None
        bcc_list = [e.strip() for e in bcc.split(",")] if bcc else None
        reply_to_list = [reply_to] if reply_to else None

        self.logger.info(
            "Sending email via SES",
            to=to_email,
            subject=subject[:50] if subject else None,
            has_html=bool(body_html),
        )

        try:
            result = self.email_service.send_email(
                to=to_email,
                subject=subject,
                body_text=body_text or None,
                body_html=body_html or None,
                from_email=from_email,
                reply_to=reply_to_list,
                cc=cc_list,
                bcc=bcc_list,
            )

            return NodeResult.completed(
                output={
                    "message_id": result["message_id"],
                    "status": result["status"],
                    "to": to_email,
                    "subject": subject,
                },
                variables={"last_email_id": result["message_id"]},
            )

        except EmailError as e:
            self.logger.error(
                "SES send failed",
                error=e.message,
                error_code=e.code,
            )
            return self._build_error_result(
                error=f"Failed to send email: {e.message}",
                error_code=e.code,
                details=e.details,
                retryable=self._is_retryable_error(e.code),
            )

    async def _send_templated_email(self, input: ActionInput) -> NodeResult:
        """Send a templated email.

        Args:
            input: Action input.

        Returns:
            NodeResult with send status.
        """
        config = input.config
        context = input.context

        to_email = config.get("to", "")
        template_name = config.get("template_name", "")
        template_data = config.get("template_data", {})
        from_email = config.get("from_email")

        if not to_email:
            return self._build_error_result(
                error="Recipient email address is required",
                error_code="RECIPIENT_MISSING",
                retryable=False,
            )

        if not template_name:
            return self._build_error_result(
                error="Template name is required",
                error_code="TEMPLATE_MISSING",
                retryable=False,
            )

        # Render template data values
        rendered_data = {}
        for key, value in template_data.items():
            if isinstance(value, str):
                rendered_data[key] = context.render_template(value)
            else:
                rendered_data[key] = value

        self.logger.info(
            "Sending templated email via SES",
            to=to_email,
            template=template_name,
        )

        try:
            result = self.email_service.send_templated_email(
                to=to_email,
                template_name=template_name,
                template_data=rendered_data,
                from_email=from_email,
            )

            return NodeResult.completed(
                output={
                    "message_id": result["message_id"],
                    "status": result["status"],
                    "to": to_email,
                    "template": template_name,
                },
                variables={"last_email_id": result["message_id"]},
            )

        except EmailError as e:
            self.logger.error(
                "SES templated send failed",
                error=e.message,
                template=template_name,
            )
            return self._build_error_result(
                error=f"Failed to send templated email: {e.message}",
                error_code=e.code,
                details=e.details,
                retryable=self._is_retryable_error(e.code),
            )

    async def test_connection(
        self,
        credentials: ProviderCredentials,
    ) -> dict[str, Any]:
        """Test SES connection by checking send quota.

        Args:
            credentials: SES credentials.

        Returns:
            Test result with quota info.
        """
        try:
            quota = self.email_service.get_send_quota()
            return {
                "success": True,
                "message": "SES connection successful",
                "quota": quota,
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"SES connection failed: {str(e)}",
            }

    def _is_retryable_error(self, error_code: str | None) -> bool:
        """Check if an error is retryable.

        Args:
            error_code: SES error code.

        Returns:
            True if error is retryable.
        """
        if not error_code:
            return True

        # Non-retryable errors
        non_retryable = {
            "MessageRejected",
            "MailFromDomainNotVerified",
            "ConfigurationSetDoesNotExist",
            "InvalidParameterValue",
            "SENDER_MISSING",
            "RECIPIENT_MISSING",
            "BODY_MISSING",
        }

        return error_code not in non_retryable


def get_provider() -> SesProvider:
    """Get an instance of the SES provider."""
    return SesProvider()
