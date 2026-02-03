"""Node dispatcher for fault-tolerant workflow execution.

Routes node execution through circuit breakers and retry policies
to provide resilient, fault-tolerant workflow processing.

The dispatcher categorizes nodes into:
- Core nodes (logic, branching) - executed directly
- Provider nodes (email, SMS) - executed with circuit breaker protection
- External nodes (webhooks, APIs) - executed with retry and circuit breaker

Usage:
    dispatcher = NodeDispatcher()

    result = await dispatcher.execute_node(
        node=my_node,
        context=node_context,
    )
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any

import structlog

from complens.execution.circuit_breaker import (
    CircuitBreakerConfig,
    CircuitBreakerError,
    CircuitState,
    get_circuit_breaker_registry,
)
from complens.execution.retry_policy import (
    ErrorType,
    RetryConfig,
    RetryPolicy,
    RetryResult,
    RetryStrategy,
    get_retry_policy,
)
from complens.nodes.base import BaseNode, NodeContext, NodeResult
from complens.queue.feature_flags import FeatureFlag, is_flag_enabled

logger = structlog.get_logger()


class NodeCategory(str, Enum):
    """Categories of nodes for dispatch routing."""

    CORE = "core"  # Logic, branching, waits - execute directly
    PROVIDER = "provider"  # Email, SMS - circuit breaker protected
    EXTERNAL = "external"  # Webhooks, APIs - retry + circuit breaker
    AI = "ai"  # AI operations - special retry handling


# Node type to category mapping
NODE_CATEGORIES: dict[str, NodeCategory] = {
    # Core nodes - execute directly without protection
    "trigger_form_submitted": NodeCategory.CORE,
    "trigger_chat_message": NodeCategory.CORE,
    "trigger_tag_added": NodeCategory.CORE,
    "trigger_webhook": NodeCategory.CORE,
    "trigger_schedule": NodeCategory.CORE,
    "trigger_segment_event": NodeCategory.CORE,
    "logic_branch": NodeCategory.CORE,
    "logic_ab_split": NodeCategory.CORE,
    "logic_filter": NodeCategory.CORE,
    "action_wait": NodeCategory.CORE,
    "action_update_contact": NodeCategory.CORE,
    # Provider nodes - circuit breaker protected
    "action_send_email": NodeCategory.PROVIDER,
    "action_send_sms": NodeCategory.PROVIDER,
    # External nodes - retry + circuit breaker
    "action_webhook": NodeCategory.EXTERNAL,
    # AI nodes - special handling
    "ai_decision": NodeCategory.AI,
    "ai_generate": NodeCategory.AI,
    "ai_analyze": NodeCategory.AI,
    "action_ai_respond": NodeCategory.AI,
}

# Circuit breaker configurations by category
CIRCUIT_BREAKER_CONFIGS: dict[NodeCategory, CircuitBreakerConfig] = {
    NodeCategory.PROVIDER: CircuitBreakerConfig(
        failure_threshold=5,
        success_threshold=3,
        recovery_timeout=60.0,
        half_open_max_calls=3,
        metrics_window=300.0,
        failure_rate_threshold=0.5,
    ),
    NodeCategory.EXTERNAL: CircuitBreakerConfig(
        failure_threshold=3,  # More sensitive for external APIs
        success_threshold=2,
        recovery_timeout=30.0,
        half_open_max_calls=2,
        metrics_window=180.0,
        failure_rate_threshold=0.4,
    ),
    NodeCategory.AI: CircuitBreakerConfig(
        failure_threshold=5,
        success_threshold=3,
        recovery_timeout=120.0,  # Longer recovery for AI services
        half_open_max_calls=2,
        metrics_window=300.0,
        failure_rate_threshold=0.5,
    ),
}

# Retry configurations by category
RETRY_CONFIGS: dict[NodeCategory, RetryConfig] = {
    NodeCategory.PROVIDER: RetryConfig(
        max_retries=3,
        base_delay=1.0,
        max_delay=30.0,
        jitter_factor=0.3,
        strategy=RetryStrategy.EXPONENTIAL,
    ),
    NodeCategory.EXTERNAL: RetryConfig(
        max_retries=4,
        base_delay=2.0,
        max_delay=60.0,
        jitter_factor=0.5,
        strategy=RetryStrategy.EXPONENTIAL,
    ),
    NodeCategory.AI: RetryConfig(
        max_retries=2,  # Fewer retries for AI (expensive)
        base_delay=3.0,
        max_delay=30.0,
        jitter_factor=0.25,
        strategy=RetryStrategy.EXPONENTIAL,
    ),
}


@dataclass
class DispatchResult:
    """Result of node dispatch execution."""

    node_result: NodeResult
    category: NodeCategory
    circuit_state: CircuitState | None = None
    retry_attempts: int = 0
    total_retry_delay: float = 0.0
    execution_time_ms: float = 0.0
    fallback_used: bool = False


@dataclass
class DispatchMetrics:
    """Metrics for node dispatch operations."""

    total_dispatches: int = 0
    successful_dispatches: int = 0
    failed_dispatches: int = 0
    circuit_breaker_rejections: int = 0
    retry_operations: int = 0
    fallback_invocations: int = 0
    by_category: dict[NodeCategory, int] = field(default_factory=dict)
    by_node_type: dict[str, int] = field(default_factory=dict)


class NodeDispatcher:
    """Dispatches node execution with fault tolerance.

    Provides circuit breaker protection and retry logic for
    workflow node execution.

    Example:
        dispatcher = NodeDispatcher()

        result = await dispatcher.execute_node(
            node=SendEmailNode("node_1", config),
            context=node_context,
        )

        if result.node_result.success:
            print("Node executed successfully")
        else:
            print(f"Node failed: {result.node_result.error}")
    """

    def __init__(
        self,
        use_circuit_breaker: bool = True,
        use_retry: bool = True,
    ):
        """Initialize the node dispatcher.

        Args:
            use_circuit_breaker: Enable circuit breaker protection.
            use_retry: Enable retry logic.
        """
        self.use_circuit_breaker = use_circuit_breaker
        self.use_retry = use_retry

        self.metrics = DispatchMetrics()
        self.logger = logger.bind(service="node_dispatcher")

        # Lazy-initialized components
        self._circuit_registry = None
        self._retry_policies: dict[NodeCategory, RetryPolicy] = {}

    @property
    def circuit_registry(self):
        """Get circuit breaker registry (lazy initialization)."""
        if self._circuit_registry is None:
            self._circuit_registry = get_circuit_breaker_registry()
        return self._circuit_registry

    def get_retry_policy(self, category: NodeCategory) -> RetryPolicy:
        """Get retry policy for a category.

        Args:
            category: Node category.

        Returns:
            RetryPolicy instance.
        """
        if category not in self._retry_policies:
            config = RETRY_CONFIGS.get(category)
            self._retry_policies[category] = RetryPolicy(config)
        return self._retry_policies[category]

    def get_node_category(self, node: BaseNode) -> NodeCategory:
        """Determine the category of a node.

        Args:
            node: Node instance.

        Returns:
            NodeCategory for the node.
        """
        # Check explicit mapping first
        if node.node_type in NODE_CATEGORIES:
            return NODE_CATEGORIES[node.node_type]

        # Check for provider-based nodes (format: provider_id.action_id)
        if "." in node.node_type:
            return NodeCategory.PROVIDER

        # Default to core for unknown types
        return NodeCategory.CORE

    def get_circuit_id(self, node: BaseNode, context: NodeContext) -> str:
        """Generate circuit breaker ID for a node.

        Args:
            node: Node instance.
            context: Execution context.

        Returns:
            Circuit breaker identifier.
        """
        # For provider-based nodes, use provider.action format
        if "." in node.node_type:
            return node.node_type

        # For legacy nodes, map to provider format
        legacy_mapping = {
            "action_send_sms": "twilio.send_sms",
            "action_send_email": "ses.send_email",
            "action_webhook": f"webhook.{node.node_id}",
            "ai_decision": "bedrock.decision",
            "ai_generate": "bedrock.generate",
            "ai_analyze": "bedrock.analyze",
            "action_ai_respond": "bedrock.respond",
        }

        return legacy_mapping.get(node.node_type, f"node.{node.node_type}")

    async def execute_node(
        self,
        node: BaseNode,
        context: NodeContext,
        fallback: NodeResult | None = None,
    ) -> DispatchResult:
        """Execute a node with fault tolerance.

        Args:
            node: Node to execute.
            context: Execution context.
            fallback: Optional fallback result if circuit is open.

        Returns:
            DispatchResult with execution details.
        """
        start_time = datetime.now(timezone.utc)
        category = self.get_node_category(node)

        self.metrics.total_dispatches += 1
        self.metrics.by_category[category] = (
            self.metrics.by_category.get(category, 0) + 1
        )
        self.metrics.by_node_type[node.node_type] = (
            self.metrics.by_node_type.get(node.node_type, 0) + 1
        )

        self.logger.info(
            "Dispatching node",
            node_id=node.node_id,
            node_type=node.node_type,
            category=category.value,
            workspace_id=context.workspace_id,
        )

        # Check feature flag for node dispatcher
        if not is_flag_enabled(FeatureFlag.USE_NODE_DISPATCHER, context.workspace_id):
            # Feature disabled - execute directly
            return await self._execute_direct(node, context, category, start_time)

        # Core nodes execute directly without protection
        if category == NodeCategory.CORE:
            return await self._execute_direct(node, context, category, start_time)

        # Protected execution for provider/external/AI nodes
        return await self._execute_protected(
            node=node,
            context=context,
            category=category,
            start_time=start_time,
            fallback=fallback,
        )

    async def _execute_direct(
        self,
        node: BaseNode,
        context: NodeContext,
        category: NodeCategory,
        start_time: datetime,
    ) -> DispatchResult:
        """Execute a node directly without protection.

        Args:
            node: Node to execute.
            context: Execution context.
            category: Node category.
            start_time: Execution start time.

        Returns:
            DispatchResult.
        """
        try:
            result = await node.execute(context)
            execution_time = (
                datetime.now(timezone.utc) - start_time
            ).total_seconds() * 1000

            if result.success:
                self.metrics.successful_dispatches += 1
            else:
                self.metrics.failed_dispatches += 1

            return DispatchResult(
                node_result=result,
                category=category,
                execution_time_ms=execution_time,
            )

        except Exception as e:
            execution_time = (
                datetime.now(timezone.utc) - start_time
            ).total_seconds() * 1000
            self.metrics.failed_dispatches += 1

            self.logger.error(
                "Direct node execution failed",
                node_id=node.node_id,
                node_type=node.node_type,
                error=str(e),
            )

            return DispatchResult(
                node_result=NodeResult.failed(str(e)),
                category=category,
                execution_time_ms=execution_time,
            )

    async def _execute_protected(
        self,
        node: BaseNode,
        context: NodeContext,
        category: NodeCategory,
        start_time: datetime,
        fallback: NodeResult | None = None,
    ) -> DispatchResult:
        """Execute a node with circuit breaker and retry protection.

        Args:
            node: Node to execute.
            context: Execution context.
            category: Node category.
            start_time: Execution start time.
            fallback: Optional fallback result.

        Returns:
            DispatchResult.
        """
        circuit_id = self.get_circuit_id(node, context)
        circuit_state: CircuitState | None = None
        retry_attempts = 0
        total_retry_delay = 0.0
        fallback_used = False

        # Check circuit breaker first
        if self.use_circuit_breaker and is_flag_enabled(
            FeatureFlag.USE_CIRCUIT_BREAKER, context.workspace_id
        ):
            cb_config = CIRCUIT_BREAKER_CONFIGS.get(category)
            circuit = self.circuit_registry.get_circuit(circuit_id, cb_config)
            circuit_state = circuit.state

            if not circuit.should_allow_request():
                self.metrics.circuit_breaker_rejections += 1

                self.logger.warning(
                    "Circuit breaker rejected request",
                    node_id=node.node_id,
                    circuit_id=circuit_id,
                    circuit_state=circuit_state.value,
                )

                if fallback:
                    self.metrics.fallback_invocations += 1
                    fallback_used = True
                    execution_time = (
                        datetime.now(timezone.utc) - start_time
                    ).total_seconds() * 1000

                    return DispatchResult(
                        node_result=fallback,
                        category=category,
                        circuit_state=circuit_state,
                        execution_time_ms=execution_time,
                        fallback_used=True,
                    )

                # No fallback - return circuit breaker error
                execution_time = (
                    datetime.now(timezone.utc) - start_time
                ).total_seconds() * 1000

                self.metrics.failed_dispatches += 1

                return DispatchResult(
                    node_result=NodeResult.failed(
                        f"Circuit breaker open for {circuit_id}",
                        {"circuit_state": circuit_state.value},
                    ),
                    category=category,
                    circuit_state=circuit_state,
                    execution_time_ms=execution_time,
                )

        # Execute with retry policy
        if self.use_retry:
            retry_policy = self.get_retry_policy(category)
            self.metrics.retry_operations += 1

            async def execute_fn():
                return await node.execute(context)

            retry_result = await retry_policy.execute(
                execute_fn,
                context={
                    "node_id": node.node_id,
                    "node_type": node.node_type,
                    "workspace_id": context.workspace_id,
                },
            )

            retry_attempts = retry_result.attempts
            total_retry_delay = retry_result.total_delay

            if retry_result.success:
                node_result = retry_result.value
            else:
                node_result = NodeResult.failed(
                    str(retry_result.error),
                    {
                        "error_type": (
                            retry_result.error_type.value
                            if retry_result.error_type
                            else None
                        ),
                        "retry_attempts": retry_attempts,
                    },
                )
        else:
            # Execute without retry
            try:
                node_result = await node.execute(context)
                retry_attempts = 1
            except Exception as e:
                node_result = NodeResult.failed(str(e))
                retry_attempts = 1

        # Record circuit breaker result
        if self.use_circuit_breaker and is_flag_enabled(
            FeatureFlag.USE_CIRCUIT_BREAKER, context.workspace_id
        ):
            if node_result.success:
                self.circuit_registry.record_success(circuit_id)
            else:
                self.circuit_registry.record_failure(circuit_id)

            # Refresh circuit state
            circuit = self.circuit_registry.get_circuit(circuit_id)
            circuit_state = circuit.state

        execution_time = (
            datetime.now(timezone.utc) - start_time
        ).total_seconds() * 1000

        if node_result.success:
            self.metrics.successful_dispatches += 1
        else:
            self.metrics.failed_dispatches += 1

        self.logger.info(
            "Node dispatch complete",
            node_id=node.node_id,
            node_type=node.node_type,
            success=node_result.success,
            retry_attempts=retry_attempts,
            execution_time_ms=execution_time,
            circuit_state=circuit_state.value if circuit_state else None,
        )

        return DispatchResult(
            node_result=node_result,
            category=category,
            circuit_state=circuit_state,
            retry_attempts=retry_attempts,
            total_retry_delay=total_retry_delay,
            execution_time_ms=execution_time,
            fallback_used=fallback_used,
        )

    def get_metrics(self) -> dict[str, Any]:
        """Get dispatch metrics.

        Returns:
            Dict of metrics.
        """
        return {
            "total_dispatches": self.metrics.total_dispatches,
            "successful_dispatches": self.metrics.successful_dispatches,
            "failed_dispatches": self.metrics.failed_dispatches,
            "circuit_breaker_rejections": self.metrics.circuit_breaker_rejections,
            "retry_operations": self.metrics.retry_operations,
            "fallback_invocations": self.metrics.fallback_invocations,
            "success_rate": (
                self.metrics.successful_dispatches / self.metrics.total_dispatches
                if self.metrics.total_dispatches > 0
                else 0.0
            ),
            "by_category": {
                k.value: v for k, v in self.metrics.by_category.items()
            },
            "by_node_type": self.metrics.by_node_type,
        }

    def reset_metrics(self) -> None:
        """Reset dispatch metrics."""
        self.metrics = DispatchMetrics()


# Singleton instance
_node_dispatcher: NodeDispatcher | None = None


def get_node_dispatcher() -> NodeDispatcher:
    """Get the global NodeDispatcher instance.

    Returns:
        NodeDispatcher instance.
    """
    global _node_dispatcher
    if _node_dispatcher is None:
        _node_dispatcher = NodeDispatcher()
    return _node_dispatcher


async def dispatch_node(
    node: BaseNode,
    context: NodeContext,
    fallback: NodeResult | None = None,
) -> DispatchResult:
    """Convenience function to dispatch a node.

    Args:
        node: Node to execute.
        context: Execution context.
        fallback: Optional fallback result.

    Returns:
        DispatchResult.
    """
    dispatcher = get_node_dispatcher()
    return await dispatcher.execute_node(node, context, fallback)
