"""Tests for the workflows API handler.

Covers CRUD operations, feature gating, graph validation, execution,
and authorization for the /workspaces/{ws}/workflows endpoints.
"""

import json

import pytest
from unittest.mock import patch, MagicMock, AsyncMock


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

WORKSPACE_ID = "test-workspace-456"
PATH_PREFIX = f"/workspaces/{WORKSPACE_ID}/workflows"


def _valid_nodes():
    """Return a minimal valid node set (one trigger + one action)."""
    return [
        {
            "id": "trigger-1",
            "type": "trigger_form_submitted",
            "position": {"x": 100, "y": 100},
            "data": {
                "label": "Form Submitted",
                "config": {"form_id": "form-123"},
            },
        },
        {
            "id": "action-1",
            "type": "action_send_email",
            "position": {"x": 100, "y": 300},
            "data": {
                "label": "Send Email",
                "config": {
                    "email_to": "{{contact.email}}",
                    "email_subject": "Welcome!",
                    "email_body": "<p>Hello</p>",
                },
            },
        },
    ]


def _valid_edges():
    """Return an edge connecting trigger-1 to action-1."""
    return [
        {"id": "edge-1", "source": "trigger-1", "target": "action-1"},
    ]


def _valid_create_body(name="My Workflow", nodes=None, edges=None):
    """Build a valid POST body for create_workflow."""
    return {
        "name": name,
        "description": "A test workflow",
        "nodes": nodes or _valid_nodes(),
        "edges": edges or _valid_edges(),
    }


def _parse(response):
    """Parse the JSON body from a Lambda response dict."""
    return json.loads(response["body"])


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestWorkflows:
    """Test suite for the workflows handler."""

    # -- CREATE -------------------------------------------------------------

    def test_create_workflow_success(self, dynamodb_table, api_gateway_event):
        """POST with valid name, trigger node, action node, and edge returns 201."""
        from api.workflows import handler

        event = api_gateway_event(
            method="POST",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            body=_valid_create_body(),
        )

        response = handler(event, None)

        assert response["statusCode"] == 201
        body = _parse(response)
        assert body["name"] == "My Workflow"
        assert body["description"] == "A test workflow"
        assert body["workspace_id"] == WORKSPACE_ID
        assert body["status"] == "draft"
        assert len(body["nodes"]) == 2
        assert len(body["edges"]) == 1
        # Ensure an ID was generated
        assert body["id"]

    def test_create_workflow_missing_name(self, dynamodb_table, api_gateway_event):
        """POST with empty body returns 400 validation error."""
        from api.workflows import handler

        event = api_gateway_event(
            method="POST",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            body={"description": "no name provided"},
        )

        response = handler(event, None)

        assert response["statusCode"] == 400
        body = _parse(response)
        assert body["error"] is True
        assert body.get("error_code") == "VALIDATION_ERROR"

    def test_create_workflow_no_trigger_node(self, dynamodb_table, api_gateway_event):
        """POST with nodes that lack a trigger returns 400 graph validation error."""
        from api.workflows import handler

        nodes = [
            {
                "id": "action-1",
                "type": "action_send_email",
                "position": {"x": 100, "y": 100},
                "data": {"label": "Send Email", "config": {}},
            },
        ]

        event = api_gateway_event(
            method="POST",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            body=_valid_create_body(nodes=nodes, edges=[]),
        )

        response = handler(event, None)

        assert response["statusCode"] == 400
        body = _parse(response)
        assert body.get("error_code") == "VALIDATION_ERROR"
        errors = body.get("details", {}).get("errors", [])
        messages = [e["message"] for e in errors]
        assert any("trigger" in m.lower() for m in messages)

    @patch(
        "api.workflows.enforce_limit",
        side_effect=__import__(
            "complens.services.feature_gate", fromlist=["FeatureGateError"]
        ).FeatureGateError("workflows", "free", "pro"),
    )
    def test_create_workflow_feature_gate(
        self, mock_enforce, dynamodb_table, api_gateway_event
    ):
        """POST returns 403 when the workspace plan limit is reached."""
        from api.workflows import handler

        event = api_gateway_event(
            method="POST",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            body=_valid_create_body(),
        )

        response = handler(event, None)

        assert response["statusCode"] == 403
        body = _parse(response)
        assert body.get("error_code") == "PLAN_LIMIT_REACHED"

    # -- LIST ---------------------------------------------------------------

    def test_list_workflows_empty(self, dynamodb_table, api_gateway_event):
        """GET returns empty items list when no workflows exist."""
        from api.workflows import handler

        event = api_gateway_event(
            method="GET",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            query_params={"include_page_workflows": "true"},
        )

        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse(response)
        assert body["items"] == []

    def test_list_workflows_with_data(self, dynamodb_table, api_gateway_event):
        """GET returns created workflow in the items list."""
        from api.workflows import handler

        # Create a workflow first
        create_event = api_gateway_event(
            method="POST",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            body=_valid_create_body(),
        )
        create_resp = handler(create_event, None)
        assert create_resp["statusCode"] == 201

        # List workflows (include_page_workflows=true to list all)
        list_event = api_gateway_event(
            method="GET",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            query_params={"include_page_workflows": "true"},
        )

        response = handler(list_event, None)

        assert response["statusCode"] == 200
        body = _parse(response)
        assert len(body["items"]) == 1
        assert body["items"][0]["name"] == "My Workflow"

    # -- GET ----------------------------------------------------------------

    def test_get_workflow_success(self, dynamodb_table, api_gateway_event):
        """GET by ID returns 200 with the workflow."""
        from api.workflows import handler

        # Create
        create_event = api_gateway_event(
            method="POST",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            body=_valid_create_body(),
        )
        created = _parse(handler(create_event, None))
        wf_id = created["id"]

        # Get
        get_event = api_gateway_event(
            method="GET",
            path=f"{PATH_PREFIX}/{wf_id}",
            path_params={"workspace_id": WORKSPACE_ID, "workflow_id": wf_id},
        )

        response = handler(get_event, None)

        assert response["statusCode"] == 200
        body = _parse(response)
        assert body["id"] == wf_id
        assert body["name"] == "My Workflow"

    def test_get_workflow_not_found(self, dynamodb_table, api_gateway_event):
        """GET for a non-existent workflow returns 404."""
        from api.workflows import handler

        event = api_gateway_event(
            method="GET",
            path=f"{PATH_PREFIX}/nonexistent-id",
            path_params={
                "workspace_id": WORKSPACE_ID,
                "workflow_id": "nonexistent-id",
            },
        )

        response = handler(event, None)

        assert response["statusCode"] == 404
        body = _parse(response)
        assert body.get("error_code") == "NOT_FOUND"

    # -- UPDATE -------------------------------------------------------------

    def test_update_workflow_success(self, dynamodb_table, api_gateway_event):
        """PUT with a new name returns 200 with the updated workflow."""
        from api.workflows import handler

        # Create
        create_event = api_gateway_event(
            method="POST",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            body=_valid_create_body(),
        )
        created = _parse(handler(create_event, None))
        wf_id = created["id"]

        # Update
        update_event = api_gateway_event(
            method="PUT",
            path=f"{PATH_PREFIX}/{wf_id}",
            path_params={"workspace_id": WORKSPACE_ID, "workflow_id": wf_id},
            body={"name": "Renamed Workflow"},
        )

        response = handler(update_event, None)

        assert response["statusCode"] == 200
        body = _parse(response)
        assert body["name"] == "Renamed Workflow"
        assert body["id"] == wf_id

    def test_update_workflow_status(self, dynamodb_table, api_gateway_event):
        """PUT can change workflow status to active."""
        from api.workflows import handler

        # Create
        create_event = api_gateway_event(
            method="POST",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            body=_valid_create_body(),
        )
        created = _parse(handler(create_event, None))
        wf_id = created["id"]
        assert created["status"] == "draft"

        # Activate
        update_event = api_gateway_event(
            method="PUT",
            path=f"{PATH_PREFIX}/{wf_id}",
            path_params={"workspace_id": WORKSPACE_ID, "workflow_id": wf_id},
            body={"status": "active"},
        )

        response = handler(update_event, None)

        assert response["statusCode"] == 200
        body = _parse(response)
        assert body["status"] == "active"

    # -- DELETE -------------------------------------------------------------

    def test_delete_workflow_success(self, dynamodb_table, api_gateway_event):
        """DELETE an existing workflow returns 200 with deleted=True."""
        from api.workflows import handler

        # Create
        create_event = api_gateway_event(
            method="POST",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            body=_valid_create_body(),
        )
        created = _parse(handler(create_event, None))
        wf_id = created["id"]

        # Delete
        delete_event = api_gateway_event(
            method="DELETE",
            path=f"{PATH_PREFIX}/{wf_id}",
            path_params={"workspace_id": WORKSPACE_ID, "workflow_id": wf_id},
        )

        response = handler(delete_event, None)

        assert response["statusCode"] == 200
        body = _parse(response)
        assert body["deleted"] is True
        assert body["id"] == wf_id

        # Verify it no longer exists
        get_event = api_gateway_event(
            method="GET",
            path=f"{PATH_PREFIX}/{wf_id}",
            path_params={"workspace_id": WORKSPACE_ID, "workflow_id": wf_id},
        )
        assert handler(get_event, None)["statusCode"] == 404

    def test_delete_workflow_not_found(self, dynamodb_table, api_gateway_event):
        """DELETE a non-existent workflow returns 404."""
        from api.workflows import handler

        event = api_gateway_event(
            method="DELETE",
            path=f"{PATH_PREFIX}/nonexistent-id",
            path_params={
                "workspace_id": WORKSPACE_ID,
                "workflow_id": "nonexistent-id",
            },
        )

        response = handler(event, None)

        assert response["statusCode"] == 404
        body = _parse(response)
        assert body.get("error_code") == "NOT_FOUND"

    # -- EXECUTE ------------------------------------------------------------

    def test_execute_workflow_not_active(self, dynamodb_table, api_gateway_event):
        """POST /execute returns 400 when workflow is in draft status."""
        from api.workflows import handler

        # Create a workflow (default status = draft)
        create_event = api_gateway_event(
            method="POST",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            body=_valid_create_body(),
        )
        created = _parse(handler(create_event, None))
        wf_id = created["id"]
        assert created["status"] == "draft"

        # Attempt to execute
        exec_event = api_gateway_event(
            method="POST",
            path=f"{PATH_PREFIX}/{wf_id}/execute",
            path_params={"workspace_id": WORKSPACE_ID, "workflow_id": wf_id},
            body={"contact_id": "contact-abc"},
        )

        response = handler(exec_event, None)

        assert response["statusCode"] == 400
        body = _parse(response)
        assert body.get("error_code") == "WORKFLOW_NOT_ACTIVE"

    def test_execute_workflow_missing_contact_id(
        self, dynamodb_table, api_gateway_event
    ):
        """POST /execute returns 400 when contact_id is missing from body."""
        from api.workflows import handler

        # Create and activate a workflow
        create_event = api_gateway_event(
            method="POST",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            body=_valid_create_body(),
        )
        created = _parse(handler(create_event, None))
        wf_id = created["id"]

        # Activate it
        update_event = api_gateway_event(
            method="PUT",
            path=f"{PATH_PREFIX}/{wf_id}",
            path_params={"workspace_id": WORKSPACE_ID, "workflow_id": wf_id},
            body={"status": "active"},
        )
        handler(update_event, None)

        # Execute without contact_id (use body with unrelated key since
        # the api_gateway_event fixture treats {} as falsy and passes None)
        exec_event = api_gateway_event(
            method="POST",
            path=f"{PATH_PREFIX}/{wf_id}/execute",
            path_params={"workspace_id": WORKSPACE_ID, "workflow_id": wf_id},
            body={"trigger_data": {}},
        )

        response = handler(exec_event, None)

        assert response["statusCode"] == 400
        body = _parse(response)
        assert "contact_id" in body.get("message", "").lower()

    def test_execute_workflow_contact_not_found(
        self, dynamodb_table, api_gateway_event
    ):
        """POST /execute returns 404 when the contact does not exist."""
        from api.workflows import handler

        # Create and activate
        create_event = api_gateway_event(
            method="POST",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            body=_valid_create_body(),
        )
        created = _parse(handler(create_event, None))
        wf_id = created["id"]

        update_event = api_gateway_event(
            method="PUT",
            path=f"{PATH_PREFIX}/{wf_id}",
            path_params={"workspace_id": WORKSPACE_ID, "workflow_id": wf_id},
            body={"status": "active"},
        )
        handler(update_event, None)

        # Execute with a contact that doesn't exist
        exec_event = api_gateway_event(
            method="POST",
            path=f"{PATH_PREFIX}/{wf_id}/execute",
            path_params={"workspace_id": WORKSPACE_ID, "workflow_id": wf_id},
            body={"contact_id": "nonexistent-contact"},
        )

        response = handler(exec_event, None)

        assert response["statusCode"] == 404
        body = _parse(response)
        assert body.get("error_code") == "NOT_FOUND"

    @patch("api.workflows.WorkflowEngine")
    def test_execute_workflow_sync_fallback(
        self, MockEngine, dynamodb_table, api_gateway_event, sample_contact
    ):
        """POST /execute succeeds via sync fallback when no state machine ARN is set."""
        from api.workflows import handler
        from complens.repositories.contact import ContactRepository
        from complens.models.workflow_run import WorkflowRun, RunStatus

        # Persist the sample contact in DynamoDB so execute can find it
        contact_repo = ContactRepository()
        contact_repo.create(sample_contact, gsi_keys={
            "GSI1PK": f"WS#{WORKSPACE_ID}#EMAIL",
            "GSI1SK": sample_contact.email,
        })

        # Create and activate a workflow
        create_event = api_gateway_event(
            method="POST",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            body=_valid_create_body(),
        )
        created = _parse(handler(create_event, None))
        wf_id = created["id"]

        update_event = api_gateway_event(
            method="PUT",
            path=f"{PATH_PREFIX}/{wf_id}",
            path_params={"workspace_id": WORKSPACE_ID, "workflow_id": wf_id},
            body={"status": "active"},
        )
        handler(update_event, None)

        # Set up the mock engine to return a WorkflowRun
        mock_run = MagicMock()
        mock_run.status.value = "completed"
        mock_run.id = "run-test-123"

        engine_instance = MockEngine.return_value
        engine_instance.start_workflow = AsyncMock(return_value=mock_run)

        # Execute
        exec_event = api_gateway_event(
            method="POST",
            path=f"{PATH_PREFIX}/{wf_id}/execute",
            path_params={"workspace_id": WORKSPACE_ID, "workflow_id": wf_id},
            body={"contact_id": sample_contact.id},
        )

        response = handler(exec_event, None)

        assert response["statusCode"] == 200
        body = _parse(response)
        assert body["status"] == "completed"
        assert body["run_id"] == "run-test-123"
        assert body["workflow_id"] == wf_id
        assert body["contact_id"] == sample_contact.id

    # -- LIST RUNS ----------------------------------------------------------

    def test_list_workflow_runs_empty(self, dynamodb_table, api_gateway_event):
        """GET /runs returns empty items list when no runs exist."""
        from api.workflows import handler

        # Create a workflow so the path is valid
        create_event = api_gateway_event(
            method="POST",
            path=PATH_PREFIX,
            path_params={"workspace_id": WORKSPACE_ID},
            body=_valid_create_body(),
        )
        created = _parse(handler(create_event, None))
        wf_id = created["id"]

        # List runs
        runs_event = api_gateway_event(
            method="GET",
            path=f"{PATH_PREFIX}/{wf_id}/runs",
            path_params={"workspace_id": WORKSPACE_ID, "workflow_id": wf_id},
        )

        response = handler(runs_event, None)

        assert response["statusCode"] == 200
        body = _parse(response)
        assert body["items"] == []

    # -- AUTHORIZATION ------------------------------------------------------

    def test_unauthorized_workspace(self, dynamodb_table, api_gateway_event):
        """POST to a workspace not in the user's workspace_ids returns 403."""
        from api.workflows import handler

        event = api_gateway_event(
            method="POST",
            path="/workspaces/other-workspace/workflows",
            path_params={"workspace_id": "other-workspace"},
            body=_valid_create_body(),
            workspace_ids=["test-workspace-456"],  # does not include other-workspace
        )

        response = handler(event, None)

        assert response["statusCode"] == 403
        body = _parse(response)
        assert body.get("error_code") == "FORBIDDEN"
