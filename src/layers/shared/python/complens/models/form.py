"""Form model for lead capture forms."""

from enum import Enum
from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.base import BaseModel


class FormFieldType(str, Enum):
    """Form field types."""

    TEXT = "text"
    EMAIL = "email"
    PHONE = "phone"
    TEXTAREA = "textarea"
    SELECT = "select"
    CHECKBOX = "checkbox"
    RADIO = "radio"
    DATE = "date"
    NUMBER = "number"
    HIDDEN = "hidden"


class FormField(PydanticBaseModel):
    """A single field in a form."""

    id: str = Field(..., description="Unique field ID")
    name: str = Field(..., description="Field name for submission data")
    label: str = Field(..., description="Display label")
    type: FormFieldType = Field(default=FormFieldType.TEXT, description="Field type")
    required: bool = Field(default=False, description="Whether field is required")
    placeholder: str | None = Field(None, description="Placeholder text")
    options: list[str] = Field(
        default_factory=list, description="Options for select/radio/checkbox"
    )
    validation_pattern: str | None = Field(None, description="Regex validation pattern")
    default_value: str | None = Field(None, description="Default value")
    map_to_contact_field: str | None = Field(
        None,
        description="Map to contact field (email, phone, first_name, last_name, etc.)",
    )


class Form(BaseModel):
    """Form entity - represents a lead capture form.

    Forms always belong to a page (page_id is required).

    Key Pattern:
        PK: WS#{workspace_id}
        SK: FORM#{id}
        GSI1PK: PAGE#{page_id}#FORMS
        GSI1SK: {name}
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "FORM#"

    workspace_id: str = Field(..., description="Parent workspace ID")
    page_id: str = Field(..., description="Parent page ID (required)")

    # Form metadata
    name: str = Field(..., min_length=1, max_length=255, description="Form name")
    description: str | None = Field(None, max_length=500, description="Form description")

    # Form fields
    fields: list[FormField] = Field(default_factory=list, description="Form fields")

    # Submit behavior
    submit_button_text: str = Field(default="Submit", max_length=50)
    success_message: str = Field(
        default="Thank you for your submission!",
        max_length=500,
        description="Message shown after successful submission",
    )
    redirect_url: str | None = Field(
        None, description="URL to redirect after submission"
    )

    # Contact creation settings
    create_contact: bool = Field(
        default=True, description="Create or update contact on submission"
    )
    add_tags: list[str] = Field(
        default_factory=list, description="Tags to add to created contact"
    )

    # Workflow trigger
    trigger_workflow: bool = Field(
        default=True, description="Trigger workflow on submission"
    )

    # Spam protection
    honeypot_enabled: bool = Field(default=True, description="Enable honeypot field")
    recaptcha_enabled: bool = Field(default=False, description="Enable reCAPTCHA")

    # Analytics
    submission_count: int = Field(default=0, description="Total submissions")

    def get_pk(self) -> str:
        """Get partition key: WS#{workspace_id}."""
        return f"WS#{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key: FORM#{id}."""
        return f"FORM#{self.id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for listing forms by page."""
        return {
            "GSI1PK": f"PAGE#{self.page_id}#FORMS",
            "GSI1SK": self.name,
        }

    def get_email_field(self) -> FormField | None:
        """Get the field mapped to contact email."""
        for field in self.fields:
            if field.map_to_contact_field == "email" or field.type == FormFieldType.EMAIL:
                return field
        return None

    def get_phone_field(self) -> FormField | None:
        """Get the field mapped to contact phone."""
        for field in self.fields:
            if field.map_to_contact_field == "phone" or field.type == FormFieldType.PHONE:
                return field
        return None


class FormSubmission(BaseModel):
    """Form submission record.

    Key Pattern:
        PK: FORM#{form_id}
        SK: SUB#{created_at}#{id}
        GSI1PK: WS#{workspace_id}
        GSI1SK: SUB#{created_at}
    """

    _pk_prefix: ClassVar[str] = "FORM#"
    _sk_prefix: ClassVar[str] = "SUB#"

    workspace_id: str = Field(..., description="Workspace ID")
    form_id: str = Field(..., description="Form ID")
    page_id: str | None = Field(None, description="Page ID if submitted from a page")
    contact_id: str | None = Field(None, description="Created/matched contact ID")

    # Submission data
    data: dict = Field(default_factory=dict, description="Field name -> value")

    # Visitor info
    visitor_ip: str | None = Field(None, description="Visitor IP address")
    visitor_user_agent: str | None = Field(None, description="User agent string")
    referrer: str | None = Field(None, description="Referrer URL")

    # Processing status
    workflow_triggered: bool = Field(default=False)
    workflow_run_id: str | None = Field(None)

    def get_pk(self) -> str:
        """Get partition key: FORM#{form_id}."""
        return f"FORM#{self.form_id}"

    def get_sk(self) -> str:
        """Get sort key: SUB#{created_at}#{id}."""
        return f"SUB#{self.created_at.isoformat()}#{self.id}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for listing submissions by workspace."""
        return {
            "GSI1PK": f"WS#{self.workspace_id}",
            "GSI1SK": f"SUB#{self.created_at.isoformat()}",
        }


class CreateFormRequest(PydanticBaseModel):
    """Request model for creating a form."""

    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=500)
    fields: list[FormField] = Field(default_factory=list)
    submit_button_text: str = "Submit"
    success_message: str = "Thank you for your submission!"
    redirect_url: str | None = None
    create_contact: bool = True
    add_tags: list[str] = Field(default_factory=list)
    trigger_workflow: bool = True
    honeypot_enabled: bool = True
    # page_id is set from path parameter in nested endpoints, not from request body


class UpdateFormRequest(PydanticBaseModel):
    """Request model for updating a form."""

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=500)
    fields: list[FormField] | None = None
    submit_button_text: str | None = None
    success_message: str | None = None
    redirect_url: str | None = None
    create_contact: bool | None = None
    add_tags: list[str] | None = None
    trigger_workflow: bool | None = None
    honeypot_enabled: bool | None = None
    recaptcha_enabled: bool | None = None


class SubmitFormRequest(PydanticBaseModel):
    """Request model for submitting a form (public)."""

    form_id: str = Field(..., description="Form ID")
    data: dict = Field(..., description="Field name -> value mapping")
    honeypot: str | None = Field(None, alias="_honeypot", description="Honeypot field")
