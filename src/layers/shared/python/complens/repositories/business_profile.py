"""Business Profile repository for DynamoDB operations."""

from datetime import datetime, timezone

import structlog

from complens.models.business_profile import BusinessProfile
from complens.repositories.base import BaseRepository

logger = structlog.get_logger()


class BusinessProfileRepository(BaseRepository[BusinessProfile]):
    """Repository for business profile operations.

    Supports both workspace-level profiles and page-specific profiles.
    Page-specific profiles override workspace profiles when present.
    """

    def __init__(self, table_name: str | None = None):
        """Initialize business profile repository."""
        super().__init__(BusinessProfile, table_name)

    def get_by_site(self, workspace_id: str, site_id: str) -> BusinessProfile | None:
        """Get the business profile for a specific site.

        Args:
            workspace_id: The workspace ID.
            site_id: The site ID.

        Returns:
            The site-specific profile, or None if not found.
        """
        return self.get(pk=f"WS#{workspace_id}", sk=f"PROFILE#SITE#{site_id}")

    def get_by_page(self, workspace_id: str, page_id: str) -> BusinessProfile | None:
        """Get the business profile for a specific page.

        Args:
            workspace_id: The workspace ID.
            page_id: The page ID.

        Returns:
            The page-specific profile, or None if not found.
        """
        return self.get(pk=f"WS#{workspace_id}", sk=f"PROFILE#PAGE#{page_id}")

    def get_by_workspace(self, workspace_id: str) -> BusinessProfile | None:
        """Get the workspace-level business profile.

        Args:
            workspace_id: The workspace ID.

        Returns:
            The workspace profile, or None if not found.
        """
        return self.get(pk=f"WS#{workspace_id}", sk="BUSINESS_PROFILE")

    def get_effective_profile(
        self,
        workspace_id: str,
        page_id: str | None = None,
        site_id: str | None = None,
    ) -> BusinessProfile | None:
        """Get the effective profile for a context.

        Cascade order: page profile -> site profile -> workspace profile.
        Returns the most specific profile available.

        Args:
            workspace_id: The workspace ID.
            page_id: Optional page ID for page-specific lookup.
            site_id: Optional site ID for site-specific lookup.

        Returns:
            The most specific profile available, or None.
        """
        if page_id:
            profile = self.get_by_page(workspace_id, page_id)
            if profile:
                return profile
        if site_id:
            profile = self.get_by_site(workspace_id, site_id)
            if profile:
                return profile
        return self.get_by_workspace(workspace_id)

    def create_profile(
        self, profile: BusinessProfile, page_id: str | None = None
    ) -> BusinessProfile:
        """Create a new business profile.

        Args:
            profile: The profile to create.
            page_id: Optional page ID for page-specific profile.

        Returns:
            The created profile.
        """
        if page_id:
            profile.page_id = page_id

        # Calculate initial score
        profile.calculate_profile_score()

        self.put(profile)

        logger.info(
            "Business profile created",
            workspace_id=profile.workspace_id,
            page_id=page_id,
            profile_score=profile.profile_score,
        )

        return profile

    def update_profile(self, profile: BusinessProfile) -> BusinessProfile:
        """Update an existing business profile.

        Args:
            profile: The profile to update.

        Returns:
            The updated profile.
        """
        profile.updated_at = datetime.now(timezone.utc)
        profile.calculate_profile_score()

        self.put(profile)

        logger.info(
            "Business profile updated",
            workspace_id=profile.workspace_id,
            page_id=profile.page_id,
            profile_score=profile.profile_score,
        )

        return profile

    def get_or_create(
        self,
        workspace_id: str,
        page_id: str | None = None,
        site_id: str | None = None,
    ) -> BusinessProfile:
        """Get the business profile, creating one if it doesn't exist.

        Args:
            workspace_id: The workspace ID.
            page_id: Optional page ID for page-specific profile.
            site_id: Optional site ID for site-specific profile.

        Returns:
            The existing or newly created profile.
        """
        # Cascade: page → site → workspace (return most specific available)
        profile = self.get_effective_profile(workspace_id, page_id, site_id)

        if not profile:
            # No profile at any level — create at workspace level
            profile = BusinessProfile(workspace_id=workspace_id)
            profile = self.create_profile(profile)
            logger.info(
                "Created new business profile",
                workspace_id=workspace_id,
            )

        return profile

    def add_conversation_entry(
        self,
        workspace_id: str,
        question: str,
        answer: str,
        field: str | None = None,
        page_id: str | None = None,
    ) -> BusinessProfile:
        """Add a Q&A entry to the conversation history.

        This tracks the onboarding conversation for context.

        Args:
            workspace_id: The workspace ID.
            question: The question that was asked.
            answer: The user's answer.
            field: The profile field this relates to (optional).
            page_id: Optional page ID for page-specific profile.

        Returns:
            The updated profile.
        """
        profile = self.get_or_create(workspace_id, page_id)

        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "question": question,
            "answer": answer,
        }
        if field:
            entry["field"] = field

        profile.conversation_history.append(entry)

        return self.update_profile(profile)

    def delete_profile(
        self,
        workspace_id: str,
        page_id: str | None = None,
        site_id: str | None = None,
    ) -> bool:
        """Delete a business profile.

        Args:
            workspace_id: The workspace ID.
            page_id: Optional page ID for page-specific profile.
            site_id: Optional site ID for site-specific profile.

        Returns:
            True if deleted, False if not found.
        """
        if page_id:
            return self.delete(pk=f"WS#{workspace_id}", sk=f"PROFILE#PAGE#{page_id}")
        if site_id:
            return self.delete(pk=f"WS#{workspace_id}", sk=f"PROFILE#SITE#{site_id}")
        return self.delete(pk=f"WS#{workspace_id}", sk="BUSINESS_PROFILE")
