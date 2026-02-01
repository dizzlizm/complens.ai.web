"""API response helper functions."""

import json
import os
from datetime import datetime
from typing import Any

from pydantic import BaseModel as PydanticBaseModel

# Get allowed CORS origin from environment
# Defaults to dev.complens.ai, localhost allowed in dev
_ALLOWED_ORIGIN = os.environ.get("CORS_ALLOWED_ORIGIN", "https://dev.complens.ai")
_STAGE = os.environ.get("STAGE", "dev")


def _get_cors_origin(request_origin: str | None = None) -> str:
    """Get the appropriate CORS origin for the response.

    In dev, also allows localhost for local development.
    """
    # In dev, allow localhost origins for local development
    if _STAGE == "dev" and request_origin:
        if request_origin.startswith("http://localhost:"):
            return request_origin

    return _ALLOWED_ORIGIN


def get_cors_headers(request_origin: str | None = None) -> dict:
    """Get CORS headers with the appropriate origin."""
    return {
        "Access-Control-Allow-Origin": _get_cors_origin(request_origin),
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Amz-Date,X-Api-Key,X-Amz-Security-Token",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
        "Access-Control-Allow-Credentials": "true",
        "Content-Type": "application/json",
    }


# Default CORS headers (backwards compatible)
CORS_HEADERS = get_cors_headers()


def _json_serializer(obj: Any) -> Any:
    """JSON serializer for objects not serializable by default."""
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, PydanticBaseModel):
        return obj.model_dump(mode="json")
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _serialize(data: Any) -> str:
    """Serialize data to JSON string."""
    return json.dumps(data, default=_json_serializer)


def success(data: Any, status_code: int = 200) -> dict:
    """Create a successful API response.

    Args:
        data: Response data (dict, list, or Pydantic model).
        status_code: HTTP status code (default 200).

    Returns:
        API Gateway response dict.
    """
    if isinstance(data, PydanticBaseModel):
        body = data.model_dump(mode="json")
    else:
        body = data

    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": _serialize(body),
    }


def created(data: Any) -> dict:
    """Create a 201 Created response.

    Args:
        data: The created resource.

    Returns:
        API Gateway response dict.
    """
    return success(data, status_code=201)


def no_content() -> dict:
    """Create a 204 No Content response.

    Returns:
        API Gateway response dict.
    """
    return {
        "statusCode": 204,
        "headers": CORS_HEADERS,
        "body": "",
    }


def error(
    message: str,
    status_code: int = 500,
    error_code: str | None = None,
    details: dict | None = None,
) -> dict:
    """Create an error API response.

    Args:
        message: Error message.
        status_code: HTTP status code.
        error_code: Machine-readable error code.
        details: Additional error details.

    Returns:
        API Gateway response dict.
    """
    body: dict[str, Any] = {
        "error": True,
        "message": message,
    }

    if error_code:
        body["error_code"] = error_code
    if details:
        body["details"] = details

    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": _serialize(body),
    }


def validation_error(errors: list[dict]) -> dict:
    """Create a validation error response.

    Args:
        errors: List of validation errors with field and message.

    Returns:
        API Gateway response dict.
    """
    return error(
        message="Validation failed",
        status_code=400,
        error_code="VALIDATION_ERROR",
        details={"errors": errors},
    )


def not_found(resource_type: str, resource_id: str) -> dict:
    """Create a 404 Not Found response.

    Args:
        resource_type: Type of resource (e.g., "Contact").
        resource_id: ID of the resource.

    Returns:
        API Gateway response dict.
    """
    return error(
        message=f"{resource_type} with ID '{resource_id}' not found",
        status_code=404,
        error_code="NOT_FOUND",
        details={"resource_type": resource_type, "resource_id": resource_id},
    )


def unauthorized(message: str = "Authentication required") -> dict:
    """Create a 401 Unauthorized response.

    Args:
        message: Error message.

    Returns:
        API Gateway response dict.
    """
    return error(
        message=message,
        status_code=401,
        error_code="UNAUTHORIZED",
    )


def forbidden(message: str = "You don't have permission to perform this action") -> dict:
    """Create a 403 Forbidden response.

    Args:
        message: Error message.

    Returns:
        API Gateway response dict.
    """
    return error(
        message=message,
        status_code=403,
        error_code="FORBIDDEN",
    )


def conflict(message: str = "Resource conflict") -> dict:
    """Create a 409 Conflict response.

    Args:
        message: Error message.

    Returns:
        API Gateway response dict.
    """
    return error(
        message=message,
        status_code=409,
        error_code="CONFLICT",
    )


def paginated(
    items: list[Any],
    total: int,
    page: int = 1,
    page_size: int = 20,
    next_cursor: str | None = None,
) -> dict:
    """Create a paginated response.

    Args:
        items: List of items for current page.
        total: Total number of items.
        page: Current page number.
        page_size: Items per page.
        next_cursor: Cursor for next page (for cursor-based pagination).

    Returns:
        API Gateway response dict.
    """
    body = {
        "items": items,
        "pagination": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 0,
        },
    }

    if next_cursor:
        body["pagination"]["next_cursor"] = next_cursor

    return success(body)
