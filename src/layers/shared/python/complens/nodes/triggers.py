"""Trigger node implementations.

Triggers are the entry points for workflows. They receive external events
and start the workflow execution.
"""

from complens.nodes.base import BaseNode, NodeContext, NodeResult


class BaseTrigger(BaseNode):
    """Base class for trigger nodes.

    Triggers don't really "execute" in the traditional sense - they just
    validate the trigger data and pass it through.
    """

    async def execute(self, context: NodeContext) -> NodeResult:
        """Process trigger and prepare context for next node.

        Args:
            context: Execution context with trigger data.

        Returns:
            NodeResult with trigger data in output.
        """
        self.logger.info("Trigger activated", trigger_data=context.trigger_data)

        # Validate trigger data
        validation_errors = self.validate_trigger_data(context.trigger_data)
        if validation_errors:
            return NodeResult.failed(
                error="Invalid trigger data",
                error_details={"errors": validation_errors},
            )

        # Extract relevant data from trigger
        output = self.extract_trigger_output(context.trigger_data)

        return NodeResult.completed(output=output)

    def validate_trigger_data(self, data: dict) -> list[str]:
        """Validate the incoming trigger data.

        Args:
            data: Trigger data to validate.

        Returns:
            List of validation errors.
        """
        return []

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract relevant data from trigger to pass to next nodes.

        Args:
            data: Raw trigger data.

        Returns:
            Processed output data.
        """
        return data


class FormSubmittedTrigger(BaseTrigger):
    """Trigger when a form is submitted."""

    node_type = "trigger_form_submitted"

    def validate_trigger_data(self, data: dict) -> list[str]:
        """Validate form submission data."""
        errors = []
        if not data.get("form_id"):
            errors.append("form_id is required")
        return errors

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract form submission data."""
        return {
            "form_id": data.get("form_id"),
            "form_name": data.get("form_name"),
            "submission_id": data.get("submission_id"),
            "fields": data.get("fields", {}),
            "submitted_at": data.get("submitted_at"),
        }


class AppointmentBookedTrigger(BaseTrigger):
    """Trigger when an appointment is booked."""

    node_type = "trigger_appointment_booked"

    def validate_trigger_data(self, data: dict) -> list[str]:
        """Validate appointment data."""
        errors = []
        if not data.get("appointment_id"):
            errors.append("appointment_id is required")
        if not data.get("start_time"):
            errors.append("start_time is required")
        return errors

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract appointment data."""
        return {
            "appointment_id": data.get("appointment_id"),
            "calendar_id": data.get("calendar_id"),
            "start_time": data.get("start_time"),
            "end_time": data.get("end_time"),
            "title": data.get("title"),
            "location": data.get("location"),
            "notes": data.get("notes"),
        }


class TagAddedTrigger(BaseTrigger):
    """Trigger when a tag is added to a contact."""

    node_type = "trigger_tag_added"

    def validate_trigger_data(self, data: dict) -> list[str]:
        """Validate tag data."""
        errors = []
        if not data.get("tag"):
            errors.append("tag is required")
        return errors

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract tag data."""
        return {
            "tag": data.get("tag"),
            "operation": data.get("operation", "added"),  # added, removed
            "previous_tags": data.get("previous_tags", []),
            "current_tags": data.get("current_tags", []),
        }


class SmsReceivedTrigger(BaseTrigger):
    """Trigger when an SMS is received."""

    node_type = "trigger_sms_received"

    def validate_trigger_data(self, data: dict) -> list[str]:
        """Validate SMS data."""
        errors = []
        if not data.get("from_number"):
            errors.append("from_number is required")
        if not data.get("body"):
            errors.append("body is required")
        return errors

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract SMS data."""
        return {
            "from_number": data.get("from_number"),
            "to_number": data.get("to_number"),
            "body": data.get("body"),
            "message_sid": data.get("message_sid"),
            "received_at": data.get("received_at"),
        }


class EmailReceivedTrigger(BaseTrigger):
    """Trigger when an email is received."""

    node_type = "trigger_email_received"

    def validate_trigger_data(self, data: dict) -> list[str]:
        """Validate email data."""
        errors = []
        if not data.get("from_email"):
            errors.append("from_email is required")
        return errors

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract email data."""
        return {
            "from_email": data.get("from_email"),
            "to_email": data.get("to_email"),
            "subject": data.get("subject"),
            "body_text": data.get("body_text"),
            "body_html": data.get("body_html"),
            "received_at": data.get("received_at"),
        }


class WebhookTrigger(BaseTrigger):
    """Trigger from external webhook."""

    node_type = "trigger_webhook"

    def extract_trigger_output(self, data: dict) -> dict:
        """Pass through webhook data."""
        return {
            "webhook_path": data.get("webhook_path"),
            "method": data.get("method", "POST"),
            "headers": data.get("headers", {}),
            "body": data.get("body", {}),
            "query_params": data.get("query_params", {}),
        }


class ScheduleTrigger(BaseTrigger):
    """Trigger on a schedule (cron-based)."""

    node_type = "trigger_schedule"

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract schedule trigger data."""
        return {
            "scheduled_time": data.get("scheduled_time"),
            "cron_expression": data.get("cron_expression"),
            "execution_id": data.get("execution_id"),
        }


class ChatStartedTrigger(BaseTrigger):
    """Trigger when a visitor starts a chat on a landing page."""

    node_type = "trigger_chat_started"

    def validate_trigger_data(self, data: dict) -> list[str]:
        """Validate chat start data."""
        errors = []
        if not data.get("page_id"):
            errors.append("page_id is required")
        if not data.get("visitor_id"):
            errors.append("visitor_id is required")
        return errors

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract chat start data."""
        return {
            "page_id": data.get("page_id"),
            "page_name": data.get("page_name"),
            "visitor_id": data.get("visitor_id"),
            "started_at": data.get("started_at"),
            "referrer": data.get("referrer"),
            "user_agent": data.get("user_agent"),
        }


class ChatMessageTrigger(BaseTrigger):
    """Trigger when a visitor sends a chat message.

    Can filter by keyword or intent.
    """

    node_type = "trigger_chat_message"

    def validate_trigger_data(self, data: dict) -> list[str]:
        """Validate chat message data."""
        errors = []
        if not data.get("message"):
            errors.append("message is required")
        return errors

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract chat message data."""
        return {
            "page_id": data.get("page_id"),
            "visitor_id": data.get("visitor_id"),
            "message": data.get("message"),
            "message_content": data.get("message"),  # Alias for consistency
            "sent_at": data.get("sent_at"),
            "channel": "chat",
        }

    async def execute(self, context: NodeContext) -> NodeResult:
        """Check if message matches configured keyword filter.

        Args:
            context: Execution context with trigger data.

        Returns:
            NodeResult - completed if matches, skipped otherwise.
        """
        # Get configured keyword filter
        keyword_filter = self._get_config_value("chat_keyword")
        message = context.trigger_data.get("message", "")

        self.logger.info(
            "Chat message trigger checking",
            keyword_filter=keyword_filter,
            message_preview=message[:50] if message else "",
        )

        # If no filter configured, match all messages
        if not keyword_filter:
            return await super().execute(context)

        # Check if message contains keyword (case-insensitive)
        if keyword_filter.lower() in message.lower():
            return await super().execute(context)
        else:
            return NodeResult.completed(
                output={"skipped": True, "reason": "keyword not found in message"},
            )


class PageVisitTrigger(BaseTrigger):
    """Trigger when a visitor lands on a page."""

    node_type = "trigger_page_visit"

    def validate_trigger_data(self, data: dict) -> list[str]:
        """Validate page visit data."""
        errors = []
        if not data.get("page_id"):
            errors.append("page_id is required")
        return errors

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract page visit data."""
        return {
            "page_id": data.get("page_id"),
            "page_name": data.get("page_name"),
            "page_slug": data.get("page_slug"),
            "visitor_id": data.get("visitor_id"),
            "referrer": data.get("referrer"),
            "utm_source": data.get("utm_source"),
            "utm_medium": data.get("utm_medium"),
            "utm_campaign": data.get("utm_campaign"),
            "visited_at": data.get("visited_at"),
        }


class SegmentEventTrigger(BaseTrigger):
    """Trigger on Segment track events.

    Fires when a Segment track event matching the configured event name is received.
    """

    node_type = "trigger_segment_event"

    def validate_trigger_data(self, data: dict) -> list[str]:
        """Validate Segment event data."""
        errors = []
        if not data.get("event"):
            errors.append("event name is required")
        return errors

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract Segment event data."""
        return {
            "event": data.get("event"),
            "properties": data.get("properties", {}),
            "user_id": data.get("user_id"),
            "anonymous_id": data.get("anonymous_id"),
            "timestamp": data.get("timestamp"),
            "message_id": data.get("message_id"),
        }

    async def execute(self, context: NodeContext) -> NodeResult:
        """Check if event matches configured event name.

        Args:
            context: Execution context with trigger data.

        Returns:
            NodeResult - completed if event matches, skipped otherwise.
        """
        # Get configured event name to match
        event_filter = self._get_config_value("segment_event_name")
        trigger_event = context.trigger_data.get("event")

        self.logger.info(
            "Segment trigger checking event",
            configured_event=event_filter,
            received_event=trigger_event,
        )

        # If no filter configured, match all events
        if not event_filter:
            return await super().execute(context)

        # Check if event matches (supports wildcards with *)
        if self._event_matches(trigger_event, event_filter):
            return await super().execute(context)
        else:
            return NodeResult.completed(
                output={"skipped": True, "reason": "event name did not match"},
            )

    def _event_matches(self, event: str, pattern: str) -> bool:
        """Check if event name matches pattern.

        Args:
            event: Actual event name.
            pattern: Pattern to match (supports * wildcard).

        Returns:
            True if matches.
        """
        if not event or not pattern:
            return False

        # Exact match
        if pattern == event:
            return True

        # Wildcard matching
        if "*" in pattern:
            import fnmatch
            return fnmatch.fnmatch(event.lower(), pattern.lower())

        # Case-insensitive match
        return event.lower() == pattern.lower()


# =============================================================================
# Stripe Payment Triggers
# =============================================================================


class PaymentReceivedTrigger(BaseTrigger):
    """Trigger when a payment is received via Stripe.

    Fires on checkout.session.completed and payment_intent.succeeded events.
    """

    node_type = "trigger_payment_received"

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract payment data."""
        return {
            "event_type": data.get("event_type"),
            "payment_intent_id": data.get("payment_intent_id"),
            "session_id": data.get("session_id"),
            "amount": data.get("amount"),
            "currency": data.get("currency"),
            "customer_email": data.get("customer_email"),
            "customer_id": data.get("customer_id"),
            "payment_status": data.get("payment_status"),
            "mode": data.get("mode"),  # payment or subscription
            "metadata": data.get("metadata", {}),
        }


class PaymentFailedTrigger(BaseTrigger):
    """Trigger when a payment fails.

    Fires on payment_intent.payment_failed and invoice.payment_failed events.
    """

    node_type = "trigger_payment_failed"

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract payment failure data."""
        return {
            "event_type": data.get("event_type"),
            "payment_intent_id": data.get("payment_intent_id"),
            "invoice_id": data.get("invoice_id"),
            "amount": data.get("amount"),
            "currency": data.get("currency"),
            "customer_email": data.get("customer_email"),
            "customer_id": data.get("customer_id"),
            "error_message": data.get("error_message"),
            "metadata": data.get("metadata", {}),
        }


class SubscriptionCreatedTrigger(BaseTrigger):
    """Trigger when a new subscription is created."""

    node_type = "trigger_subscription_created"

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract subscription data."""
        return {
            "subscription_id": data.get("subscription_id"),
            "status": data.get("status"),
            "customer_email": data.get("customer_email"),
            "customer_id": data.get("customer_id"),
            "amount": data.get("amount"),
            "currency": data.get("currency"),
            "current_period_end": data.get("current_period_end"),
            "metadata": data.get("metadata", {}),
        }


class SubscriptionCancelledTrigger(BaseTrigger):
    """Trigger when a subscription is cancelled.

    Fires on both cancel_at_period_end=True and actual deletion.
    """

    node_type = "trigger_subscription_cancelled"

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract cancellation data."""
        return {
            "subscription_id": data.get("subscription_id"),
            "status": data.get("status"),
            "customer_email": data.get("customer_email"),
            "customer_id": data.get("customer_id"),
            "cancel_at_period_end": data.get("cancel_at_period_end"),
            "current_period_end": data.get("current_period_end"),
            "cancelled_at": data.get("cancelled_at"),
            "metadata": data.get("metadata", {}),
        }


class InvoicePaidTrigger(BaseTrigger):
    """Trigger when an invoice is paid (recurring subscription payment)."""

    node_type = "trigger_invoice_paid"

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract invoice data."""
        return {
            "invoice_id": data.get("invoice_id"),
            "subscription_id": data.get("subscription_id"),
            "amount_paid": data.get("amount_paid"),
            "currency": data.get("currency"),
            "customer_email": data.get("customer_email"),
            "customer_id": data.get("customer_id"),
            "metadata": data.get("metadata", {}),
        }


class PaymentRefundedTrigger(BaseTrigger):
    """Trigger when a payment is refunded."""

    node_type = "trigger_payment_refunded"

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract refund data."""
        return {
            "charge_id": data.get("charge_id"),
            "amount_refunded": data.get("amount_refunded"),
            "currency": data.get("currency"),
            "customer_email": data.get("customer_email"),
            "customer_id": data.get("customer_id"),
            "reason": data.get("reason"),
            "metadata": data.get("metadata", {}),
        }


# =============================================================================
# Partner Triggers
# =============================================================================


class PartnerAddedTrigger(BaseTrigger):
    """Trigger when a new partner is added."""

    node_type = "trigger_partner_added"

    def validate_trigger_data(self, data: dict) -> list[str]:
        """Validate partner data."""
        errors = []
        if not data.get("partner_id"):
            errors.append("partner_id is required")
        return errors

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract partner creation data."""
        return {
            "partner_id": data.get("partner_id"),
            "title": data.get("title"),
            "value": data.get("value"),
            "commission_pct": data.get("commission_pct"),
            "partner_type": data.get("partner_type"),
            "stage": data.get("stage"),
            "priority": data.get("priority"),
            "contact_id": data.get("contact_id"),
            "contact_name": data.get("contact_name"),
            "introduced_by": data.get("introduced_by"),
            "introduced_by_name": data.get("introduced_by_name"),
        }

    async def execute(self, context: NodeContext) -> NodeResult:
        """Check optional stage filter.

        Args:
            context: Execution context with trigger data.

        Returns:
            NodeResult - completed if matches, skipped otherwise.
        """
        stage_filter = self._get_config_value("stage_filter")

        if not stage_filter:
            return await super().execute(context)

        partner_stage = context.trigger_data.get("stage", "")
        if partner_stage == stage_filter:
            return await super().execute(context)

        return NodeResult.completed(
            output={"skipped": True, "reason": f"Stage '{partner_stage}' does not match filter '{stage_filter}'"},
        )


class PartnerStageChangedTrigger(BaseTrigger):
    """Trigger when a partner's stage changes.

    Can filter by from_stage and/or to_stage.
    """

    node_type = "trigger_partner_stage_changed"

    def validate_trigger_data(self, data: dict) -> list[str]:
        """Validate partner stage change data."""
        errors = []
        if not data.get("partner_id"):
            errors.append("partner_id is required")
        return errors

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract partner stage change data."""
        return {
            "partner_id": data.get("partner_id"),
            "title": data.get("title"),
            "value": data.get("value"),
            "commission_pct": data.get("commission_pct"),
            "from_stage": data.get("from_stage"),
            "to_stage": data.get("to_stage"),
            "stage": data.get("to_stage"),
            "priority": data.get("priority"),
            "contact_id": data.get("contact_id"),
            "contact_name": data.get("contact_name"),
        }

    async def execute(self, context: NodeContext) -> NodeResult:
        """Check from_stage/to_stage filters.

        Args:
            context: Execution context with trigger data.

        Returns:
            NodeResult - completed if matches, skipped otherwise.
        """
        from_filter = self._get_config_value("from_stage")
        to_filter = self._get_config_value("to_stage")

        from_stage = context.trigger_data.get("from_stage", "")
        to_stage = context.trigger_data.get("to_stage", "")

        if from_filter and from_stage != from_filter:
            return NodeResult.completed(
                output={"skipped": True, "reason": f"from_stage '{from_stage}' does not match filter '{from_filter}'"},
            )

        if to_filter and to_stage != to_filter:
            return NodeResult.completed(
                output={"skipped": True, "reason": f"to_stage '{to_stage}' does not match filter '{to_filter}'"},
            )

        return await super().execute(context)


class PartnerActivatedTrigger(BaseTrigger):
    """Trigger when a partner becomes active."""

    node_type = "trigger_partner_activated"

    def validate_trigger_data(self, data: dict) -> list[str]:
        """Validate partner activation data."""
        errors = []
        if not data.get("partner_id"):
            errors.append("partner_id is required")
        return errors

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract partner activation data."""
        return {
            "partner_id": data.get("partner_id"),
            "title": data.get("title"),
            "value": data.get("value"),
            "commission_pct": data.get("commission_pct"),
            "partner_type": data.get("partner_type"),
            "stage": data.get("stage", "Active"),
            "priority": data.get("priority"),
            "contact_id": data.get("contact_id"),
            "contact_name": data.get("contact_name"),
        }


class PartnerDeactivatedTrigger(BaseTrigger):
    """Trigger when a partner becomes inactive."""

    node_type = "trigger_partner_deactivated"

    def validate_trigger_data(self, data: dict) -> list[str]:
        """Validate partner deactivation data."""
        errors = []
        if not data.get("partner_id"):
            errors.append("partner_id is required")
        return errors

    def extract_trigger_output(self, data: dict) -> dict:
        """Extract partner deactivation data including reason."""
        return {
            "partner_id": data.get("partner_id"),
            "title": data.get("title"),
            "value": data.get("value"),
            "commission_pct": data.get("commission_pct"),
            "partner_type": data.get("partner_type"),
            "stage": data.get("stage", "Inactive"),
            "priority": data.get("priority"),
            "contact_id": data.get("contact_id"),
            "contact_name": data.get("contact_name"),
            "inactive_reason": data.get("inactive_reason", ""),
        }


# Registry of trigger node classes
TRIGGER_NODES = {
    # Lead generation triggers
    "trigger_form_submitted": FormSubmittedTrigger,
    "trigger_chat_started": ChatStartedTrigger,
    "trigger_chat_message": ChatMessageTrigger,
    "trigger_page_visit": PageVisitTrigger,
    # Contact triggers
    "trigger_tag_added": TagAddedTrigger,
    "trigger_appointment_booked": AppointmentBookedTrigger,
    # Communication triggers
    "trigger_sms_received": SmsReceivedTrigger,
    "trigger_email_received": EmailReceivedTrigger,
    # Integration triggers
    "trigger_webhook": WebhookTrigger,
    "trigger_schedule": ScheduleTrigger,
    "trigger_segment_event": SegmentEventTrigger,
    # Payment triggers (Stripe)
    "trigger_payment_received": PaymentReceivedTrigger,
    "trigger_payment_failed": PaymentFailedTrigger,
    "trigger_subscription_created": SubscriptionCreatedTrigger,
    "trigger_subscription_cancelled": SubscriptionCancelledTrigger,
    "trigger_invoice_paid": InvoicePaidTrigger,
    "trigger_payment_refunded": PaymentRefundedTrigger,
    # Partner triggers
    "trigger_partner_added": PartnerAddedTrigger,
    "trigger_partner_stage_changed": PartnerStageChangedTrigger,
    "trigger_partner_activated": PartnerActivatedTrigger,
    "trigger_partner_deactivated": PartnerDeactivatedTrigger,
}
