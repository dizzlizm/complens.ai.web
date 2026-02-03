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
                error_details={"contact_id": context.contact.id if context.contact else None},
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
                error_details={"contact_id": context.contact.id if context.contact else None},
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
    """Generate and send AI response via SMS or email."""

    node_type = "action_ai_respond"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Generate AI response and send to contact.

        Args:
            context: Execution context.

        Returns:
            NodeResult with AI response and send status.
        """
        import boto3

        prompt_template = self._get_config_value("ai_prompt", "")
        prompt = context.render_template(prompt_template)

        respond_via = self._get_config_value("ai_respond_via", "same_channel")
        max_tokens = self._get_config_value("ai_max_tokens", 500)
        model = self._get_config_value(
            "ai_model", "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
        )
        system_prompt = self._get_config_value(
            "ai_system_prompt",
            "You are a helpful assistant for a business. Be concise and professional.",
        )

        if not prompt:
            return NodeResult.failed(error="AI prompt is required")

        # Determine channel from trigger if "same_channel"
        if respond_via == "same_channel":
            trigger_channel = context.trigger_data.get("channel", "email")
            respond_via = trigger_channel

        # Build context for AI - handle case where contact may be None
        if context.contact:
            contact_info = f"""Contact Information:
- Name: {context.contact.full_name}
- Email: {context.contact.email or 'N/A'}
- Phone: {context.contact.phone or 'N/A'}
- Tags: {', '.join(context.contact.tags) if context.contact.tags else 'None'}"""
        else:
            # No contact - extract from form submission data if available
            form_data = context.trigger_data.get("data", {})
            email = form_data.get("email", "N/A")
            name = form_data.get("first_name", form_data.get("name", "Unknown"))
            phone = form_data.get("phone", "N/A")
            contact_info = f"""Contact Information:
- Name: {name}
- Email: {email}
- Phone: {phone}
- Tags: None (no contact created)"""

        # Get any message being responded to
        incoming_message = context.variables.get("message_content") or context.trigger_data.get("body", "")

        full_prompt = f"""{contact_info}

Variables:
{json.dumps(context.variables, indent=2)}

{f'Message to respond to: {incoming_message}' if incoming_message else ''}

Task:
{prompt}"""

        self.logger.info(
            "Generating AI response",
            prompt_length=len(full_prompt),
            respond_via=respond_via,
            model=model,
        )

        try:
            # Invoke Bedrock
            bedrock = boto3.client("bedrock-runtime")

            body = {
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": [{"role": "user", "content": full_prompt}],
            }

            response = bedrock.invoke_model(
                modelId=model,
                body=json.dumps(body),
                contentType="application/json",
            )

            response_body = json.loads(response["body"].read())
            ai_response = response_body["content"][0]["text"]

            self.logger.info(
                "AI response generated",
                response_length=len(ai_response),
            )

        except Exception as e:
            self.logger.error("AI generation failed", error=str(e))
            return NodeResult.failed(
                error=f"AI generation failed: {str(e)}",
                error_details={"exception": type(e).__name__},
            )

        # Send the response via the appropriate channel
        send_result = None

        if respond_via == "sms":
            from complens.services.twilio_service import TwilioError, get_twilio_service

            # Get phone from contact or fall back to trigger data
            to_number = context.contact.phone if context.contact else None
            if not to_number:
                form_data = context.trigger_data.get("data", {})
                to_number = form_data.get("phone", form_data.get("Phone", form_data.get("phone_number")))
            if not to_number:
                return NodeResult.failed(
                    error="No phone number available for SMS response"
                )

            twilio = get_twilio_service()
            if twilio.is_configured:
                try:
                    result = twilio.send_sms(to=to_number, body=ai_response)
                    send_result = {
                        "channel": "sms",
                        "message_sid": result["message_sid"],
                        "status": result["status"],
                    }
                except TwilioError as e:
                    self.logger.warning("SMS send failed, returning response only", error=e.message)
                    send_result = {"channel": "sms", "status": "send_failed", "error": e.message}
            else:
                send_result = {"channel": "sms", "status": "simulated"}

        elif respond_via == "email":
            from complens.services.email_service import EmailError, get_email_service

            # Get email from contact or fall back to trigger data
            to_email = context.contact.email if context.contact else None
            if not to_email:
                form_data = context.trigger_data.get("data", {})
                to_email = form_data.get("email", form_data.get("Email", form_data.get("email_address")))
            if not to_email:
                return NodeResult.failed(
                    error="No email address available for email response"
                )

            email_service = get_email_service()
            subject = self._get_config_value("ai_email_subject", "Response from us")
            subject = context.render_template(subject)

            try:
                result = email_service.send_email(
                    to=to_email,
                    subject=subject,
                    body_text=ai_response,
                )
                send_result = {
                    "channel": "email",
                    "message_id": result["message_id"],
                    "status": result["status"],
                }
            except EmailError as e:
                self.logger.warning("Email send failed, returning response only", error=e.message)
                send_result = {"channel": "email", "status": "send_failed", "error": e.message}

        else:
            # No send - just generate (e.g., for chat/websocket or storage)
            send_result = {"channel": respond_via, "status": "generated_only"}

        return NodeResult.completed(
            output={
                "ai_response": ai_response,
                "respond_via": respond_via,
                "model": model,
                "send_result": send_result,
            },
            variables={"last_ai_response": ai_response},
        )

    def get_required_config(self) -> list[str]:
        """Get required configuration."""
        return ["ai_prompt"]


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
        # This action requires a contact to exist
        if not context.contact:
            self.logger.warning("Cannot update contact - no contact available")
            return NodeResult.completed(
                output={
                    "contact_id": None,
                    "changes": [],
                    "skipped": True,
                    "reason": "No contact available to update",
                }
            )

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
                "contact_id": context.contact.id if context.contact else None,
            }
        )

    def get_required_config(self) -> list[str]:
        """Get required configuration."""
        return ["task_title"]


# =============================================================================
# Stripe Payment Actions
# =============================================================================


class StripeCheckoutAction(BaseNode):
    """Create a Stripe Checkout session for one-time payment.

    Configuration:
        product_name: Name of the product
        amount: Amount in dollars (e.g., 49.99)
        currency: Currency code (default: usd)
        success_url: URL to redirect after successful payment
        cancel_url: URL to redirect if cancelled
        description: Optional product description
    """

    node_type = "action_stripe_checkout"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Create checkout session.

        Args:
            context: Execution context.

        Returns:
            NodeResult with checkout URL.
        """
        from complens.services.stripe_service import StripeError, create_checkout_session
        from complens.repositories.workspace import WorkspaceRepository

        # Get workspace settings for Stripe connected account
        workspace_repo = WorkspaceRepository()
        workspace = workspace_repo.get_by_id(context.workspace_id)

        if not workspace:
            return NodeResult.failed(error="Workspace not found")

        # Get connected Stripe account from workspace settings
        stripe_account_id = workspace.settings.get("stripe_account_id")
        if not stripe_account_id:
            return NodeResult.failed(
                error="Stripe not connected for this workspace",
                error_details={"workspace_id": context.workspace_id},
            )

        # Get configuration
        product_name = context.render_template(
            self._get_config_value("product_name", "Payment")
        )
        amount = float(self._get_config_value("amount", 0))
        currency = self._get_config_value("currency", "usd")
        description = context.render_template(
            self._get_config_value("description", "")
        )
        success_url = context.render_template(
            self._get_config_value("success_url", "")
        )
        cancel_url = context.render_template(
            self._get_config_value("cancel_url", "")
        )

        if amount <= 0:
            return NodeResult.failed(error="Amount must be greater than 0")

        if not success_url or not cancel_url:
            return NodeResult.failed(error="Success and cancel URLs are required")

        self.logger.info(
            "Creating Stripe checkout",
            product=product_name,
            amount=amount,
            currency=currency,
        )

        try:
            # Get customer email from contact or trigger data
            customer_email = context.contact.email if context.contact else None
            if not customer_email:
                form_data = context.trigger_data.get("data", {})
                customer_email = form_data.get("email", form_data.get("Email"))

            result = create_checkout_session(
                connected_account_id=stripe_account_id,
                workspace_id=context.workspace_id,
                price_data={
                    "product_name": product_name,
                    "amount": amount,
                    "currency": currency,
                    "description": description,
                },
                success_url=success_url,
                cancel_url=cancel_url,
                customer_email=customer_email,
                metadata={
                    "contact_id": context.contact.id if context.contact else None,
                    "workflow_run_id": context.workflow_run.id,
                },
                mode="payment",
            )

            return NodeResult.completed(
                output={
                    "checkout_url": result["url"],
                    "session_id": result["session_id"],
                    "status": result["status"],
                }
            )

        except StripeError as e:
            return NodeResult.failed(
                error=f"Stripe error: {e.message}",
                error_details={"code": e.code},
            )

    def get_required_config(self) -> list[str]:
        """Get required configuration."""
        return ["product_name", "amount", "success_url", "cancel_url"]


class StripeSubscriptionAction(BaseNode):
    """Create a Stripe Checkout session for subscription.

    Configuration:
        product_name: Name of the subscription product
        amount: Monthly amount in dollars
        currency: Currency code (default: usd)
        interval: Billing interval (month, year, week, day)
        success_url: URL to redirect after successful subscription
        cancel_url: URL to redirect if cancelled
    """

    node_type = "action_stripe_subscription"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Create subscription checkout session.

        Args:
            context: Execution context.

        Returns:
            NodeResult with checkout URL.
        """
        from complens.services.stripe_service import StripeError, create_checkout_session
        from complens.repositories.workspace import WorkspaceRepository

        # Get workspace settings for Stripe connected account
        workspace_repo = WorkspaceRepository()
        workspace = workspace_repo.get_by_id(context.workspace_id)

        if not workspace:
            return NodeResult.failed(error="Workspace not found")

        stripe_account_id = workspace.settings.get("stripe_account_id")
        if not stripe_account_id:
            return NodeResult.failed(
                error="Stripe not connected for this workspace",
            )

        # Get configuration
        product_name = context.render_template(
            self._get_config_value("product_name", "Subscription")
        )
        amount = float(self._get_config_value("amount", 0))
        currency = self._get_config_value("currency", "usd")
        interval = self._get_config_value("interval", "month")
        success_url = context.render_template(
            self._get_config_value("success_url", "")
        )
        cancel_url = context.render_template(
            self._get_config_value("cancel_url", "")
        )

        if amount <= 0:
            return NodeResult.failed(error="Amount must be greater than 0")

        if not success_url or not cancel_url:
            return NodeResult.failed(error="Success and cancel URLs are required")

        self.logger.info(
            "Creating Stripe subscription",
            product=product_name,
            amount=amount,
            interval=interval,
        )

        try:
            # Get customer email from contact or trigger data
            customer_email = context.contact.email if context.contact else None
            if not customer_email:
                form_data = context.trigger_data.get("data", {})
                customer_email = form_data.get("email", form_data.get("Email"))

            result = create_checkout_session(
                connected_account_id=stripe_account_id,
                workspace_id=context.workspace_id,
                price_data={
                    "product_name": product_name,
                    "amount": amount,
                    "currency": currency,
                    "interval": interval,
                },
                success_url=success_url,
                cancel_url=cancel_url,
                customer_email=customer_email,
                metadata={
                    "contact_id": context.contact.id if context.contact else None,
                    "workflow_run_id": context.workflow_run.id,
                },
                mode="subscription",
            )

            return NodeResult.completed(
                output={
                    "checkout_url": result["url"],
                    "session_id": result["session_id"],
                    "status": result["status"],
                }
            )

        except StripeError as e:
            return NodeResult.failed(
                error=f"Stripe error: {e.message}",
                error_details={"code": e.code},
            )

    def get_required_config(self) -> list[str]:
        """Get required configuration."""
        return ["product_name", "amount", "success_url", "cancel_url"]


class StripeCancelSubscriptionAction(BaseNode):
    """Cancel a Stripe subscription.

    Configuration:
        subscription_id: Subscription ID to cancel (template variable)
        immediately: If true, cancel immediately; otherwise at period end
    """

    node_type = "action_stripe_cancel_subscription"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Cancel subscription.

        Args:
            context: Execution context.

        Returns:
            NodeResult with cancellation details.
        """
        from complens.services.stripe_service import StripeError, cancel_subscription
        from complens.repositories.workspace import WorkspaceRepository

        # Get workspace settings
        workspace_repo = WorkspaceRepository()
        workspace = workspace_repo.get_by_id(context.workspace_id)

        if not workspace:
            return NodeResult.failed(error="Workspace not found")

        stripe_account_id = workspace.settings.get("stripe_account_id")
        if not stripe_account_id:
            return NodeResult.failed(error="Stripe not connected")

        # Get configuration
        subscription_id = context.render_template(
            self._get_config_value("subscription_id", "")
        )
        immediately = self._get_config_value("immediately", False)

        if not subscription_id:
            return NodeResult.failed(error="Subscription ID is required")

        self.logger.info(
            "Cancelling subscription",
            subscription_id=subscription_id,
            immediately=immediately,
        )

        try:
            result = cancel_subscription(
                connected_account_id=stripe_account_id,
                subscription_id=subscription_id,
                immediately=immediately,
            )

            return NodeResult.completed(
                output={
                    "subscription_id": result["id"],
                    "status": result["status"],
                    "cancel_at_period_end": result["cancel_at_period_end"],
                    "current_period_end": result["current_period_end"],
                }
            )

        except StripeError as e:
            return NodeResult.failed(
                error=f"Stripe error: {e.message}",
                error_details={"code": e.code},
            )

    def get_required_config(self) -> list[str]:
        """Get required configuration."""
        return ["subscription_id"]


# Registry of action node classes
ACTION_NODES = {
    "action_send_sms": SendSmsAction,
    "action_send_email": SendEmailAction,
    "action_ai_respond": AIRespondAction,
    "action_update_contact": UpdateContactAction,
    "action_wait": WaitAction,
    "action_webhook": WebhookAction,
    "action_create_task": CreateTaskAction,
    # Stripe payment actions
    "action_stripe_checkout": StripeCheckoutAction,
    "action_stripe_subscription": StripeSubscriptionAction,
    "action_stripe_cancel_subscription": StripeCancelSubscriptionAction,
}
