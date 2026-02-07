"""Queue infrastructure for scalable workflow processing.

This module provides the components for the sharded queue architecture:
- TenantRouter: Routes messages to sharded queues using consistent hashing
- FairScheduler: Ensures fair processing across tenants
- FeatureFlagService: Controls gradual rollout of new architecture
- WorkflowRouter: Unified interface for routing workflow triggers
"""

from complens.queue.fair_scheduler import (
    FairScheduler,
    SchedulingDecision,
    TenantCredits,
    TenantTier,
    TIER_CREDITS,
    get_fair_scheduler,
)
from complens.queue.feature_flags import (
    FeatureFlag,
    FeatureFlagService,
    FlagConfig,
    get_feature_flags,
    is_flag_enabled,
)
from complens.queue.tenant_router import (
    QueueMessage,
    RoutingResult,
    TenantRouter,
    get_tenant_router,
)
from complens.queue.workflow_router import (
    WorkflowRouter,
    WorkflowTriggerMessage,
    get_workflow_router,
    route_workflow_trigger,
)

__all__ = [
    # Tenant router
    "TenantRouter",
    "QueueMessage",
    "RoutingResult",
    "get_tenant_router",
    # Fair scheduler
    "FairScheduler",
    "TenantCredits",
    "TenantTier",
    "SchedulingDecision",
    "TIER_CREDITS",
    "get_fair_scheduler",
    # Feature flags
    "FeatureFlagService",
    "FeatureFlag",
    "FlagConfig",
    "get_feature_flags",
    "is_flag_enabled",
    # Workflow router
    "WorkflowRouter",
    "WorkflowTriggerMessage",
    "get_workflow_router",
    "route_workflow_trigger",
]
