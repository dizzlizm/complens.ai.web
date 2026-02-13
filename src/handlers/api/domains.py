"""Custom domain management API handler."""

import json
import os
from typing import Any

import boto3
import structlog
from pydantic import ValidationError as PydanticValidationError

from complens.models.domain import (
    CreateDomainRequest,
    DomainSetup,
    DomainStatus,
    DomainStatusResponse,
)
from complens.repositories.domain import DomainRepository
from complens.repositories.site import SiteRepository
from complens.services.feature_gate import FeatureGateError, get_workspace_plan, require_feature
from complens.utils.auth import get_auth_context, require_workspace_access
from complens.utils.exceptions import ForbiddenError
from complens.utils.responses import (
    created,
    error,
    forbidden,
    not_found,
    success,
    validation_error,
)

logger = structlog.get_logger()

# Limit domains per workspace (can be adjusted per plan)
MAX_DOMAINS_PER_WORKSPACE = int(os.environ.get("MAX_DOMAINS_PER_WORKSPACE", "1"))


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle domain management API requests.

    Routes:
        GET    /workspaces/{ws}/domains           - List domains
        POST   /workspaces/{ws}/domains           - Create domain setup
        GET    /workspaces/{ws}/domains/{domain}  - Get domain status
        DELETE /workspaces/{ws}/domains/{domain}  - Delete domain
    """
    try:
        http_method = event.get("httpMethod", "").upper()
        path = event.get("path", "")
        path_params = event.get("pathParameters", {}) or {}

        workspace_id = path_params.get("workspace_id")
        domain = path_params.get("domain")

        # Get auth context and verify workspace access
        auth = get_auth_context(event)
        if workspace_id:
            require_workspace_access(auth, workspace_id)

        # Route to handler
        if http_method == "GET" and domain:
            return get_domain_status(workspace_id, domain)
        elif http_method == "GET":
            return list_domains(workspace_id)
        elif http_method == "POST":
            return create_domain(workspace_id, event)
        elif http_method == "DELETE" and domain:
            return delete_domain(workspace_id, domain)
        else:
            return error("Method not allowed", 405)

    except FeatureGateError as e:
        return error(str(e), 403, error_code="PLAN_LIMIT_REACHED")
    except ForbiddenError as e:
        return forbidden(str(e))
    except ValueError as e:
        return error(str(e), 400)
    except Exception as e:
        logger.exception("Domain handler error", error=str(e))
        return error("Internal server error", 500)


def list_domains(workspace_id: str) -> dict:
    """List all domains for a workspace."""
    repo = DomainRepository()
    domains = repo.list_by_workspace(workspace_id)

    return success({
        "items": [
            DomainStatusResponse(
                domain=d.domain,
                site_id=d.site_id,
                status=d.status,
                status_message=d.status_message,
                validation_record_name=d.validation_record_name if d.status == DomainStatus.PENDING_VALIDATION else None,
                validation_record_value=d.validation_record_value if d.status == DomainStatus.PENDING_VALIDATION else None,
                cname_target=d.distribution_domain if d.status == DomainStatus.ACTIVE else None,
                created_at=d.created_at,
                activated_at=d.activated_at,
            ).model_dump(mode="json", exclude_none=True)
            for d in domains
        ],
        "limit": MAX_DOMAINS_PER_WORKSPACE,
        "used": len([d for d in domains if d.status not in [DomainStatus.FAILED]]),
    })


def get_domain_status(workspace_id: str, domain: str) -> dict:
    """Get status of a specific domain."""
    repo = DomainRepository()
    domain_setup = repo.get_by_domain(workspace_id, domain)

    if not domain_setup:
        return not_found("Domain", domain)

    response = DomainStatusResponse(
        domain=domain_setup.domain,
        site_id=domain_setup.site_id,
        status=domain_setup.status,
        status_message=domain_setup.status_message,
        validation_record_name=domain_setup.validation_record_name,
        validation_record_value=domain_setup.validation_record_value,
        cname_target=domain_setup.distribution_domain,
        created_at=domain_setup.created_at,
        activated_at=domain_setup.activated_at,
    )

    return success(response.model_dump(mode="json", exclude_none=True))


def create_domain(workspace_id: str, event: dict) -> dict:
    """Create a new custom domain setup.

    This initiates the domain provisioning process:
    1. Validates the request
    2. Checks domain limit
    3. Requests ACM certificate
    4. Saves domain setup record
    5. Starts Step Function for async provisioning
    """
    # Parse request
    try:
        body = json.loads(event.get("body", "{}"))
        request = CreateDomainRequest.model_validate(body)
    except PydanticValidationError as e:
        return validation_error([
            {"field": ".".join(str(x) for x in err["loc"]), "message": err["msg"]}
            for err in e.errors()
        ])
    except json.JSONDecodeError:
        return error("Invalid JSON body", 400)

    # Enforce custom_domain feature gate
    plan = get_workspace_plan(workspace_id)
    require_feature(plan, "custom_domain")

    domain_repo = DomainRepository()
    site_repo = SiteRepository()

    # Check if site exists
    site = site_repo.get_by_id(workspace_id, request.site_id)
    if not site:
        return not_found("Site", request.site_id)

    # Check domain limit
    active_count = domain_repo.count_active_domains(workspace_id)
    if active_count >= MAX_DOMAINS_PER_WORKSPACE:
        return error(
            f"Domain limit reached. Maximum {MAX_DOMAINS_PER_WORKSPACE} custom domain(s) allowed.",
            400,
        )

    # Check if domain already exists
    existing = domain_repo.get_by_domain(workspace_id, request.domain)
    if existing:
        if existing.status == DomainStatus.FAILED:
            # Allow retry for failed domains
            domain_repo.delete_domain(workspace_id, request.domain)
        else:
            return error(f"Domain {request.domain} is already configured", 400)

    # Request ACM certificate
    try:
        acm = boto3.client("acm", region_name="us-east-1")  # Must be us-east-1 for CloudFront

        cert_response = acm.request_certificate(
            DomainName=request.domain,
            SubjectAlternativeNames=[request.domain, f"*.{request.domain}"],
            ValidationMethod="DNS",
            Tags=[
                {"Key": "Service", "Value": "complens"},
                {"Key": "WorkspaceId", "Value": workspace_id},
                {"Key": "SiteId", "Value": request.site_id},
            ],
        )
        certificate_arn = cert_response["CertificateArn"]

        logger.info(
            "ACM certificate requested",
            domain=request.domain,
            certificate_arn=certificate_arn,
        )

        # Get validation records (may take a moment to be available)
        # Use exponential backoff to be efficient while waiting for ACM
        import time
        validation_name = None
        validation_value = None

        # Exponential backoff: 1s, 2s, 4s, 8s, 15s = 30s total max wait
        backoff_delays = [1, 2, 4, 8, 15]

        for delay in backoff_delays:
            cert_details = acm.describe_certificate(CertificateArn=certificate_arn)
            options = cert_details.get("Certificate", {}).get("DomainValidationOptions", [])

            if options and "ResourceRecord" in options[0]:
                record = options[0]["ResourceRecord"]
                validation_name = record["Name"]
                validation_value = record["Value"]
                logger.info(
                    "Validation records retrieved",
                    domain=request.domain,
                    wait_iterations=backoff_delays.index(delay) + 1,
                )
                break

            # Wait before next attempt
            time.sleep(delay)

        if not validation_name:
            logger.warning(
                "Validation records not available after exponential backoff",
                domain=request.domain,
                total_wait_seconds=sum(backoff_delays),
            )

    except Exception as e:
        logger.exception("Failed to request ACM certificate", error=str(e))
        return error("Failed to request SSL certificate. Please try again.", 500)

    # Ensure site.domain_name matches the provisioned domain for GSI3 resolution
    if site.domain_name != request.domain:
        site.domain_name = request.domain
        site_repo.update_site(site)

    # Create domain setup record
    domain_setup = DomainSetup(
        workspace_id=workspace_id,
        site_id=request.site_id,
        domain=request.domain,
        status=DomainStatus.PENDING_VALIDATION,
        status_message="Waiting for DNS validation. Add the CNAME record below.",
        certificate_arn=certificate_arn,
        validation_record_name=validation_name,
        validation_record_value=validation_value,
    )
    domain_setup = domain_repo.create_domain(domain_setup)

    # Start Step Function for async provisioning
    try:
        sfn = boto3.client("stepfunctions")
        state_machine_arn = os.environ.get("DOMAIN_PROVISIONING_STATE_MACHINE_ARN")

        if state_machine_arn:
            sfn.start_execution(
                stateMachineArn=state_machine_arn,
                name=f"domain-{workspace_id}-{request.domain.replace('.', '-')}",
                input=json.dumps({
                    "workspace_id": workspace_id,
                    "domain": request.domain,
                    "site_id": request.site_id,
                    "certificate_arn": certificate_arn,
                }),
            )
            logger.info("Domain provisioning started", domain=request.domain)
    except Exception as e:
        logger.warning("Failed to start provisioning workflow", error=str(e))
        # Don't fail - user can still add DNS records and we can retry later

    return created({
        "domain": request.domain,
        "status": DomainStatus.PENDING_VALIDATION.value,
        "status_message": domain_setup.status_message,
        "validation_record": {
            "type": "CNAME",
            "name": validation_name,
            "value": validation_value,
        } if validation_name else None,
        "instructions": [
            f"Add the CNAME record to your DNS for {request.domain}",
            "Wait 5-30 minutes for DNS propagation",
            "We'll automatically detect validation and provision your domain",
        ],
    })


def delete_domain(workspace_id: str, domain: str) -> dict:
    """Delete a custom domain setup.

    This will:
    1. Delete the CloudFront distribution (if exists)
    2. Delete the ACM certificate
    3. Remove the domain record
    """
    domain_repo = DomainRepository()

    domain_setup = domain_repo.get_by_domain(workspace_id, domain)
    if not domain_setup:
        return not_found("Domain", domain)

    # Update status to deleting
    domain_repo.update_status(workspace_id, domain, DomainStatus.DELETING, "Cleaning up resources...")

    # Delete CloudFront distribution if exists
    if domain_setup.distribution_id:
        try:
            cf = boto3.client("cloudfront")

            # Get distribution config
            dist = cf.get_distribution(Id=domain_setup.distribution_id)
            etag = dist["ETag"]
            config = dist["Distribution"]["DistributionConfig"]

            # Disable distribution first
            config["Enabled"] = False
            cf.update_distribution(
                Id=domain_setup.distribution_id,
                DistributionConfig=config,
                IfMatch=etag,
            )

            logger.info(
                "CloudFront distribution disabled",
                distribution_id=domain_setup.distribution_id,
            )

            # Note: Actual deletion happens async after distribution is disabled
            # A separate cleanup job should handle this

        except Exception as e:
            logger.warning(
                "Failed to disable CloudFront distribution",
                distribution_id=domain_setup.distribution_id,
                error=str(e),
            )

    # Delete ACM certificate
    if domain_setup.certificate_arn:
        try:
            acm = boto3.client("acm", region_name="us-east-1")
            acm.delete_certificate(CertificateArn=domain_setup.certificate_arn)
            logger.info("ACM certificate deleted", arn=domain_setup.certificate_arn)
        except Exception as e:
            logger.warning(
                "Failed to delete ACM certificate",
                arn=domain_setup.certificate_arn,
                error=str(e),
            )

    # Delete domain record
    domain_repo.delete_domain(workspace_id, domain)

    logger.info("Domain deleted", workspace_id=workspace_id, domain=domain)

    return success({"deleted": True, "domain": domain})
