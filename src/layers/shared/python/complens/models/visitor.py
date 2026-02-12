"""Visitor model for anonymous visitor tracking.

Tracks visitors from first page view through conversion, capturing
attribution data (referrer, UTMs), behavior (pages viewed, chat messages),
and linking to Contact records on form conversion.

DynamoDB keys:
    PK: WS#{workspace_id}
    SK: VISITOR#{visitor_id}
"""

from pydantic import Field

from complens.models.base import BaseModel


class Visitor(BaseModel):
    """Anonymous visitor tracked via first-party cookie.

    Created on first page view, linked to a Contact on form conversion.
    """

    workspace_id: str
    visitor_id: str  # v_xxxxxxxxx from cookie/localStorage

    # Linked contact (set on form conversion)
    contact_id: str | None = None

    # Attribution (first-touch, never overwritten after initial set)
    first_referrer: str | None = None
    first_utm_source: str | None = None
    first_utm_medium: str | None = None
    first_utm_campaign: str | None = None
    first_utm_content: str | None = None
    first_utm_term: str | None = None
    first_page_id: str | None = None

    # Latest visit (updated on every page view)
    last_referrer: str | None = None
    last_page_id: str | None = None
    last_seen: str | None = None  # ISO timestamp

    # Device info (from first visit)
    user_agent: str | None = None
    ip: str | None = None

    # Engagement counters
    total_page_views: int = 0
    total_chat_messages: int = 0
    total_form_submissions: int = 0

    # Pages visited (list of page_ids, capped at 50)
    pages_visited: list[str] = Field(default_factory=list)

    def get_pk(self) -> str:
        """Get the partition key."""
        return f"WS#{self.workspace_id}"

    def get_sk(self) -> str:
        """Get the sort key."""
        return f"VISITOR#{self.visitor_id}"
