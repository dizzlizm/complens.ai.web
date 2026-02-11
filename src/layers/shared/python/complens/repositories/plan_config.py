"""Repository for plan configuration CRUD in DynamoDB."""

import structlog

from complens.models.plan_config import PlanConfig
from complens.repositories.base import BaseRepository

logger = structlog.get_logger()


class PlanConfigRepository(BaseRepository[PlanConfig]):
    """Repository for managing plan configurations in DynamoDB."""

    def __init__(self, table_name: str | None = None):
        """Initialize plan config repository."""
        super().__init__(PlanConfig, table_name)

    def list_plans(self) -> list[PlanConfig]:
        """List all plan configs, sorted by sort_order.

        Returns:
            List of PlanConfig instances.
        """
        plans, _ = self.query(pk="PLATFORM", sk_prefix="PLAN#")
        plans.sort(key=lambda p: p.sort_order)
        return plans

    def get_plan(self, plan_key: str) -> PlanConfig | None:
        """Get a single plan config by key.

        Args:
            plan_key: Plan key (free, pro, business).

        Returns:
            PlanConfig or None.
        """
        return self.get(pk="PLATFORM", sk=f"PLAN#{plan_key}")

    def upsert_plan(self, config: PlanConfig) -> PlanConfig:
        """Create or update a plan config.

        Args:
            config: PlanConfig to save.

        Returns:
            Saved PlanConfig.
        """
        return self.put(config)

    def seed_defaults(self, defaults: dict[str, dict]) -> list[PlanConfig]:
        """Seed default plan configs if no plans exist in DynamoDB.

        Args:
            defaults: Default plan limits dict (from DEFAULT_PLAN_LIMITS).

        Returns:
            List of seeded PlanConfig instances.
        """
        existing = self.list_plans()
        if existing:
            return existing

        display_names = {
            "free": ("Starter", "Try it out — no credit card needed", 0),
            "pro": ("Pro", "Everything you need to grow", 97),
            "business": ("Business", "For agencies & scaling teams", 297),
        }

        feature_lists = {
            "free": [
                "100 contacts",
                "1 site",
                "1 landing page",
                "3 workflows",
                "100 runs/month",
                "1 team member",
                "AI page builder",
                "AI chat widget",
            ],
            "pro": [
                "10,000 contacts",
                "10 sites",
                "25 landing pages",
                "50 workflows",
                "10,000 runs/month",
                "5 team members",
                "Custom domains",
                "Knowledge base",
                "Email warmup",
                "AI workflow generation",
                "Priority support",
            ],
            "business": [
                "Unlimited contacts",
                "Unlimited sites",
                "Unlimited pages",
                "Unlimited workflows",
                "Unlimited runs",
                "Unlimited team members",
                "Custom domains",
                "Knowledge base",
                "Email warmup",
                "White-glove onboarding",
                "Dedicated support",
            ],
        }

        plans = []
        for idx, (plan_key, plan_limits) in enumerate(defaults.items()):
            name, desc, price = display_names.get(plan_key, (plan_key, "", 0))

            # Separate numeric limits from boolean features
            limits = {k: v for k, v in plan_limits.items() if isinstance(v, int)}
            features = {k: v for k, v in plan_limits.items() if isinstance(v, bool)}

            config = PlanConfig(
                plan_key=plan_key,
                display_name=name,
                price_monthly=price,
                description=desc,
                limits=limits,
                features=features,
                feature_list=feature_lists.get(plan_key, []),
                highlighted=(plan_key == "pro"),
                sort_order=idx,
            )
            self.upsert_plan(config)
            plans.append(config)

        logger.info("Seeded default plan configs", count=len(plans))
        return plans
