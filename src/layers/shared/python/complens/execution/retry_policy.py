"""Retry policy with exponential backoff and jitter.

Provides configurable retry strategies for node execution with:
- Exponential backoff to prevent thundering herd
- Jitter to distribute retry attempts
- Classification of transient vs permanent errors
- Integration with circuit breaker

Usage:
    policy = RetryPolicy()

    async def my_operation():
        return await external_api_call()

    result = await policy.execute(my_operation)
"""

import asyncio
import random
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, TypeVar

import structlog

logger = structlog.get_logger()

T = TypeVar("T")


class ErrorType(str, Enum):
    """Classification of error types for retry decisions."""

    TRANSIENT = "transient"  # Temporary failure, retry likely to succeed
    RECOVERABLE = "recoverable"  # Can be fixed automatically
    PERMANENT = "permanent"  # Won't succeed on retry


class RetryStrategy(str, Enum):
    """Retry strategy types."""

    EXPONENTIAL = "exponential"  # Exponential backoff
    LINEAR = "linear"  # Linear backoff
    CONSTANT = "constant"  # Fixed delay
    FIBONACCI = "fibonacci"  # Fibonacci sequence delays


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""

    max_retries: int = 3
    base_delay: float = 1.0  # Base delay in seconds
    max_delay: float = 60.0  # Maximum delay cap
    jitter_factor: float = 0.25  # Random jitter (0-1)
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL
    exponential_base: float = 2.0  # For exponential backoff

    # Error handling
    retry_on: list[type[Exception]] | None = None  # Exceptions to retry
    dont_retry_on: list[type[Exception]] | None = None  # Exceptions to not retry

    # Specific error patterns
    transient_errors: list[str] = field(default_factory=lambda: [
        "timeout",
        "throttle",
        "rate limit",
        "service unavailable",
        "too many requests",
        "connection reset",
        "temporary failure",
        "try again",
    ])

    permanent_errors: list[str] = field(default_factory=lambda: [
        "invalid credentials",
        "unauthorized",
        "forbidden",
        "not found",
        "invalid request",
        "bad request",
        "invalid format",
        "validation error",
    ])


@dataclass
class RetryResult:
    """Result of a retry operation."""

    success: bool
    value: Any = None
    error: Exception | None = None
    attempts: int = 0
    total_delay: float = 0.0
    error_type: ErrorType | None = None


@dataclass
class RetryMetrics:
    """Metrics for retry operations."""

    total_attempts: int = 0
    successful_attempts: int = 0
    failed_attempts: int = 0
    total_delay_seconds: float = 0.0
    retries_by_type: dict[ErrorType, int] = field(default_factory=dict)


class RetryPolicy:
    """Configurable retry policy with backoff strategies.

    Supports multiple backoff strategies and error classification
    to intelligently decide when to retry operations.

    Example:
        policy = RetryPolicy(RetryConfig(
            max_retries=5,
            base_delay=0.5,
            strategy=RetryStrategy.EXPONENTIAL,
        ))

        result = await policy.execute(async_operation)
        if result.success:
            print(f"Success after {result.attempts} attempts")
        else:
            print(f"Failed: {result.error}")
    """

    def __init__(self, config: RetryConfig | None = None):
        """Initialize retry policy.

        Args:
            config: Retry configuration.
        """
        self.config = config or RetryConfig()
        self.metrics = RetryMetrics()
        self.logger = logger.bind(service="retry_policy")

        # Precompute fibonacci sequence for fibonacci strategy
        self._fibonacci_cache: list[float] = [1, 1]

    async def execute(
        self,
        func: Callable[[], T],
        context: dict[str, Any] | None = None,
    ) -> RetryResult:
        """Execute a function with retry logic.

        Args:
            func: Async function to execute.
            context: Optional context for logging.

        Returns:
            RetryResult with outcome.
        """
        attempts = 0
        total_delay = 0.0
        last_error: Exception | None = None
        last_error_type: ErrorType | None = None

        while attempts <= self.config.max_retries:
            attempts += 1
            self.metrics.total_attempts += 1

            try:
                # Execute the function
                if asyncio.iscoroutinefunction(func):
                    result = await func()
                else:
                    result = func()

                self.metrics.successful_attempts += 1

                self.logger.debug(
                    "Operation succeeded",
                    attempts=attempts,
                    total_delay=total_delay,
                    **(context or {}),
                )

                return RetryResult(
                    success=True,
                    value=result,
                    attempts=attempts,
                    total_delay=total_delay,
                )

            except Exception as e:
                last_error = e
                last_error_type = self._classify_error(e)
                self.metrics.retries_by_type[last_error_type] = (
                    self.metrics.retries_by_type.get(last_error_type, 0) + 1
                )

                # Check if we should retry this error
                if not self._should_retry(e, last_error_type, attempts):
                    self.metrics.failed_attempts += 1

                    self.logger.warning(
                        "Operation failed permanently",
                        error=str(e),
                        error_type=last_error_type.value,
                        attempts=attempts,
                        **(context or {}),
                    )

                    return RetryResult(
                        success=False,
                        error=e,
                        attempts=attempts,
                        total_delay=total_delay,
                        error_type=last_error_type,
                    )

                # Calculate delay for next attempt
                delay = self._calculate_delay(attempts)
                total_delay += delay

                self.logger.info(
                    "Retrying operation",
                    error=str(e),
                    error_type=last_error_type.value,
                    attempt=attempts,
                    next_delay=delay,
                    **(context or {}),
                )

                await asyncio.sleep(delay)

        # Exhausted all retries
        self.metrics.failed_attempts += 1
        self.metrics.total_delay_seconds += total_delay

        self.logger.warning(
            "Operation failed after max retries",
            error=str(last_error),
            error_type=last_error_type.value if last_error_type else None,
            attempts=attempts,
            total_delay=total_delay,
            **(context or {}),
        )

        return RetryResult(
            success=False,
            error=last_error,
            attempts=attempts,
            total_delay=total_delay,
            error_type=last_error_type,
        )

    def _classify_error(self, error: Exception) -> ErrorType:
        """Classify an error as transient, recoverable, or permanent.

        Args:
            error: Exception to classify.

        Returns:
            ErrorType classification.
        """
        error_str = str(error).lower()
        error_class = type(error).__name__.lower()

        # Check permanent error patterns first
        for pattern in self.config.permanent_errors:
            if pattern in error_str or pattern in error_class:
                return ErrorType.PERMANENT

        # Check transient error patterns
        for pattern in self.config.transient_errors:
            if pattern in error_str or pattern in error_class:
                return ErrorType.TRANSIENT

        # Check specific exception types
        if isinstance(error, (TimeoutError, asyncio.TimeoutError)):
            return ErrorType.TRANSIENT

        if isinstance(error, (ConnectionError, ConnectionResetError)):
            return ErrorType.TRANSIENT

        if isinstance(error, (ValueError, TypeError, KeyError)):
            return ErrorType.PERMANENT

        # Default to transient for unknown errors
        return ErrorType.TRANSIENT

    def _should_retry(
        self,
        error: Exception,
        error_type: ErrorType,
        attempts: int,
    ) -> bool:
        """Determine if an error should be retried.

        Args:
            error: Exception that occurred.
            error_type: Classified error type.
            attempts: Current attempt number.

        Returns:
            True if should retry.
        """
        # Check max retries
        if attempts >= self.config.max_retries:
            return False

        # Never retry permanent errors
        if error_type == ErrorType.PERMANENT:
            return False

        # Check explicit exception lists
        if self.config.dont_retry_on:
            for exc_type in self.config.dont_retry_on:
                if isinstance(error, exc_type):
                    return False

        if self.config.retry_on:
            for exc_type in self.config.retry_on:
                if isinstance(error, exc_type):
                    return True
            return False  # Not in whitelist

        # Default: retry transient and recoverable errors
        return error_type in (ErrorType.TRANSIENT, ErrorType.RECOVERABLE)

    def _calculate_delay(self, attempt: int) -> float:
        """Calculate delay before next retry.

        Args:
            attempt: Current attempt number (1-indexed).

        Returns:
            Delay in seconds.
        """
        # Calculate base delay based on strategy
        if self.config.strategy == RetryStrategy.EXPONENTIAL:
            delay = self.config.base_delay * (
                self.config.exponential_base ** (attempt - 1)
            )

        elif self.config.strategy == RetryStrategy.LINEAR:
            delay = self.config.base_delay * attempt

        elif self.config.strategy == RetryStrategy.CONSTANT:
            delay = self.config.base_delay

        elif self.config.strategy == RetryStrategy.FIBONACCI:
            delay = self.config.base_delay * self._get_fibonacci(attempt)

        else:
            delay = self.config.base_delay

        # Apply jitter
        if self.config.jitter_factor > 0:
            jitter_range = delay * self.config.jitter_factor
            jitter = random.uniform(-jitter_range, jitter_range)
            delay += jitter

        # Clamp to max delay
        delay = min(delay, self.config.max_delay)
        delay = max(delay, 0)  # Ensure non-negative

        return delay

    def _get_fibonacci(self, n: int) -> float:
        """Get the nth fibonacci number.

        Args:
            n: Index (1-indexed).

        Returns:
            Fibonacci number.
        """
        # Extend cache if needed
        while len(self._fibonacci_cache) < n:
            self._fibonacci_cache.append(
                self._fibonacci_cache[-1] + self._fibonacci_cache[-2]
            )

        return self._fibonacci_cache[n - 1]

    def get_metrics(self) -> dict[str, Any]:
        """Get retry metrics.

        Returns:
            Dict of metrics.
        """
        return {
            "total_attempts": self.metrics.total_attempts,
            "successful_attempts": self.metrics.successful_attempts,
            "failed_attempts": self.metrics.failed_attempts,
            "total_delay_seconds": self.metrics.total_delay_seconds,
            "success_rate": (
                self.metrics.successful_attempts / self.metrics.total_attempts
                if self.metrics.total_attempts > 0
                else 0.0
            ),
            "retries_by_type": {
                k.value: v for k, v in self.metrics.retries_by_type.items()
            },
        }


# Preset configurations for common scenarios
RETRY_CONFIGS = {
    "default": RetryConfig(
        max_retries=3,
        base_delay=1.0,
        strategy=RetryStrategy.EXPONENTIAL,
    ),
    "aggressive": RetryConfig(
        max_retries=5,
        base_delay=0.5,
        max_delay=30.0,
        strategy=RetryStrategy.EXPONENTIAL,
    ),
    "gentle": RetryConfig(
        max_retries=2,
        base_delay=2.0,
        max_delay=10.0,
        strategy=RetryStrategy.LINEAR,
    ),
    "api": RetryConfig(
        max_retries=3,
        base_delay=1.0,
        max_delay=30.0,
        jitter_factor=0.5,
        strategy=RetryStrategy.EXPONENTIAL,
        transient_errors=[
            "timeout",
            "throttle",
            "rate limit",
            "429",
            "503",
            "502",
            "504",
            "connection reset",
        ],
    ),
    "messaging": RetryConfig(
        max_retries=4,
        base_delay=2.0,
        max_delay=60.0,
        jitter_factor=0.3,
        strategy=RetryStrategy.EXPONENTIAL,
        transient_errors=[
            "timeout",
            "throttle",
            "rate limit",
            "queue full",
            "temporary failure",
        ],
    ),
}


def get_retry_policy(preset: str = "default") -> RetryPolicy:
    """Get a retry policy with a preset configuration.

    Args:
        preset: Name of the preset (default, aggressive, gentle, api, messaging).

    Returns:
        RetryPolicy instance.
    """
    config = RETRY_CONFIGS.get(preset, RETRY_CONFIGS["default"])
    return RetryPolicy(config)


async def with_retry(
    func: Callable[[], T],
    config: RetryConfig | None = None,
    context: dict[str, Any] | None = None,
) -> T:
    """Execute a function with retry logic.

    Convenience function for one-off retries.

    Args:
        func: Function to execute.
        config: Optional retry configuration.
        context: Optional context for logging.

    Returns:
        Function result.

    Raises:
        Exception: The last error if all retries fail.
    """
    policy = RetryPolicy(config)
    result = await policy.execute(func, context)

    if result.success:
        return result.value

    raise result.error
