"""Domain provisioning worker - handles async domain setup tasks."""

import json
import os
from typing import Any

import boto3
import structlog

from complens.models.domain import DomainStatus
from complens.repositories.domain import DomainRepository
from complens.repositories.page import PageRepository

logger = structlog.get_logger()

# API Gateway origin for CloudFront
API_GATEWAY_DOMAIN = os.environ.get("API_GATEWAY_DOMAIN", "")
STAGE = os.environ.get("STAGE", "dev")


def handler(event: dict[str, Any], context: Any) -> dict:
    """Handle domain provisioning tasks.

    This Lambda is called by Step Functions to:
    1. Check certificate validation status
    2. Create CloudFront distribution when cert is validated
    3. Activate domain when distribution is deployed

    Args:
        event: Step Functions event with task type and domain info.
        context: Lambda context.

    Returns:
        Result for Step Functions state machine.
    """
    task = event.get("task")
    workspace_id = event.get("workspace_id")
    domain = event.get("domain")
    page_id = event.get("page_id")
    certificate_arn = event.get("certificate_arn")

    logger.info(
        "Domain provisioning task",
        task=task,
        domain=domain,
        workspace_id=workspace_id,
    )

    try:
        if task == "check_certificate":
            return check_certificate_status(workspace_id, domain, certificate_arn)
        elif task == "create_distribution":
            return create_cloudfront_distribution(
                workspace_id, domain, page_id, certificate_arn
            )
        elif task == "check_distribution":
            return check_distribution_status(workspace_id, domain)
        elif task == "activate_domain":
            return activate_domain(workspace_id, domain, page_id)
        elif task == "mark_failed":
            return mark_failed(workspace_id, domain, event.get("error"))
        else:
            logger.error("Unknown task", task=task)
            return {"success": False, "error": f"Unknown task: {task}"}

    except Exception as e:
        logger.exception("Provisioning task failed", task=task, error=str(e))
        return {"success": False, "error": str(e)}


def check_certificate_status(
    workspace_id: str, domain: str, certificate_arn: str
) -> dict:
    """Check if ACM certificate is validated.

    Returns:
        Dict with 'validated' boolean and status info.
    """
    acm = boto3.client("acm", region_name="us-east-1")
    domain_repo = DomainRepository()

    try:
        response = acm.describe_certificate(CertificateArn=certificate_arn)
        cert = response["Certificate"]
        status = cert["Status"]

        logger.info(
            "Certificate status",
            domain=domain,
            status=status,
        )

        if status == "ISSUED":
            # Certificate is ready
            domain_repo.update_status(
                workspace_id,
                domain,
                DomainStatus.PROVISIONING,
                "Certificate validated. Creating CDN distribution...",
            )
            return {"validated": True, "status": "ISSUED"}

        elif status == "PENDING_VALIDATION":
            # Still waiting for DNS validation
            # Get validation records in case they weren't available before
            options = cert.get("DomainValidationOptions", [])
            if options and "ResourceRecord" in options[0]:
                record = options[0]["ResourceRecord"]
                domain_repo.set_certificate_info(
                    workspace_id,
                    domain,
                    certificate_arn,
                    record["Name"],
                    record["Value"],
                )

            domain_repo.update_status(
                workspace_id,
                domain,
                DomainStatus.PENDING_VALIDATION,
                "Waiting for DNS validation. Please add the CNAME record.",
            )
            return {"validated": False, "status": "PENDING_VALIDATION"}

        elif status == "FAILED":
            domain_repo.update_status(
                workspace_id,
                domain,
                DomainStatus.FAILED,
                "Certificate validation failed. Please check your DNS records.",
            )
            return {"validated": False, "status": "FAILED", "error": "Validation failed"}

        else:
            return {"validated": False, "status": status}

    except Exception as e:
        logger.exception("Failed to check certificate", error=str(e))
        return {"validated": False, "error": str(e)}


def create_cloudfront_distribution(
    workspace_id: str,
    domain: str,
    page_id: str,
    certificate_arn: str,
) -> dict:
    """Create CloudFront distribution for the custom domain.

    Returns:
        Dict with distribution info.
    """
    cf = boto3.client("cloudfront")
    domain_repo = DomainRepository()

    # Check if distribution already exists
    domain_setup = domain_repo.get_by_domain(workspace_id, domain)
    if domain_setup and domain_setup.distribution_id:
        logger.info(
            "Distribution already exists",
            distribution_id=domain_setup.distribution_id,
        )
        return {
            "success": True,
            "distribution_id": domain_setup.distribution_id,
            "distribution_domain": domain_setup.distribution_domain,
        }

    try:
        # Create CloudFront distribution
        # Origin: API Gateway public domain endpoint
        api_origin = API_GATEWAY_DOMAIN or f"api.dev.complens.ai"

        # Build default cache behavior — with CloudFront Function if available
        default_cache_behavior = {
            "TargetOriginId": "api-gateway",
            "ViewerProtocolPolicy": "redirect-to-https",
            "AllowedMethods": {
                "Quantity": 3,
                "Items": ["GET", "HEAD", "OPTIONS"],
                "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]},
            },
            "Compress": True,
            # CachingDisabled policy
            "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
            # AllViewerExceptHostHeader policy
            "OriginRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac",
        }

        # Attach CloudFront Function to rewrite URI to /{host} so the API
        # Gateway handler receives the full domain (including subdomain)
        pages_router_arn = os.environ.get("PAGES_ROUTER_FUNCTION_ARN", "")
        if pages_router_arn:
            default_cache_behavior["FunctionAssociations"] = {
                "Quantity": 1,
                "Items": [{
                    "EventType": "viewer-request",
                    "FunctionARN": pages_router_arn,
                }],
            }

        def _build_distribution_config(aliases: list[str], caller_suffix: str = "") -> dict:
            return {
                "CallerReference": f"complens-{workspace_id}-{domain}{caller_suffix}",
                "Comment": f"Complens custom domain: {domain}",
                "Enabled": True,
                "Aliases": {"Quantity": len(aliases), "Items": aliases},
                "Origins": {
                    "Quantity": 1,
                    "Items": [
                        {
                            "Id": "api-gateway",
                            "DomainName": api_origin.replace("https://", ""),
                            "OriginPath": "/public/domain",
                            "CustomOriginConfig": {
                                "HTTPPort": 80,
                                "HTTPSPort": 443,
                                "OriginProtocolPolicy": "https-only",
                                "OriginSslProtocols": {"Quantity": 1, "Items": ["TLSv1.2"]},
                            },
                        }
                    ],
                },
                "DefaultCacheBehavior": default_cache_behavior,
                "ViewerCertificate": {
                    "ACMCertificateArn": certificate_arn,
                    "SSLSupportMethod": "sni-only",
                    "MinimumProtocolVersion": "TLSv1.2_2021",
                },
                "PriceClass": "PriceClass_100",
                "HttpVersion": "http2and3",
                "IsIPV6Enabled": True,
            }

        # Try both root + wildcard aliases first; fall back to wildcard-only
        # if the root domain is already claimed by another CloudFront distribution
        try:
            distribution_config = _build_distribution_config([domain, f"*.{domain}"])
            response = cf.create_distribution(DistributionConfig=distribution_config)
        except cf.exceptions.CNAMEAlreadyExists:
            logger.info(
                "Root domain alias already claimed, using wildcard-only",
                domain=domain,
            )
            distribution_config = _build_distribution_config(
                [f"*.{domain}"], caller_suffix="-wildcard"
            )
            response = cf.create_distribution(DistributionConfig=distribution_config)
        distribution = response["Distribution"]
        distribution_id = distribution["Id"]
        distribution_domain = distribution["DomainName"]

        logger.info(
            "CloudFront distribution created",
            domain=domain,
            distribution_id=distribution_id,
            distribution_domain=distribution_domain,
        )

        # Save distribution info
        domain_repo.set_distribution_info(
            workspace_id, domain, distribution_id, distribution_domain
        )
        domain_repo.update_status(
            workspace_id,
            domain,
            DomainStatus.PROVISIONING,
            f"CDN distribution created. Deploying globally (this may take 10-15 minutes)...",
        )

        return {
            "success": True,
            "distribution_id": distribution_id,
            "distribution_domain": distribution_domain,
        }

    except cf.exceptions.DistributionAlreadyExists:
        logger.warning("Distribution already exists for domain", domain=domain)
        return {"success": False, "error": "Distribution already exists"}

    except Exception as e:
        logger.exception("Failed to create distribution", error=str(e))
        domain_repo.update_status(
            workspace_id,
            domain,
            DomainStatus.FAILED,
            f"Failed to create CDN distribution: {str(e)}",
        )
        return {"success": False, "error": str(e)}


def check_distribution_status(workspace_id: str, domain: str) -> dict:
    """Check if CloudFront distribution is deployed.

    Returns:
        Dict with 'deployed' boolean.
    """
    cf = boto3.client("cloudfront")
    domain_repo = DomainRepository()

    domain_setup = domain_repo.get_by_domain(workspace_id, domain)
    if not domain_setup or not domain_setup.distribution_id:
        return {"deployed": False, "error": "No distribution found"}

    try:
        response = cf.get_distribution(Id=domain_setup.distribution_id)
        status = response["Distribution"]["Status"]

        logger.info(
            "Distribution status",
            domain=domain,
            distribution_id=domain_setup.distribution_id,
            status=status,
        )

        if status == "Deployed":
            return {"deployed": True, "status": "Deployed"}
        else:
            domain_repo.update_status(
                workspace_id,
                domain,
                DomainStatus.PROVISIONING,
                f"CDN deployment in progress... Status: {status}",
            )
            return {"deployed": False, "status": status}

    except Exception as e:
        logger.exception("Failed to check distribution", error=str(e))
        return {"deployed": False, "error": str(e)}


def activate_domain(workspace_id: str, domain: str, page_id: str) -> dict:
    """Mark domain as active and update page.

    Returns:
        Dict with activation status.
    """
    domain_repo = DomainRepository()
    page_repo = PageRepository()

    domain_setup = domain_repo.get_by_domain(workspace_id, domain)
    if not domain_setup:
        return {"success": False, "error": "Domain not found"}

    # Update domain status to active
    domain_repo.update_status(
        workspace_id,
        domain,
        DomainStatus.ACTIVE,
        f"Domain is live! Point your DNS CNAME to: {domain_setup.distribution_domain}",
    )

    # Update page with final CNAME target
    page = page_repo.get_by_id(workspace_id, page_id)
    if page:
        page.custom_domain = domain
        page_repo.update_page(page)

    logger.info(
        "Domain activated",
        domain=domain,
        distribution_domain=domain_setup.distribution_domain,
    )

    return {
        "success": True,
        "domain": domain,
        "cname_target": domain_setup.distribution_domain,
    }


def mark_failed(workspace_id: str, domain: str, error_info: Any) -> dict:
    """Mark domain provisioning as failed.

    Args:
        workspace_id: The workspace ID.
        domain: The custom domain.
        error_info: Error information from previous step.

    Returns:
        Dict with failure info.
    """
    domain_repo = DomainRepository()

    error_message = "Domain provisioning failed"
    if isinstance(error_info, dict):
        error_message = error_info.get("error", error_info.get("Cause", error_message))
    elif isinstance(error_info, str):
        error_message = error_info

    domain_repo.update_status(
        workspace_id,
        domain,
        DomainStatus.FAILED,
        f"Setup failed: {error_message}",
    )

    # Update the failure_reason field
    domain_setup = domain_repo.get_by_domain(workspace_id, domain)
    if domain_setup:
        domain_setup.failure_reason = error_message
        domain_repo.update_domain(domain_setup)

    logger.error(
        "Domain provisioning marked as failed",
        domain=domain,
        error=error_message,
    )

    return {"success": False, "domain": domain, "error": error_message}
