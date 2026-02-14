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
        Returns the most specific profile that has meaningful data.

        Profiles with score 0 (completely empty) are skipped during cascade
        so they don't shadow a parent profile that has real data.

        Args:
            workspace_id: The workspace ID.
            page_id: Optional page ID for page-specific lookup.
            site_id: Optional site ID for site-specific lookup.

        Returns:
            The most specific non-empty profile available, or None.
        """
        if page_id:
            profile = self.get_by_page(workspace_id, page_id)
            if profile:
                profile.calculate_profile_score()
                if profile.profile_score > 0:
                    return profile
        if site_id:
            profile = self.get_by_site(workspace_id, site_id)
            if profile:
                profile.calculate_profile_score()
                if profile.profile_score > 0:
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
        # Try to get the profile at the exact requested scope first
        exact_profile = None
        if page_id:
            exact_profile = self.get_by_page(workspace_id, page_id)
        elif site_id:
            exact_profile = self.get_by_site(workspace_id, site_id)
        else:
            exact_profile = self.get_by_workspace(workspace_id)

        if exact_profile:
            return exact_profile

        # No profile at the exact scope — create one, seeded from a
        # less-specific profile if available (cascade: site → workspace)
        seed_profile = None
        if page_id or site_id:
            seed_profile = self.get_effective_profile(workspace_id, page_id=None, site_id=site_id if page_id else None)
            if not seed_profile:
                seed_profile = self.get_by_workspace(workspace_id)

        if seed_profile:
            profile_data = seed_profile.model_dump(
                exclude={"id", "page_id", "site_id", "created_at", "updated_at"},
            )
            profile = BusinessProfile(
                **profile_data,
                site_id=site_id if site_id and not page_id else None,
                page_id=page_id,
            )
        else:
            profile = BusinessProfile(
                workspace_id=workspace_id,
                site_id=site_id if site_id and not page_id else None,
                page_id=page_id,
            )

        profile = self.create_profile(profile, page_id=page_id)
        logger.info(
            "Created new business profile",
            workspace_id=workspace_id,
            site_id=site_id,
            page_id=page_id,
            seeded_from=seed_profile.page_id or seed_profile.site_id or "workspace" if seed_profile else None,
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
