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


# Registry of trigger node classes
TRIGGER_NODES = {
    "trigger_form_submitted": FormSubmittedTrigger,
    "trigger_appointment_booked": AppointmentBookedTrigger,
    "trigger_tag_added": TagAddedTrigger,
    "trigger_sms_received": SmsReceivedTrigger,
    "trigger_email_received": EmailReceivedTrigger,
    "trigger_webhook": WebhookTrigger,
    "trigger_schedule": ScheduleTrigger,
}
