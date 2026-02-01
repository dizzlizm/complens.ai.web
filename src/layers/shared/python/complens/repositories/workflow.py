"""Workflow repository for DynamoDB operations."""

from complens.models.workflow import Workflow, WorkflowStatus
from complens.models.workflow_run import RunStatus, WorkflowRun, WorkflowStep
from complens.repositories.base import BaseRepository


class WorkflowRepository(BaseRepository[Workflow]):
    """Repository for Workflow entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize workflow repository."""
        super().__init__(Workflow, table_name)

    def get_by_id(self, workspace_id: str, workflow_id: str) -> Workflow | None:
        """Get workflow by ID.

        Args:
            workspace_id: The workspace ID.
            workflow_id: The workflow ID.

        Returns:
            Workflow or None if not found.
        """
        return self.get(pk=f"WS#{workspace_id}", sk=f"WF#{workflow_id}")

    def list_by_workspace(
        self,
        workspace_id: str,
        status: WorkflowStatus | None = None,
        limit: int = 50,
        last_key: dict | None = None,
    ) -> tuple[list[Workflow], dict | None]:
        """List workflows in a workspace.

        Args:
            workspace_id: The workspace ID.
            status: Optional status filter.
            limit: Maximum workflows to return.
            last_key: Pagination cursor.

        Returns:
            Tuple of (workflows, next_page_key).
        """
        if status:
            # Use GSI1 for status filtering
            items, next_key = self.query(
                pk=f"WS#{workspace_id}#WF_STATUS",
                sk_begins_with=f"{status.value}#",
                index_name="GSI1",
                limit=limit,
                last_key=last_key,
            )
        else:
            items, next_key = self.query(
                pk=f"WS#{workspace_id}",
                sk_begins_with="WF#",
                limit=limit,
                last_key=last_key,
            )

        return items, next_key

    def list_active(self, workspace_id: str) -> list[Workflow]:
        """List all active workflows in a workspace.

        Args:
            workspace_id: The workspace ID.

        Returns:
            List of active workflows.
        """
        workflows, _ = self.list_by_workspace(
            workspace_id, status=WorkflowStatus.ACTIVE, limit=100
        )
        return workflows

    def list_workspace_level(
        self,
        workspace_id: str,
        status: WorkflowStatus | None = None,
        limit: int = 50,
        last_key: dict | None = None,
    ) -> tuple[list[Workflow], dict | None]:
        """List only workspace-level workflows (no page_id).

        Args:
            workspace_id: The workspace ID.
            status: Optional status filter.
            limit: Maximum workflows to return.
            last_key: Pagination cursor.

        Returns:
            Tuple of (workflows, next_page_key).
        """
        # Get all workflows and filter out page-specific ones
        workflows, next_key = self.list_by_workspace(
            workspace_id, status=status, limit=limit * 2, last_key=last_key
        )
        # Filter to only workspace-level (no page_id)
        workspace_level = [w for w in workflows if not w.page_id]
        return workspace_level[:limit], next_key

    def list_by_page(
        self,
        page_id: str,
        status: WorkflowStatus | None = None,
        limit: int = 50,
        last_key: dict | None = None,
    ) -> tuple[list[Workflow], dict | None]:
        """List workflows for a specific page using GSI2.

        Args:
            page_id: The page ID.
            status: Optional status filter.
            limit: Maximum workflows to return.
            last_key: Pagination cursor.

        Returns:
            Tuple of (workflows, next_page_key).
        """
        sk_prefix = f"{status.value}#" if status else ""
        return self.query(
            pk=f"PAGE#{page_id}#WORKFLOWS",
            sk_begins_with=sk_prefix,
            index_name="GSI2",
            limit=limit,
            last_key=last_key,
        )

    def create_workflow(self, workflow: Workflow) -> Workflow:
        """Create a new workflow.

        Args:
            workflow: The workflow to create.

        Returns:
            The created workflow.
        """
        gsi_keys = workflow.get_gsi1_keys()
        gsi2_keys = workflow.get_gsi2_keys()
        if gsi2_keys:
            gsi_keys.update(gsi2_keys)
        return self.create(workflow, gsi_keys=gsi_keys)

    def update_workflow(self, workflow: Workflow) -> Workflow:
        """Update an existing workflow.

        Args:
            workflow: The workflow to update.

        Returns:
            The updated workflow.
        """
        gsi_keys = workflow.get_gsi1_keys()
        gsi2_keys = workflow.get_gsi2_keys()
        if gsi2_keys:
            gsi_keys.update(gsi2_keys)
        return self.update(workflow, gsi_keys=gsi_keys)

    def delete_workflow(self, workspace_id: str, workflow_id: str) -> bool:
        """Delete a workflow.

        Args:
            workspace_id: The workspace ID.
            workflow_id: The workflow ID.

        Returns:
            True if deleted, False if not found.
        """
        return self.delete(pk=f"WS#{workspace_id}", sk=f"WF#{workflow_id}")

    def activate(self, workspace_id: str, workflow_id: str) -> Workflow | None:
        """Activate a workflow.

        Args:
            workspace_id: The workspace ID.
            workflow_id: The workflow ID.

        Returns:
            Updated workflow or None if not found.
        """
        workflow = self.get_by_id(workspace_id, workflow_id)
        if not workflow:
            return None

        workflow.status = WorkflowStatus.ACTIVE
        return self.update_workflow(workflow)

    def pause(self, workspace_id: str, workflow_id: str) -> Workflow | None:
        """Pause a workflow.

        Args:
            workspace_id: The workspace ID.
            workflow_id: The workflow ID.

        Returns:
            Updated workflow or None if not found.
        """
        workflow = self.get_by_id(workspace_id, workflow_id)
        if not workflow:
            return None

        workflow.status = WorkflowStatus.PAUSED
        return self.update_workflow(workflow)


class WorkflowRunRepository(BaseRepository[WorkflowRun]):
    """Repository for WorkflowRun entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize workflow run repository."""
        super().__init__(WorkflowRun, table_name)

    def get_by_id(self, workflow_id: str, run_id: str) -> WorkflowRun | None:
        """Get workflow run by ID.

        Args:
            workflow_id: The workflow ID.
            run_id: The run ID.

        Returns:
            WorkflowRun or None if not found.
        """
        return self.get(pk=f"WF#{workflow_id}", sk=f"RUN#{run_id}")

    def list_by_workflow(
        self,
        workflow_id: str,
        status: RunStatus | None = None,
        limit: int = 50,
        scan_forward: bool = False,
    ) -> list[WorkflowRun]:
        """List runs for a workflow.

        Args:
            workflow_id: The workflow ID.
            status: Optional status filter.
            limit: Maximum runs to return.
            scan_forward: Sort order (False = newest first).

        Returns:
            List of workflow runs.
        """
        filter_expr = None
        expr_values = None

        if status:
            filter_expr = "#status = :status"
            expr_values = {":status": status.value}

        items, _ = self.query(
            pk=f"WF#{workflow_id}",
            sk_begins_with="RUN#",
            limit=limit,
            scan_forward=scan_forward,
            filter_expression=filter_expr,
            expression_values=expr_values,
        )

        return items

    def list_by_contact(
        self,
        contact_id: str,
        limit: int = 50,
        scan_forward: bool = False,
    ) -> list[WorkflowRun]:
        """List runs for a contact using GSI1.

        Args:
            contact_id: The contact ID.
            limit: Maximum runs to return.
            scan_forward: Sort order (False = newest first).

        Returns:
            List of workflow runs.
        """
        items, _ = self.query(
            pk=f"CONTACT#{contact_id}",
            sk_begins_with="RUN#",
            index_name="GSI1",
            limit=limit,
            scan_forward=scan_forward,
        )
        return items

    def create_run(self, run: WorkflowRun) -> WorkflowRun:
        """Create a new workflow run.

        Args:
            run: The run to create.

        Returns:
            The created run.
        """
        return self.create(run, gsi_keys=run.get_gsi1_keys())

    def update_run(self, run: WorkflowRun) -> WorkflowRun:
        """Update an existing workflow run.

        Args:
            run: The run to update.

        Returns:
            The updated run.
        """
        return self.update(run, gsi_keys=run.get_gsi1_keys())


class WorkflowStepRepository:
    """Repository for WorkflowStep entities.

    Steps are stored with the run as the partition key.
    """

    def __init__(self, table_name: str | None = None):
        """Initialize workflow step repository."""
        import os

        import boto3

        self.table_name = table_name or os.environ.get("TABLE_NAME", "complens-dev")
        self._dynamodb = None
        self._table = None

    @property
    def dynamodb(self):
        """Get DynamoDB resource."""
        if self._dynamodb is None:
            import boto3

            self._dynamodb = boto3.resource("dynamodb")
        return self._dynamodb

    @property
    def table(self):
        """Get DynamoDB table."""
        if self._table is None:
            self._table = self.dynamodb.Table(self.table_name)
        return self._table

    def create_step(self, step: WorkflowStep) -> WorkflowStep:
        """Create a workflow step.

        Args:
            step: The step to create.

        Returns:
            The created step.
        """
        item = step.to_dynamodb()
        item["PK"] = step.get_pk()
        item["SK"] = step.get_sk()

        self.table.put_item(Item=item)
        return step

    def list_by_run(
        self,
        run_id: str,
        limit: int = 100,
    ) -> list[WorkflowStep]:
        """List steps for a workflow run.

        Args:
            run_id: The run ID.
            limit: Maximum steps to return.

        Returns:
            List of workflow steps in execution order.
        """
        response = self.table.query(
            KeyConditionExpression="PK = :pk AND begins_with(SK, :sk_prefix)",
            ExpressionAttributeValues={
                ":pk": f"RUN#{run_id}",
                ":sk_prefix": "STEP#",
            },
            Limit=limit,
            ScanIndexForward=True,
        )

        return [
            WorkflowStep.model_validate(item)
            for item in response.get("Items", [])
        ]
