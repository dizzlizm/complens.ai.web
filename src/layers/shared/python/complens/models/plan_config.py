"""Plan configuration model for dynamic billing tiers."""

from typing import Any, ClassVar

from pydantic import Field

from complens.models.base import BaseModel


class PlanConfig(BaseModel):
    """Configuration for a billing plan tier, stored in DynamoDB.

    PK: PLATFORM
    SK: PLAN#{plan_key}
    """

    _pk_prefix: ClassVar[str] = "PLATFORM"
    _sk_prefix: ClassVar[str] = "PLAN#"

    plan_key: str  # "free", "pro", "business"
    display_name: str  # "Starter", "Pro", "Business"
    price_monthly: int = 0  # dollars (0, 97, 297)
    stripe_price_id: str | None = None
    description: str = ""
    limits: dict[str, int] = Field(default_factory=dict)
    features: dict[str, bool] = Field(default_factory=dict)
    feature_list: list[str] = Field(default_factory=list)
    highlighted: bool = False
    sort_order: int = 0

    def get_pk(self) -> str:
        """Get partition key."""
        return self._pk_prefix

    def get_sk(self) -> str:
        """Get sort key."""
        return f"{self._sk_prefix}{self.plan_key}"


class UpdatePlanConfigRequest(BaseModel):
    """Request model for updating a plan config."""

    display_name: str | None = None
    price_monthly: int | None = None
    stripe_price_id: str | None = None
    description: str | None = None
    limits: dict[str, int] | None = None
    features: dict[str, bool] | None = None
    feature_list: list[str] | None = None
    highlighted: bool | None = None
    sort_order: int | None = None

    def get_pk(self) -> str:
        """Not used for request models."""
        return ""

    def get_sk(self) -> str:
        """Not used for request models."""
        return ""
