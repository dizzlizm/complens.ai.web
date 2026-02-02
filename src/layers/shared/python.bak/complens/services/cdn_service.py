"""CDN service for CloudFront cache invalidation.

Invalidates CloudFront caches when pages are updated to ensure
visitors see the latest content immediately.
"""

import os
import time
from typing import Optional

import boto3
import structlog

logger = structlog.get_logger()

# CloudFront distribution IDs - can be set via env vars or looked up from CloudFormation
_subdomain_distribution_id: Optional[str] = None
_pages_distribution_id: Optional[str] = None


def _get_distribution_ids() -> tuple[str, str]:
    """Get CloudFront distribution IDs from environment or CloudFormation stack outputs."""
    global _subdomain_distribution_id, _pages_distribution_id

    # Return cached values if available
    if _subdomain_distribution_id is not None and _pages_distribution_id is not None:
        return _subdomain_distribution_id, _pages_distribution_id

    # First try environment variables
    _subdomain_distribution_id = os.environ.get("subdomain_dist_id", "")
    _pages_distribution_id = os.environ.get("pages_dist_id", "")

    # If not set, try to get from CloudFormation stack outputs
    if not _subdomain_distribution_id or not _pages_distribution_id:
        stage = os.environ.get("STAGE", "dev")
        stack_name = f"complens-{stage}"

        try:
            cfn = boto3.client("cloudformation")
            response = cfn.describe_stacks(StackName=stack_name)

            if response["Stacks"]:
                outputs = {
                    o["OutputKey"]: o["OutputValue"]
                    for o in response["Stacks"][0].get("Outputs", [])
                }

                if not _subdomain_distribution_id:
                    _subdomain_distribution_id = outputs.get("SubdomainDistributionId", "")
                if not _pages_distribution_id:
                    _pages_distribution_id = outputs.get("PagesDistributionId", "")

                logger.info(
                    "Loaded distribution IDs from CloudFormation",
                    subdomain_distribution_id=_subdomain_distribution_id,
                    pages_distribution_id=_pages_distribution_id,
                )
        except Exception as e:
            logger.warning(
                "Failed to get distribution IDs from CloudFormation",
                error=str(e),
            )
            # Initialize to empty strings to avoid repeated lookups
            _subdomain_distribution_id = _subdomain_distribution_id or ""
            _pages_distribution_id = _pages_distribution_id or ""

    return _subdomain_distribution_id, _pages_distribution_id


def invalidate_page_cache(
    subdomain: Optional[str] = None,
    custom_domain: Optional[str] = None,
    page_id: Optional[str] = None,
) -> dict:
    """Invalidate CloudFront cache for a page.

    Invalidates the appropriate CloudFront distributions based on
    how the page is accessed (subdomain or custom domain).

    Args:
        subdomain: The subdomain (e.g., 'mypage' for mypage.dev.complens.ai)
        custom_domain: The custom domain (e.g., 'example.com')
        page_id: The page ID (for logging)

    Returns:
        dict with invalidation results
    """
    results = {"subdomain": None, "custom_domain": None}

    subdomain_dist_id, pages_dist_id = _get_distribution_ids()

    cloudfront = boto3.client("cloudfront")
    caller_ref = f"page-{page_id or 'unknown'}-{int(time.time())}"

    # Invalidate subdomain distribution
    if subdomain and subdomain_dist_id:
        try:
            # The subdomain router rewrites to /public/subdomain/{subdomain}
            # But since we use a CloudFront Function, we invalidate the root
            # and let it pass through
            paths = [f"/{subdomain}", f"/{subdomain}/*"]

            response = cloudfront.create_invalidation(
                DistributionId=subdomain_dist_id,
                InvalidationBatch={
                    "Paths": {
                        "Quantity": len(paths),
                        "Items": paths,
                    },
                    "CallerReference": f"{caller_ref}-subdomain",
                },
            )

            results["subdomain"] = {
                "distribution_id": subdomain_dist_id,
                "invalidation_id": response["Invalidation"]["Id"],
                "status": response["Invalidation"]["Status"],
            }

            logger.info(
                "Subdomain cache invalidation created",
                subdomain=subdomain,
                distribution_id=subdomain_dist_id,
                invalidation_id=response["Invalidation"]["Id"],
            )

        except Exception as e:
            logger.error(
                "Failed to invalidate subdomain cache",
                subdomain=subdomain,
                error=str(e),
            )
            results["subdomain"] = {"error": str(e)}

    # Invalidate custom domain distribution
    if custom_domain and pages_dist_id:
        try:
            # The pages router rewrites to /public/domain/{domain}
            paths = [f"/{custom_domain}", f"/{custom_domain}/*", "/*"]

            response = cloudfront.create_invalidation(
                DistributionId=pages_dist_id,
                InvalidationBatch={
                    "Paths": {
                        "Quantity": len(paths),
                        "Items": paths,
                    },
                    "CallerReference": f"{caller_ref}-domain",
                },
            )

            results["custom_domain"] = {
                "distribution_id": pages_dist_id,
                "invalidation_id": response["Invalidation"]["Id"],
                "status": response["Invalidation"]["Status"],
            }

            logger.info(
                "Custom domain cache invalidation created",
                custom_domain=custom_domain,
                distribution_id=pages_dist_id,
                invalidation_id=response["Invalidation"]["Id"],
            )

        except Exception as e:
            logger.error(
                "Failed to invalidate custom domain cache",
                custom_domain=custom_domain,
                error=str(e),
            )
            results["custom_domain"] = {"error": str(e)}

    return results


def invalidate_all_pages() -> dict:
    """Invalidate the entire pages cache (use sparingly).

    This invalidates all cached pages across both distributions.
    Should only be used for major changes or deployments.

    Returns:
        dict with invalidation results
    """
    results = {"subdomain": None, "custom_domain": None}

    subdomain_dist_id, pages_dist_id = _get_distribution_ids()

    cloudfront = boto3.client("cloudfront")
    caller_ref = f"all-pages-{int(time.time())}"

    # Invalidate subdomain distribution
    if subdomain_dist_id:
        try:
            response = cloudfront.create_invalidation(
                DistributionId=subdomain_dist_id,
                InvalidationBatch={
                    "Paths": {"Quantity": 1, "Items": ["/*"]},
                    "CallerReference": f"{caller_ref}-subdomain",
                },
            )
            results["subdomain"] = {
                "distribution_id": subdomain_dist_id,
                "invalidation_id": response["Invalidation"]["Id"],
            }
            logger.info(
                "Full subdomain cache invalidation created",
                distribution_id=subdomain_dist_id,
            )
        except Exception as e:
            logger.error("Failed to invalidate subdomain cache", error=str(e))
            results["subdomain"] = {"error": str(e)}

    # Invalidate pages distribution
    if pages_dist_id:
        try:
            response = cloudfront.create_invalidation(
                DistributionId=pages_dist_id,
                InvalidationBatch={
                    "Paths": {"Quantity": 1, "Items": ["/*"]},
                    "CallerReference": f"{caller_ref}-pages",
                },
            )
            results["custom_domain"] = {
                "distribution_id": pages_dist_id,
                "invalidation_id": response["Invalidation"]["Id"],
            }
            logger.info(
                "Full pages cache invalidation created",
                distribution_id=pages_dist_id,
            )
        except Exception as e:
            logger.error("Failed to invalidate pages cache", error=str(e))
            results["custom_domain"] = {"error": str(e)}

    return results
