"""Execution infrastructure for fault-tolerant node processing.

This module provides the components for reliable workflow execution:
- CircuitBreaker: Prevents cascade failures from failing providers
- RetryPolicy: Exponential backoff with jitter for transient errors
- NodeDispatcher: Routes node execution to appropriate handlers
"""

from complens.execution.circuit_breaker import (
    CircuitBreakerConfig,
    CircuitBreakerError,
    CircuitBreakerRegistry,
    CircuitBreakerState,
    CircuitMetrics,
    CircuitState,
    get_circuit_breaker_registry,
    with_circuit_breaker,
)
from complens.execution.node_dispatcher import (
    DispatchMetrics,
    DispatchResult,
    NodeCategory,
    NodeDispatcher,
    dispatch_node,
    get_node_dispatcher,
    NODE_CATEGORIES,
)
from complens.execution.retry_policy import (
    ErrorType,
    RetryConfig,
    RetryMetrics,
    RetryPolicy,
    RetryResult,
    RetryStrategy,
    RETRY_CONFIGS,
    get_retry_policy,
    with_retry,
)
from complens.execution.workflow_classifier import (
    ExecutionType,
    WorkflowAnalysis,
    WorkflowClassifier,
    classify_workflow,
    get_workflow_classifier,
)

__all__ = [
    # Circuit breaker
    "CircuitBreakerConfig",
    "CircuitBreakerError",
    "CircuitBreakerRegistry",
    "CircuitBreakerState",
    "CircuitMetrics",
    "CircuitState",
    "get_circuit_breaker_registry",
    "with_circuit_breaker",
    # Node dispatcher
    "DispatchMetrics",
    "DispatchResult",
    "NodeCategory",
    "NodeDispatcher",
    "NODE_CATEGORIES",
    "dispatch_node",
    "get_node_dispatcher",
    # Retry policy
    "ErrorType",
    "RetryConfig",
    "RetryMetrics",
    "RetryPolicy",
    "RetryResult",
    "RetryStrategy",
    "RETRY_CONFIGS",
    "get_retry_policy",
    "with_retry",
    # Workflow classifier
    "ExecutionType",
    "WorkflowAnalysis",
    "WorkflowClassifier",
    "classify_workflow",
    "get_workflow_classifier",
]
