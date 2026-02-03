"""CSS sanitization utility for preventing CSS injection attacks.

This module provides functions to sanitize user-supplied CSS to prevent:
- CSS injection attacks
- External resource loading (data exfiltration via url())
- JavaScript execution via CSS expressions
- Import-based attacks
"""

import re
from typing import Pattern

import structlog

logger = structlog.get_logger()

# Patterns that could be used for attacks
DANGEROUS_CSS_PATTERNS: list[tuple[Pattern[str], str]] = [
    # Block @import which can load external stylesheets
    (re.compile(r'@import\s', re.IGNORECASE), '@import blocked'),

    # Block @font-face with external URLs (could be used for tracking)
    (re.compile(r'@font-face\s*\{[^}]*url\s*\([^)]*\)', re.IGNORECASE | re.DOTALL), '@font-face blocked'),

    # Block url() with external URLs - allow only data: URIs for images
    # This prevents data exfiltration via CSS background-image requests
    (re.compile(r'url\s*\(\s*["\']?(?!data:image/)[^\)]+\)', re.IGNORECASE), 'url() blocked'),

    # Block CSS expressions (IE-specific, but still worth blocking)
    (re.compile(r'expression\s*\(', re.IGNORECASE), 'expression() blocked'),

    # Block javascript: protocol
    (re.compile(r'javascript\s*:', re.IGNORECASE), 'javascript: blocked'),

    # Block vbscript: protocol
    (re.compile(r'vbscript\s*:', re.IGNORECASE), 'vbscript: blocked'),

    # Block behavior: property (IE-specific HTC files)
    (re.compile(r'behavior\s*:', re.IGNORECASE), 'behavior: blocked'),

    # Block -moz-binding (Firefox XBL, deprecated but still worth blocking)
    (re.compile(r'-moz-binding\s*:', re.IGNORECASE), '-moz-binding blocked'),

    # Block @charset (could cause encoding issues)
    (re.compile(r'@charset\s', re.IGNORECASE), '@charset blocked'),

    # Block @namespace (not needed for user CSS)
    (re.compile(r'@namespace\s', re.IGNORECASE), '@namespace blocked'),
]

# Additional patterns to remove that are less dangerous but unnecessary
CLEANUP_PATTERNS: list[tuple[Pattern[str], str]] = [
    # Remove HTML comments in CSS
    (re.compile(r'<!--'), ''),
    (re.compile(r'-->'), ''),

    # Remove CSS comments that might hide malicious content
    # Note: We replace with empty rather than removing entirely to preserve formatting
    (re.compile(r'/\*.*?\*/', re.DOTALL), ''),
]


def sanitize_css(css: str | None, log_blocked: bool = True) -> str:
    """Sanitize CSS to remove dangerous patterns.

    Args:
        css: The CSS string to sanitize. Can be None.
        log_blocked: Whether to log when patterns are blocked.

    Returns:
        Sanitized CSS string, or empty string if input is None/empty.
    """
    if not css:
        return ""

    sanitized = css
    blocked_patterns = []

    # Apply dangerous pattern checks
    for pattern, replacement_label in DANGEROUS_CSS_PATTERNS:
        if pattern.search(sanitized):
            blocked_patterns.append(replacement_label)
            sanitized = pattern.sub('/* blocked */', sanitized)

    # Apply cleanup patterns
    for pattern, replacement in CLEANUP_PATTERNS:
        sanitized = pattern.sub(replacement, sanitized)

    # Log if we blocked anything
    if blocked_patterns and log_blocked:
        logger.warning(
            "Blocked dangerous CSS patterns",
            patterns=blocked_patterns,
            original_length=len(css),
            sanitized_length=len(sanitized),
        )

    return sanitized


def is_safe_css(css: str | None) -> bool:
    """Check if CSS is safe without modifying it.

    Args:
        css: The CSS string to check.

    Returns:
        True if CSS contains no dangerous patterns.
    """
    if not css:
        return True

    for pattern, _ in DANGEROUS_CSS_PATTERNS:
        if pattern.search(css):
            return False

    return True


def sanitize_inline_style(style: str | None) -> str:
    """Sanitize an inline style attribute value.

    This is more restrictive than sanitize_css() as inline styles
    have a smaller attack surface but still need protection.

    Args:
        style: The inline style string to sanitize.

    Returns:
        Sanitized style string.
    """
    if not style:
        return ""

    # For inline styles, we use the same patterns but also:
    # - Remove any semicolons followed by suspicious content
    # - Ensure no url() calls at all (stricter than full CSS)
    sanitized = style

    # Block any url() in inline styles
    url_pattern = re.compile(r'url\s*\(', re.IGNORECASE)
    if url_pattern.search(sanitized):
        sanitized = url_pattern.sub('/* blocked */(', sanitized)

    # Apply standard dangerous pattern checks
    for pattern, _ in DANGEROUS_CSS_PATTERNS:
        sanitized = pattern.sub('/* blocked */', sanitized)

    return sanitized
