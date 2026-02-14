"""Custom domain model for landing pages."""

from datetime import datetime, timezone
from enum import Enum
from typing import ClassVar

from pydantic import BaseModel as PydanticBaseModel, Field

from complens.models.base import BaseModel


class DomainStatus(str, Enum):
    """Domain setup status."""

    PENDING_VALIDATION = "pending_validation"  # Waiting for DNS validation
    VALIDATING = "validating"  # ACM is validating
    PROVISIONING = "provisioning"  # Creating CloudFront distribution
    ACTIVE = "active"  # Domain is live
    FAILED = "failed"  # Setup failed
    DELETING = "deleting"  # Being deleted


class DomainSetup(BaseModel):
    """Custom domain setup entity.

    Tracks the provisioning status of a custom domain for a site.

    Key Pattern:
        PK: WS#{workspace_id}
        SK: DOMAIN#{domain}
        GSI1PK: SITE#{site_id}
        GSI1SK: DOMAIN#{domain}
    """

    _pk_prefix: ClassVar[str] = "WS#"
    _sk_prefix: ClassVar[str] = "DOMAIN#"

    workspace_id: str = Field(..., description="Parent workspace ID")
    site_id: str = Field(default="", description="Site this domain belongs to")
    domain: str = Field(..., description="Custom domain (e.g., landing.example.com)")

    # Status tracking
    status: DomainStatus = Field(
        default=DomainStatus.PENDING_VALIDATION,
        description="Current setup status",
    )
    status_message: str | None = Field(None, description="Human-readable status message")

    # ACM Certificate
    certificate_arn: str | None = Field(None, description="ACM certificate ARN")
    validation_record_name: str | None = Field(
        None, description="DNS CNAME record name for validation"
    )
    validation_record_value: str | None = Field(
        None, description="DNS CNAME record value for validation"
    )
    certificate_validated_at: datetime | None = Field(
        None, description="When certificate was validated"
    )

    # CloudFront Distribution
    distribution_id: str | None = Field(None, description="CloudFront distribution ID")
    distribution_domain: str | None = Field(
        None, description="CloudFront domain name (user CNAMEs to this)"
    )
    distribution_created_at: datetime | None = Field(
        None, description="When distribution was created"
    )

    # Timestamps
    activated_at: datetime | None = Field(None, description="When domain became active")
    failed_at: datetime | None = Field(None, description="When setup failed")
    failure_reason: str | None = Field(None, description="Reason for failure")

    def get_pk(self) -> str:
        """Get partition key: WS#{workspace_id}."""
        return f"WS#{self.workspace_id}"

    def get_sk(self) -> str:
        """Get sort key: DOMAIN#{domain}."""
        return f"DOMAIN#{self.domain}"

    def get_gsi1_keys(self) -> dict[str, str]:
        """Get GSI1 keys for site lookup."""
        return {
            "GSI1PK": f"SITE#{self.site_id}",
            "GSI1SK": f"DOMAIN#{self.domain}",
        }


class CreateDomainRequest(PydanticBaseModel):
    """Request to set up a custom domain."""

    domain: str = Field(
        ...,
        min_length=4,
        max_length=253,
        pattern=r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$",
        description="Custom domain (lowercase, no protocol)",
    )
    site_id: str = Field(..., description="Site ID to connect domain to")


class DomainStatusResponse(PydanticBaseModel):
    """Domain status response for UI."""

    domain: str
    site_id: str = ""  # Which site this domain belongs to
    status: DomainStatus
    status_message: str | None = None

    # For pending_validation status - show these to user
    validation_record_name: str | None = None
    validation_record_value: str | None = None

    # For active status - show CNAME target
    cname_target: str | None = None

    # Timestamps
    created_at: datetime | None = None
    activated_at: datetime | None = None
