"""Circuit breaker for fault-tolerant node execution.

Implements the Circuit Breaker pattern to prevent cascade failures when
providers or external services experience issues. The circuit breaker
monitors failure rates and temporarily stops requests to failing services.

States:
- CLOSED: Normal operation, requests pass through
- OPEN: Service is failing, requests are rejected immediately
- HALF_OPEN: Testing if service has recovered

Transitions:
- CLOSED → OPEN: After failure_threshold consecutive failures
- OPEN → HALF_OPEN: After recovery_timeout seconds
- HALF_OPEN → CLOSED: After success_threshold consecutive successes
- HALF_OPEN → OPEN: On any failure
"""

import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, TypeVar

import boto3
import structlog
from botocore.exceptions import ClientError

logger = structlog.get_logger()

T = TypeVar("T")


class CircuitState(str, Enum):
    """Circuit breaker states."""

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreakerConfig:
    """Configuration for a circuit breaker."""

    failure_threshold: int = 5  # Failures before opening
    success_threshold: int = 3  # Successes to close from half-open
    recovery_timeout: float = 60.0  # Seconds before trying half-open
    half_open_max_calls: int = 3  # Max concurrent calls in half-open

    # Metrics window
    metrics_window: float = 300.0  # 5 minute window for failure rate
    failure_rate_threshold: float = 0.5  # 50% failure rate triggers open


@dataclass
class CircuitMetrics:
    """Metrics for a circuit breaker."""

    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rejected_calls: int = 0
    consecutive_failures: int = 0
    consecutive_successes: int = 0
    last_failure_time: float | None = None
    last_success_time: float | None = None
    state_changed_at: float = field(default_factory=time.time)

    # Sliding window metrics
    recent_failures: list[float] = field(default_factory=list)
    recent_successes: list[float] = field(default_factory=list)

    def record_success(self) -> None:
        """Record a successful call."""
        now = time.time()
        self.total_calls += 1
        self.successful_calls += 1
        self.consecutive_successes += 1
        self.consecutive_failures = 0
        self.last_success_time = now
        self.recent_successes.append(now)

    def record_failure(self) -> None:
        """Record a failed call."""
        now = time.time()
        self.total_calls += 1
        self.failed_calls += 1
        self.consecutive_failures += 1
        self.consecutive_successes = 0
        self.last_failure_time = now
        self.recent_failures.append(now)

    def record_rejection(self) -> None:
        """Record a rejected call (circuit open)."""
        self.rejected_calls += 1

    def get_failure_rate(self, window: float) -> float:
        """Get failure rate within the specified window.

        Args:
            window: Time window in seconds.

        Returns:
            Failure rate (0.0 to 1.0).
        """
        now = time.time()
        cutoff = now - window

        # Clean up old entries
        self.recent_failures = [t for t in self.recent_failures if t > cutoff]
        self.recent_successes = [t for t in self.recent_successes if t > cutoff]

        total = len(self.recent_failures) + len(self.recent_successes)
        if total == 0:
            return 0.0

        return len(self.recent_failures) / total


@dataclass
class CircuitBreakerState:
    """State of a circuit breaker."""

    circuit_id: str
    state: CircuitState = CircuitState.CLOSED
    config: CircuitBreakerConfig = field(default_factory=CircuitBreakerConfig)
    metrics: CircuitMetrics = field(default_factory=CircuitMetrics)
    half_open_calls: int = 0

    def should_allow_request(self) -> bool:
        """Check if a request should be allowed through.

        Returns:
            True if request should proceed.
        """
        now = time.time()

        if self.state == CircuitState.CLOSED:
            return True

        if self.state == CircuitState.OPEN:
            # Check if recovery timeout has passed
            time_in_open = now - self.metrics.state_changed_at
            if time_in_open >= self.config.recovery_timeout:
                self._transition_to(CircuitState.HALF_OPEN)
                return True
            return False

        if self.state == CircuitState.HALF_OPEN:
            # Allow limited requests in half-open
            if self.half_open_calls < self.config.half_open_max_calls:
                self.half_open_calls += 1
                return True
            return False

        return False

    def record_success(self) -> None:
        """Record a successful request."""
        self.metrics.record_success()

        if self.state == CircuitState.HALF_OPEN:
            if self.metrics.consecutive_successes >= self.config.success_threshold:
                self._transition_to(CircuitState.CLOSED)

    def record_failure(self) -> None:
        """Record a failed request."""
        self.metrics.record_failure()

        if self.state == CircuitState.CLOSED:
            # Check if we should open the circuit
            if self.metrics.consecutive_failures >= self.config.failure_threshold:
                self._transition_to(CircuitState.OPEN)
            # Also check failure rate
            elif self.metrics.get_failure_rate(self.config.metrics_window) >= self.config.failure_rate_threshold:
                if self.metrics.total_calls >= 10:  # Minimum sample size
                    self._transition_to(CircuitState.OPEN)

        elif self.state == CircuitState.HALF_OPEN:
            # Any failure in half-open returns to open
            self._transition_to(CircuitState.OPEN)

    def _transition_to(self, new_state: CircuitState) -> None:
        """Transition to a new state.

        Args:
            new_state: New circuit state.
        """
        old_state = self.state
        self.state = new_state
        self.metrics.state_changed_at = time.time()
        self.half_open_calls = 0

        logger.info(
            "Circuit breaker state transition",
            circuit_id=self.circuit_id,
            old_state=old_state.value,
            new_state=new_state.value,
            consecutive_failures=self.metrics.consecutive_failures,
            consecutive_successes=self.metrics.consecutive_successes,
        )


class CircuitBreakerError(Exception):
    """Raised when circuit is open and request is rejected."""

    def __init__(self, circuit_id: str, state: CircuitState):
        self.circuit_id = circuit_id
        self.state = state
        super().__init__(f"Circuit breaker '{circuit_id}' is {state.value}")


class CircuitBreakerRegistry:
    """Registry for managing multiple circuit breakers.

    Provides circuit breakers per provider/action combination to isolate
    failures between different integrations.

    Example:
        registry = CircuitBreakerRegistry()

        # Get circuit breaker for Twilio SMS
        cb = registry.get_circuit("twilio.send_sms")

        if cb.should_allow_request():
            try:
                result = await execute_action()
                cb.record_success()
            except Exception:
                cb.record_failure()
                raise
        else:
            raise CircuitBreakerError(cb.circuit_id, cb.state)
    """

    def __init__(
        self,
        default_config: CircuitBreakerConfig | None = None,
        use_dynamodb: bool | None = None,
        table_name: str | None = None,
    ):
        """Initialize the circuit breaker registry.

        Args:
            default_config: Default configuration for new circuit breakers.
            use_dynamodb: Whether to persist state to DynamoDB.
            table_name: DynamoDB table name for persistence.
        """
        self.default_config = default_config or CircuitBreakerConfig()
        self.use_dynamodb = use_dynamodb if use_dynamodb is not None else (
            os.environ.get("CIRCUIT_BREAKER_USE_DYNAMODB", "false").lower() == "true"
        )
        self.table_name = table_name or os.environ.get(
            "CIRCUIT_BREAKER_TABLE_NAME", "complens-circuit-breakers"
        )

        self._circuits: dict[str, CircuitBreakerState] = {}
        self._dynamodb = None
        self.logger = logger.bind(service="circuit_breaker_registry")

    @property
    def dynamodb(self):
        """Get DynamoDB resource (lazy initialization)."""
        if self._dynamodb is None:
            self._dynamodb = boto3.resource("dynamodb")
        return self._dynamodb

    def get_circuit(
        self,
        circuit_id: str,
        config: CircuitBreakerConfig | None = None,
    ) -> CircuitBreakerState:
        """Get or create a circuit breaker.

        Args:
            circuit_id: Unique identifier (e.g., "twilio.send_sms").
            config: Optional custom configuration.

        Returns:
            CircuitBreakerState instance.
        """
        if circuit_id not in self._circuits:
            # Try to load from DynamoDB
            if self.use_dynamodb:
                state = self._load_from_dynamodb(circuit_id)
                if state:
                    self._circuits[circuit_id] = state
                    return state

            # Create new circuit breaker
            self._circuits[circuit_id] = CircuitBreakerState(
                circuit_id=circuit_id,
                config=config or self.default_config,
            )

        return self._circuits[circuit_id]

    def get_circuit_for_provider(
        self,
        provider_id: str,
        action_id: str,
        config: CircuitBreakerConfig | None = None,
    ) -> CircuitBreakerState:
        """Get circuit breaker for a provider action.

        Args:
            provider_id: Provider identifier.
            action_id: Action identifier.
            config: Optional custom configuration.

        Returns:
            CircuitBreakerState instance.
        """
        circuit_id = f"{provider_id}.{action_id}"
        return self.get_circuit(circuit_id, config)

    def record_success(self, circuit_id: str) -> None:
        """Record a successful request.

        Args:
            circuit_id: Circuit identifier.
        """
        if circuit_id in self._circuits:
            circuit = self._circuits[circuit_id]
            circuit.record_success()

            if self.use_dynamodb:
                self._save_to_dynamodb(circuit)

    def record_failure(self, circuit_id: str) -> None:
        """Record a failed request.

        Args:
            circuit_id: Circuit identifier.
        """
        if circuit_id in self._circuits:
            circuit = self._circuits[circuit_id]
            circuit.record_failure()

            if self.use_dynamodb:
                self._save_to_dynamodb(circuit)

    def is_open(self, circuit_id: str) -> bool:
        """Check if a circuit is open.

        Args:
            circuit_id: Circuit identifier.

        Returns:
            True if circuit is open.
        """
        if circuit_id not in self._circuits:
            return False
        return self._circuits[circuit_id].state == CircuitState.OPEN

    def reset_circuit(self, circuit_id: str) -> None:
        """Reset a circuit breaker to closed state.

        Args:
            circuit_id: Circuit identifier.
        """
        if circuit_id in self._circuits:
            circuit = self._circuits[circuit_id]
            circuit.state = CircuitState.CLOSED
            circuit.metrics = CircuitMetrics()
            circuit.half_open_calls = 0

            self.logger.info(
                "Circuit breaker manually reset",
                circuit_id=circuit_id,
            )

            if self.use_dynamodb:
                self._save_to_dynamodb(circuit)

    def get_all_circuits(self) -> dict[str, dict[str, Any]]:
        """Get status of all circuit breakers.

        Returns:
            Dict of circuit statuses.
        """
        return {
            circuit_id: {
                "state": circuit.state.value,
                "metrics": {
                    "total_calls": circuit.metrics.total_calls,
                    "successful_calls": circuit.metrics.successful_calls,
                    "failed_calls": circuit.metrics.failed_calls,
                    "rejected_calls": circuit.metrics.rejected_calls,
                    "consecutive_failures": circuit.metrics.consecutive_failures,
                    "consecutive_successes": circuit.metrics.consecutive_successes,
                    "failure_rate": circuit.metrics.get_failure_rate(
                        circuit.config.metrics_window
                    ),
                },
                "config": {
                    "failure_threshold": circuit.config.failure_threshold,
                    "success_threshold": circuit.config.success_threshold,
                    "recovery_timeout": circuit.config.recovery_timeout,
                },
            }
            for circuit_id, circuit in self._circuits.items()
        }

    def _load_from_dynamodb(self, circuit_id: str) -> CircuitBreakerState | None:
        """Load circuit state from DynamoDB.

        Args:
            circuit_id: Circuit identifier.

        Returns:
            CircuitBreakerState or None if not found.
        """
        try:
            table = self.dynamodb.Table(self.table_name)
            response = table.get_item(
                Key={"PK": f"CIRCUIT#{circuit_id}", "SK": "STATE"},
            )
            item = response.get("Item")

            if not item:
                return None

            config = CircuitBreakerConfig(
                failure_threshold=int(item.get("failure_threshold", 5)),
                success_threshold=int(item.get("success_threshold", 3)),
                recovery_timeout=float(item.get("recovery_timeout", 60.0)),
            )

            metrics = CircuitMetrics(
                total_calls=int(item.get("total_calls", 0)),
                successful_calls=int(item.get("successful_calls", 0)),
                failed_calls=int(item.get("failed_calls", 0)),
                rejected_calls=int(item.get("rejected_calls", 0)),
                consecutive_failures=int(item.get("consecutive_failures", 0)),
                consecutive_successes=int(item.get("consecutive_successes", 0)),
                state_changed_at=float(item.get("state_changed_at", time.time())),
            )

            return CircuitBreakerState(
                circuit_id=circuit_id,
                state=CircuitState(item.get("state", "closed")),
                config=config,
                metrics=metrics,
            )

        except ClientError as e:
            self.logger.warning(
                "Failed to load circuit from DynamoDB",
                circuit_id=circuit_id,
                error=str(e),
            )
            return None

    def _save_to_dynamodb(self, circuit: CircuitBreakerState) -> None:
        """Save circuit state to DynamoDB.

        Args:
            circuit: Circuit state to save.
        """
        try:
            table = self.dynamodb.Table(self.table_name)
            table.put_item(
                Item={
                    "PK": f"CIRCUIT#{circuit.circuit_id}",
                    "SK": "STATE",
                    "circuit_id": circuit.circuit_id,
                    "state": circuit.state.value,
                    "failure_threshold": circuit.config.failure_threshold,
                    "success_threshold": circuit.config.success_threshold,
                    "recovery_timeout": str(circuit.config.recovery_timeout),
                    "total_calls": circuit.metrics.total_calls,
                    "successful_calls": circuit.metrics.successful_calls,
                    "failed_calls": circuit.metrics.failed_calls,
                    "rejected_calls": circuit.metrics.rejected_calls,
                    "consecutive_failures": circuit.metrics.consecutive_failures,
                    "consecutive_successes": circuit.metrics.consecutive_successes,
                    "state_changed_at": str(circuit.metrics.state_changed_at),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            )
        except ClientError as e:
            self.logger.warning(
                "Failed to save circuit to DynamoDB",
                circuit_id=circuit.circuit_id,
                error=str(e),
            )


# Singleton instance
_circuit_breaker_registry: CircuitBreakerRegistry | None = None


def get_circuit_breaker_registry() -> CircuitBreakerRegistry:
    """Get the global CircuitBreakerRegistry instance.

    Returns:
        CircuitBreakerRegistry instance.
    """
    global _circuit_breaker_registry
    if _circuit_breaker_registry is None:
        _circuit_breaker_registry = CircuitBreakerRegistry()
    return _circuit_breaker_registry


async def with_circuit_breaker(
    circuit_id: str,
    func: Callable[[], T],
    fallback: Callable[[], T] | None = None,
) -> T:
    """Execute a function with circuit breaker protection.

    Args:
        circuit_id: Circuit identifier.
        func: Function to execute.
        fallback: Optional fallback function when circuit is open.

    Returns:
        Function result or fallback result.

    Raises:
        CircuitBreakerError: If circuit is open and no fallback provided.
    """
    registry = get_circuit_breaker_registry()
    circuit = registry.get_circuit(circuit_id)

    if not circuit.should_allow_request():
        circuit.metrics.record_rejection()
        if fallback:
            return fallback()
        raise CircuitBreakerError(circuit_id, circuit.state)

    try:
        result = await func() if callable(func) else func
        circuit.record_success()
        return result
    except Exception as e:
        circuit.record_failure()
        raise
