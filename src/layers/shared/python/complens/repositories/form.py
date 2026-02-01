"""Form repository for DynamoDB operations."""

from complens.models.form import Form, FormSubmission
from complens.repositories.base import BaseRepository


class FormRepository(BaseRepository[Form]):
    """Repository for Form entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize form repository."""
        super().__init__(Form, table_name)

    def get_by_id(self, workspace_id: str, form_id: str) -> Form | None:
        """Get form by ID.

        Args:
            workspace_id: The workspace ID.
            form_id: The form ID.

        Returns:
            Form or None if not found.
        """
        return self.get(pk=f"WS#{workspace_id}", sk=f"FORM#{form_id}")

    def list_by_workspace(
        self,
        workspace_id: str,
        limit: int = 50,
        last_key: dict | None = None,
    ) -> tuple[list[Form], dict | None]:
        """List forms in a workspace.

        Args:
            workspace_id: The workspace ID.
            limit: Maximum forms to return.
            last_key: Pagination cursor.

        Returns:
            Tuple of (forms, next_page_key).
        """
        return self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="FORM#",
            limit=limit,
            last_key=last_key,
        )

    def create_form(self, form: Form) -> Form:
        """Create a new form.

        Args:
            form: The form to create.

        Returns:
            The created form.
        """
        gsi_keys = form.get_gsi1_keys()
        return self.create(form, gsi_keys=gsi_keys)

    def update_form(self, form: Form) -> Form:
        """Update an existing form.

        Args:
            form: The form to update.

        Returns:
            The updated form.
        """
        gsi_keys = form.get_gsi1_keys()
        return self.update(form, gsi_keys=gsi_keys)

    def delete_form(self, workspace_id: str, form_id: str) -> bool:
        """Delete a form.

        Args:
            workspace_id: The workspace ID.
            form_id: The form ID.

        Returns:
            True if deleted, False if not found.
        """
        return self.delete(pk=f"WS#{workspace_id}", sk=f"FORM#{form_id}")

    def increment_submission_count(self, workspace_id: str, form_id: str) -> None:
        """Increment the submission count for a form.

        Args:
            workspace_id: The workspace ID.
            form_id: The form ID.
        """
        self.table.update_item(
            Key={
                "PK": f"WS#{workspace_id}",
                "SK": f"FORM#{form_id}",
            },
            UpdateExpression="SET submission_count = if_not_exists(submission_count, :zero) + :inc",
            ExpressionAttributeValues={":inc": 1, ":zero": 0},
        )


class FormSubmissionRepository(BaseRepository[FormSubmission]):
    """Repository for FormSubmission entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize form submission repository."""
        super().__init__(FormSubmission, table_name)

    def get_by_id(self, form_id: str, submission_id: str, created_at: str) -> FormSubmission | None:
        """Get submission by ID.

        Args:
            form_id: The form ID.
            submission_id: The submission ID.
            created_at: The creation timestamp (needed for SK).

        Returns:
            FormSubmission or None if not found.
        """
        return self.get(pk=f"FORM#{form_id}", sk=f"SUB#{created_at}#{submission_id}")

    def list_by_form(
        self,
        form_id: str,
        limit: int = 50,
        last_key: dict | None = None,
    ) -> tuple[list[FormSubmission], dict | None]:
        """List submissions for a form.

        Args:
            form_id: The form ID.
            limit: Maximum submissions to return.
            last_key: Pagination cursor.

        Returns:
            Tuple of (submissions, next_page_key).
        """
        return self.query(
            pk=f"FORM#{form_id}",
            sk_begins_with="SUB#",
            limit=limit,
            last_key=last_key,
            scan_forward=False,  # Most recent first
        )

    def list_by_workspace(
        self,
        workspace_id: str,
        limit: int = 50,
        last_key: dict | None = None,
    ) -> tuple[list[FormSubmission], dict | None]:
        """List submissions in a workspace using GSI1.

        Args:
            workspace_id: The workspace ID.
            limit: Maximum submissions to return.
            last_key: Pagination cursor.

        Returns:
            Tuple of (submissions, next_page_key).
        """
        return self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="SUB#",
            index_name="GSI1",
            limit=limit,
            last_key=last_key,
            scan_forward=False,  # Most recent first
        )

    def create_submission(self, submission: FormSubmission) -> FormSubmission:
        """Create a new form submission.

        Args:
            submission: The submission to create.

        Returns:
            The created submission.
        """
        gsi_keys = submission.get_gsi1_keys()
        return self.create(submission, gsi_keys=gsi_keys)

    def mark_workflow_triggered(
        self,
        form_id: str,
        submission_id: str,
        created_at: str,
        workflow_run_id: str,
    ) -> None:
        """Mark a submission as having triggered a workflow.

        Args:
            form_id: The form ID.
            submission_id: The submission ID.
            created_at: The creation timestamp.
            workflow_run_id: The workflow run ID.
        """
        self.table.update_item(
            Key={
                "PK": f"FORM#{form_id}",
                "SK": f"SUB#{created_at}#{submission_id}",
            },
            UpdateExpression="SET workflow_triggered = :triggered, workflow_run_id = :run_id",
            ExpressionAttributeValues={
                ":triggered": True,
                ":run_id": workflow_run_id,
            },
        )
