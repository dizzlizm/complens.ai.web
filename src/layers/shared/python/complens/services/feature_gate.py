"""Feature gating based on workspace plan."""

import structlog

from complens.services.billing_service import DEFAULT_PLAN_LIMITS, get_dynamic_plan_limits

logger = structlog.get_logger()


class FeatureGateError(Exception):
    """Raised when a feature is not available on the current plan."""

    def __init__(self, feature: str, current_plan: str, required_plan: str) -> None:
        """Initialize feature gate error.

        Args:
            feature: Feature name.
            current_plan: Current plan name.
            required_plan: Minimum required plan.
        """
        self.feature = feature
        self.current_plan = current_plan
        self.required_plan = required_plan
        super().__init__(
            f"Feature '{feature}' requires {required_plan} plan (current: {current_plan})"
        )


def check_limit(
    plan: str,
    resource: str,
    current_count: int,
) -> bool:
    """Check if a resource limit has been reached.

    Args:
        plan: Workspace plan (free, pro, business).
        resource: Resource name (contacts, pages, workflows, sites, etc.).
        current_count: Current count of the resource.

    Returns:
        True if within limits, False if limit reached.
    """
    limits = get_dynamic_plan_limits(plan)
    limit = limits.get(resource, 0)

    if limit == -1:  # unlimited
        return True

    return current_count < limit


def enforce_limit(plan: str, resource: str, current_count: int) -> None:
    """Enforce a resource limit, raising FeatureGateError if exceeded.

    Args:
        plan: Workspace plan (free, pro, business).
        resource: Resource name (contacts, pages, workflows, sites, etc.).
        current_count: Current count of the resource.

    Raises:
        FeatureGateError: If limit is reached.
    """
    if check_limit(plan, resource, current_count):
        return

    # Find minimum upgrade plan *above* the current plan that would allow this
    plan_hierarchy = ["free", "pro", "business"]
    current_tier = plan_hierarchy.index(plan) if plan in plan_hierarchy else -1

    for upgrade_plan in plan_hierarchy:
        if plan_hierarchy.index(upgrade_plan) <= current_tier:
            continue  # Skip current and lower plans
        upgrade_limits = get_dynamic_plan_limits(upgrade_plan)
        upgrade_limit = upgrade_limits.get(resource, 0)
        if upgrade_limit == -1 or current_count < upgrade_limit:
            raise FeatureGateError(resource, plan, upgrade_plan)
    raise FeatureGateError(resource, plan, "business")


def require_feature(plan: str, feature: str) -> None:
    """Require a boolean feature to be enabled on the plan.

    Args:
        plan: Workspace plan.
        feature: Feature name (custom_domain, knowledge_base).

    Raises:
        FeatureGateError: If feature is not available.
    """
    limits = get_dynamic_plan_limits(plan)
    if not limits.get(feature, False):
        pro_limits = get_dynamic_plan_limits("pro")
        required = "pro" if pro_limits.get(feature) else "business"
        raise FeatureGateError(feature, plan, required)


def get_workspace_plan(workspace_id: str) -> str:
    """Get the plan for a workspace.

    Args:
        workspace_id: Workspace ID.

    Returns:
        Plan name (free, pro, business).
    """
    from complens.repositories.workspace import WorkspaceRepository

    ws = WorkspaceRepository().get_by_id(workspace_id)
    return ws.plan if ws else "free"


def count_resources(table, workspace_id: str, sk_prefix: str) -> int:
    """Count resources in a workspace using efficient DynamoDB Select='COUNT'.

    Args:
        table: DynamoDB table resource.
        workspace_id: Workspace ID.
        sk_prefix: Sort key prefix (e.g., 'PAGE#', 'WF#', 'CONTACT#').

    Returns:
        Count of matching items.
    """
    response = table.query(
        KeyConditionExpression="PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues={
            ":pk": f"WS#{workspace_id}",
            ":sk": sk_prefix,
        },
        Select="COUNT",
    )
    return response["Count"]


def get_usage_summary(plan: str, counts: dict[str, int]) -> dict:
    """Get usage summary with limits for a plan.

    Args:
        plan: Workspace plan.
        counts: Current resource counts.

    Returns:
        Usage summary with limits and percentages.
    """
    limits = get_dynamic_plan_limits(plan)
    usage = {}

    for resource, limit in limits.items():
        if isinstance(limit, bool):
            usage[resource] = {"enabled": limit}
            continue

        current = counts.get(resource, 0)
        if limit == -1:
            usage[resource] = {
                "current": current,
                "limit": "unlimited",
                "percentage": 0,
            }
        else:
            usage[resource] = {
                "current": current,
                "limit": limit,
                "percentage": round(current / limit * 100) if limit > 0 else 0,
            }

    return usage
