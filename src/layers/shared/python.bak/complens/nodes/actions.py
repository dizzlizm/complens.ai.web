"""Action node implementations.

Actions perform operations like sending messages, updating data,
calling APIs, etc.
"""

import json
from datetime import datetime, timedelta, timezone

import httpx
import structlog

from complens.nodes.base import BaseNode, NodeContext, NodeResult

logger = structlog.get_logger()


class SendSmsAction(BaseNode):
    """Send an SMS message."""

    node_type = "action_send_sms"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Send SMS to contact.

        Args:
            context: Execution context.

        Returns:
            NodeResult with send status.
        """
        from complens.services.twilio_service import TwilioError, get_twilio_service

        # Get message template and render
        message_template = self._get_config_value("sms_message", "")
        message = context.render_template(message_template)

        # Get recipient (default to contact phone)
        to_template = self._get_config_value("sms_to", "{{contact.phone}}")
        to_number = context.render_template(to_template)

        if not to_number:
            return NodeResult.failed(
                error="No phone number available",
                error_details={"contact_id": context.contact.id},
            )

        if not message:
            return NodeResult.failed(error="Message content is empty")

        # Get from number from config or workspace settings
        from_number = self._get_config_value("sms_from")
        if not from_number and hasattr(context, "workspace"):
            from_number = getattr(context.workspace, "twilio_phone_number", None)

        self.logger.info(
            "Sending SMS",
            to=to_number,
            message_length=len(message),
        )

        # Get Twilio service
        twilio = get_twilio_service()

        # Check if Twilio is configured
        if not twilio.is_configured:
            self.logger.warning("Twilio not configured, simulating send")
            return NodeResult.completed(
                output={
                    "message_sid": f"SM_SIMULATED_{context.workflow_run.id[:24]}",
                    "to": to_number,
                    "body": message,
                    "status": "simulated",
                    "simulated": True,
                }
            )

        try:
            result = twilio.send_sms(
                to=to_number,
                body=message,
                from_number=from_number,
            )

            return NodeResult.completed(
                output={
                    "message_sid": result["message_sid"],
                    "to": result["to"],
                    "body": message,
                    "status": result["status"],
                    "from": result.get("from"),
                },
                variables={"last_sms_sid": result["message_sid"]},
            )

        except TwilioError as e:
            self.logger.error(
                "SMS send failed",
                error=e.message,
                error_code=e.code,
            )
            return NodeResult.failed(
                error=f"Failed to send SMS: {e.message}",
                error_details={
                    "error_code": e.code,
                    "to": to_number,
                },
            )

    def get_required_config(self) -> list[str]:
        """Get required configuration."""
        return ["sms_message"]


class SendEmailAction(BaseNode):
    """Send an email."""

    node_type = "action_send_email"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Send email to contact.

        Args:
            context: Execution context.

        Returns:
            NodeResult with send status.
        """
        from complens.services.email_service import EmailError, get_email_service

        # Get recipient
        to_template = self._get_config_value("email_to", "{{contact.email}}")
        to_email = context.render_template(to_template)

        if not to_email:
            return NodeResult.failed(
                error="No email address available",
                error_details={"contact_id": context.contact.id},
            )

        # Get subject and body
        subject_template = self._get_config_value("email_subject", "")
        subject = context.render_template(subject_template)

        body_template = self._get_config_value("email_body", "")
        body_text = context.render_template(body_template)

        # Support HTML body
        html_template = self._get_config_value("email_body_html", "")
        body_html = context.render_template(html_template) if html_template else None

        # Support SES templates
        template_name = self._get_config_value("email_template_name")
        template_data = self._get_config_value("email_template_data", {})

        # Get from email from config
        from_email = self._get_config_value("email_from")

        if not body_text and not body_html and not template_name:
            return NodeResult.failed(error="Email body or template is required")

        self.logger.info(
            "Sending email",
            to=to_email,
            subject=subject,
            has_html=bool(body_html),
            use_template=bool(template_name),
        )

        # Get email service
        email_service = get_email_service()

        try:
            if template_name:
                # Use SES template
                # Render template data values
                rendered_data = {}
                for key, value in template_data.items():
                    if isinstance(value, str):
                        rendered_data[key] = context.render_template(value)
                    else:
                        rendered_data[key] = value

                result = email_service.send_templated_email(
                    to=to_email,
                    template_name=template_name,
                    template_data=rendered_data,
                    from_email=from_email,
                )
            else:
                # Send regular email
                result = email_service.send_email(
                    to=to_email,
                    subject=subject,
                    body_text=body_text,
                    body_html=body_html,
                    from_email=from_email,
                )

            return NodeResult.completed(
                output={
                    "message_id": result["message_id"],
                    "to": to_email,
                    "subject": subject,
                    "status": result["status"],
                },
                variables={"last_email_id": result["message_id"]},
            )

        except EmailError as e:
            self.logger.error(
                "Email send failed",
                error=e.message,
                error_code=e.code,
            )
            return NodeResult.failed(
                error=f"Failed to send email: {e.message}",
                error_details={
                    "error_code": e.code,
                    "to": to_email,
                },
            )

    def get_required_config(self) -> list[str]:
        """Get required configuration."""
        return ["email_subject"]


class AIRespondAction(BaseNode):
    """Generate and send AI response."""

    node_type = "action_ai_respond"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Generate AI response and send to contact.

        Args:
            context: Execution context.

        Returns:
            NodeResult with AI response.
        """
        prompt_template = self._get_config_value("ai_prompt", "")
        prompt = context.render_template(prompt_template)

        respond_via = self._get_config_value("ai_respond_via", "same_channel")
        max_tokens = self._get_config_value("ai_max_tokens", 500)

        self.logger.info(
            "Generating AI response",
            prompt_length=len(prompt),
            respond_via=respond_via,
        )

        # TODO: Integrate with Bedrock
        # For now, return placeholder
        ai_response = f"[AI Response to: {prompt[:50]}...]"

        return NodeResult.completed(
            output={
                "ai_response": ai_response,
                "respond_via": respond_via,
                "model": "claude-3-sonnet",
            },
            variables={"last_ai_response": ai_response},
        )


class UpdateContactAction(BaseNode):
    """Update contact fields or tags."""

    node_type = "action_update_contact"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Update contact with specified changes.

        Args:
            context: Execution context.

        Returns:
            NodeResult with update status.
        """
        update_fields = self._get_config_value("update_fields", {})
        add_tags = self._get_config_value("add_tags", [])
        remove_tags = self._get_config_value("remove_tags", [])

        changes_made = []

        # Update custom fields
        for field_name, value_template in update_fields.items():
            value = context.render_template(str(value_template))
            if field_name in ["first_name", "last_name", "email", "phone"]:
                setattr(context.contact, field_name, value)
                changes_made.append(f"{field_name}={value}")
            else:
                context.contact.custom_fields[field_name] = value
                changes_made.append(f"custom.{field_name}={value}")

        # Add tags
        for tag in add_tags:
            tag = context.render_template(tag)
            context.contact.add_tag(tag)
            changes_made.append(f"+tag:{tag}")

        # Remove tags
        for tag in remove_tags:
            tag = context.render_template(tag)
            context.contact.remove_tag(tag)
            changes_made.append(f"-tag:{tag}")

        self.logger.info(
            "Contact updated",
            contact_id=context.contact.id,
            changes=changes_made,
        )

        # TODO: Save contact changes to database

        return NodeResult.completed(
            output={
                "contact_id": context.contact.id,
                "changes": changes_made,
            }
        )


class WaitAction(BaseNode):
    """Wait for a specified duration."""

    node_type = "action_wait"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Create a wait state.

        Args:
            context: Execution context.

        Returns:
            NodeResult with waiting status.
        """
        wait_duration = self._get_config_value("wait_duration")
        wait_until = self._get_config_value("wait_until")

        if wait_duration:
            # Duration in seconds
            self.logger.info("Waiting for duration", seconds=wait_duration)
            return NodeResult.waiting(
                wait_seconds=int(wait_duration),
                variables=context.variables,
            )
        elif wait_until:
            # Wait until specific time
            target_time = datetime.fromisoformat(wait_until.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            wait_seconds = int((target_time - now).total_seconds())

            if wait_seconds <= 0:
                # Already past the time
                return NodeResult.completed(
                    output={"waited_until": wait_until, "already_passed": True}
                )

            self.logger.info("Waiting until", target=wait_until, seconds=wait_seconds)
            return NodeResult.waiting(
                wait_seconds=wait_seconds,
                wait_until=target_time,
                variables=context.variables,
            )
        else:
            return NodeResult.failed(error="No wait duration or target time specified")

    def get_required_config(self) -> list[str]:
        """Either wait_duration or wait_until is required."""
        return []

    def validate_config(self) -> list[str]:
        """Validate wait configuration."""
        if not self._get_config_value("wait_duration") and not self._get_config_value("wait_until"):
            return ["Either wait_duration or wait_until is required"]
        return []


class WebhookAction(BaseNode):
    """Call an external webhook/API."""

    node_type = "action_webhook"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Call external webhook.

        Args:
            context: Execution context.

        Returns:
            NodeResult with webhook response.
        """
        url_template = self._get_config_value("webhook_url", "")
        url = context.render_template(url_template)

        if not url:
            return NodeResult.failed(error="Webhook URL is required")

        method = self._get_config_value("webhook_method", "POST").upper()
        headers = self._get_config_value("webhook_headers", {})
        body_template = self._get_config_value("webhook_body", {})

        # Render body templates
        body = {}
        for key, value in body_template.items():
            if isinstance(value, str):
                body[key] = context.render_template(value)
            else:
                body[key] = value

        self.logger.info(
            "Calling webhook",
            url=url,
            method=method,
        )

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    json=body if method in ["POST", "PUT", "PATCH"] else None,
                    params=body if method == "GET" else None,
                )

                # Try to parse response as JSON
                try:
                    response_data = response.json()
                except Exception:
                    response_data = {"text": response.text}

                if response.is_success:
                    return NodeResult.completed(
                        output={
                            "status_code": response.status_code,
                            "response": response_data,
                        },
                        variables={"webhook_response": response_data},
                    )
                else:
                    return NodeResult.failed(
                        error=f"Webhook returned {response.status_code}",
                        error_details={
                            "status_code": response.status_code,
                            "response": response_data,
                        },
                    )

        except httpx.TimeoutException:
            return NodeResult.failed(error="Webhook request timed out")
        except Exception as e:
            return NodeResult.failed(
                error=f"Webhook request failed: {str(e)}",
                error_details={"exception": type(e).__name__},
            )

    def get_required_config(self) -> list[str]:
        """Get required configuration."""
        return ["webhook_url"]


class CreateTaskAction(BaseNode):
    """Create an internal task."""

    node_type = "action_create_task"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Create a task.

        Args:
            context: Execution context.

        Returns:
            NodeResult with task details.
        """
        title_template = self._get_config_value("task_title", "")
        title = context.render_template(title_template)

        if not title:
            return NodeResult.failed(error="Task title is required")

        description_template = self._get_config_value("task_description", "")
        description = context.render_template(description_template)

        assigned_to = self._get_config_value("task_assigned_to")
        due_in_hours = self._get_config_value("task_due_in_hours")

        due_date = None
        if due_in_hours:
            due_date = datetime.now(timezone.utc) + timedelta(hours=int(due_in_hours))

        self.logger.info(
            "Creating task",
            title=title,
            assigned_to=assigned_to,
        )

        # TODO: Save task to database
        task_id = f"task-{context.workflow_run.id[:16]}"

        return NodeResult.completed(
            output={
                "task_id": task_id,
                "title": title,
                "description": description,
                "assigned_to": assigned_to,
                "due_date": due_date.isoformat() if due_date else None,
                "contact_id": context.contact.id,
            }
        )

    def get_required_config(self) -> list[str]:
        """Get required configuration."""
        return ["task_title"]


# Registry of action node classes
ACTION_NODES = {
    "action_send_sms": SendSmsAction,
    "action_send_email": SendEmailAction,
    "action_ai_respond": AIRespondAction,
    "action_update_contact": UpdateContactAction,
    "action_wait": WaitAction,
    "action_webhook": WebhookAction,
    "action_create_task": CreateTaskAction,
}
