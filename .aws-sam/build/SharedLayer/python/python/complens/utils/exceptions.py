"""Custom exception classes for Complens."""


class ComplensError(Exception):
    """Base exception for all Complens errors."""

    def __init__(
        self,
        message: str,
        error_code: str | None = None,
        status_code: int = 500,
        details: dict | None = None,
    ):
        """Initialize ComplensError.

        Args:
            message: Human-readable error message.
            error_code: Machine-readable error code.
            status_code: HTTP status code for API responses.
            details: Additional error details.
        """
        super().__init__(message)
        self.message = message
        self.error_code = error_code or "INTERNAL_ERROR"
        self.status_code = status_code
        self.details = details or {}

    def to_dict(self) -> dict:
        """Convert exception to dictionary for API response."""
        result = {
            "error": True,
            "error_code": self.error_code,
            "message": self.message,
        }
        if self.details:
            result["details"] = self.details
        return result


class NotFoundError(ComplensError):
    """Raised when a requested resource is not found."""

    def __init__(
        self,
        resource_type: str,
        resource_id: str,
        message: str | None = None,
    ):
        """Initialize NotFoundError.

        Args:
            resource_type: Type of resource (e.g., "Contact", "Workflow").
            resource_id: ID of the resource that was not found.
            message: Optional custom message.
        """
        self.resource_type = resource_type
        self.resource_id = resource_id
        super().__init__(
            message=message or f"{resource_type} with ID '{resource_id}' not found",
            error_code="NOT_FOUND",
            status_code=404,
            details={"resource_type": resource_type, "resource_id": resource_id},
        )


class ValidationError(ComplensError):
    """Raised when input validation fails."""

    def __init__(
        self,
        message: str = "Validation failed",
        errors: list[dict] | None = None,
    ):
        """Initialize ValidationError.

        Args:
            message: Error message.
            errors: List of validation errors with field and message.
        """
        self.errors = errors or []
        super().__init__(
            message=message,
            error_code="VALIDATION_ERROR",
            status_code=400,
            details={"errors": self.errors},
        )

    @classmethod
    def from_pydantic(cls, exc: Exception) -> "ValidationError":
        """Create ValidationError from Pydantic ValidationError."""
        errors = []
        if hasattr(exc, "errors"):
            for error in exc.errors():
                errors.append(
                    {
                        "field": ".".join(str(loc) for loc in error.get("loc", [])),
                        "message": error.get("msg", "Invalid value"),
                        "type": error.get("type", "unknown"),
                    }
                )
        return cls(message="Validation failed", errors=errors)


class UnauthorizedError(ComplensError):
    """Raised when authentication fails."""

    def __init__(self, message: str = "Authentication required"):
        """Initialize UnauthorizedError."""
        super().__init__(
            message=message,
            error_code="UNAUTHORIZED",
            status_code=401,
        )


class ForbiddenError(ComplensError):
    """Raised when user lacks permission for an action."""

    def __init__(
        self,
        message: str = "You don't have permission to perform this action",
        resource_type: str | None = None,
        action: str | None = None,
    ):
        """Initialize ForbiddenError."""
        details = {}
        if resource_type:
            details["resource_type"] = resource_type
        if action:
            details["action"] = action

        super().__init__(
            message=message,
            error_code="FORBIDDEN",
            status_code=403,
            details=details if details else None,
        )


class ConflictError(ComplensError):
    """Raised when there's a conflict (e.g., duplicate, optimistic lock failure)."""

    def __init__(
        self,
        message: str = "Resource conflict",
        conflict_type: str | None = None,
    ):
        """Initialize ConflictError."""
        super().__init__(
            message=message,
            error_code="CONFLICT",
            status_code=409,
            details={"conflict_type": conflict_type} if conflict_type else None,
        )


class RateLimitError(ComplensError):
    """Raised when rate limit is exceeded."""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        retry_after: int | None = None,
    ):
        """Initialize RateLimitError."""
        details = {}
        if retry_after:
            details["retry_after_seconds"] = retry_after

        super().__init__(
            message=message,
            error_code="RATE_LIMIT_EXCEEDED",
            status_code=429,
            details=details if details else None,
        )


class ExternalServiceError(ComplensError):
    """Raised when an external service call fails."""

    def __init__(
        self,
        service: str,
        message: str | None = None,
        original_error: str | None = None,
    ):
        """Initialize ExternalServiceError."""
        super().__init__(
            message=message or f"External service '{service}' returned an error",
            error_code="EXTERNAL_SERVICE_ERROR",
            status_code=502,
            details={
                "service": service,
                "original_error": original_error,
            },
        )
