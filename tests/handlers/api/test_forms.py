"""Tests for the forms API handler."""

import json
import pytest


WORKSPACE_ID = "test-workspace-456"
FORM_PATH = f"/workspaces/{WORKSPACE_ID}/forms"


def _form_body(
    name: str = "Contact Form",
    description: str = "A simple contact form",
    fields: list | None = None,
    submit_button_text: str = "Submit",
    success_message: str = "Thanks!",
) -> dict:
    """Build a valid form creation request body."""
    if fields is None:
        fields = [
            {"id": "field-1", "name": "email", "label": "Email", "type": "email", "required": True},
            {"id": "field-2", "name": "name", "label": "Name", "type": "text", "required": True},
        ]
    return {
        "name": name,
        "description": description,
        "fields": fields,
        "submit_button_text": submit_button_text,
        "success_message": success_message,
    }


def _create_form(handler, api_gateway_event, body: dict | None = None) -> dict:
    """Helper to create a form and return the parsed response body."""
    event = api_gateway_event(
        method="POST",
        path=FORM_PATH,
        path_params={"workspace_id": WORKSPACE_ID},
        body=body or _form_body(),
    )
    response = handler(event, None)
    assert response["statusCode"] == 201, (
        f"Expected 201 but got {response['statusCode']}: {response['body']}"
    )
    return json.loads(response["body"])


class TestForms:
    """Tests for the forms CRUD handler."""

    # ------------------------------------------------------------------
    # 1. Create
    # ------------------------------------------------------------------

    def test_create_form_success(self, dynamodb_table, api_gateway_event):
        """POST with name + fields returns 201 and persisted form."""
        from api.forms import handler

        body = _form_body()
        event = api_gateway_event(
            method="POST",
            path=FORM_PATH,
            path_params={"workspace_id": WORKSPACE_ID},
            body=body,
        )

        response = handler(event, None)

        assert response["statusCode"] == 201
        data = json.loads(response["body"])
        assert data["name"] == "Contact Form"
        assert data["description"] == "A simple contact form"
        assert len(data["fields"]) == 2
        assert data["fields"][0]["type"] == "email"
        assert data["fields"][1]["type"] == "text"
        assert data["submit_button_text"] == "Submit"
        assert data["success_message"] == "Thanks!"
        assert data["id"] is not None
        assert data["workspace_id"] == WORKSPACE_ID

    def test_create_form_missing_name(self, dynamodb_table, api_gateway_event):
        """POST without a name field returns 400 validation error."""
        from api.forms import handler

        event = api_gateway_event(
            method="POST",
            path=FORM_PATH,
            path_params={"workspace_id": WORKSPACE_ID},
            body={"description": "Missing the required name field"},
        )

        response = handler(event, None)

        assert response["statusCode"] == 400
        data = json.loads(response["body"])
        assert data["error"] is True
        assert data["error_code"] == "VALIDATION_ERROR"

    # ------------------------------------------------------------------
    # 2. List
    # ------------------------------------------------------------------

    def test_list_forms_empty(self, dynamodb_table, api_gateway_event):
        """GET on empty workspace returns an empty items list."""
        from api.forms import handler

        event = api_gateway_event(
            method="GET",
            path=FORM_PATH,
            path_params={"workspace_id": WORKSPACE_ID},
        )

        response = handler(event, None)

        assert response["statusCode"] == 200
        data = json.loads(response["body"])
        assert data["items"] == []
        assert data["pagination"]["limit"] == 50

    def test_list_forms_with_data(self, dynamodb_table, api_gateway_event):
        """GET returns forms after one has been created."""
        from api.forms import handler

        # Create a form first
        _create_form(handler, api_gateway_event)

        # List forms
        event = api_gateway_event(
            method="GET",
            path=FORM_PATH,
            path_params={"workspace_id": WORKSPACE_ID},
        )

        response = handler(event, None)

        assert response["statusCode"] == 200
        data = json.loads(response["body"])
        assert len(data["items"]) == 1
        assert data["items"][0]["name"] == "Contact Form"

    # ------------------------------------------------------------------
    # 3. Get
    # ------------------------------------------------------------------

    def test_get_form_success(self, dynamodb_table, api_gateway_event):
        """GET by ID returns the previously created form."""
        from api.forms import handler

        created = _create_form(handler, api_gateway_event)
        form_id = created["id"]

        event = api_gateway_event(
            method="GET",
            path=f"{FORM_PATH}/{form_id}",
            path_params={"workspace_id": WORKSPACE_ID, "form_id": form_id},
        )

        response = handler(event, None)

        assert response["statusCode"] == 200
        data = json.loads(response["body"])
        assert data["id"] == form_id
        assert data["name"] == "Contact Form"

    def test_get_form_not_found(self, dynamodb_table, api_gateway_event):
        """GET with a non-existent form ID returns 404."""
        from api.forms import handler

        event = api_gateway_event(
            method="GET",
            path=f"{FORM_PATH}/nonexistent-form-id",
            path_params={"workspace_id": WORKSPACE_ID, "form_id": "nonexistent-form-id"},
        )

        response = handler(event, None)

        assert response["statusCode"] == 404
        data = json.loads(response["body"])
        assert data["error"] is True
        assert data["error_code"] == "NOT_FOUND"

    # ------------------------------------------------------------------
    # 4. Update
    # ------------------------------------------------------------------

    def test_update_form_success(self, dynamodb_table, api_gateway_event):
        """PUT with a new name returns 200 and updated data."""
        from api.forms import handler

        created = _create_form(handler, api_gateway_event)
        form_id = created["id"]

        event = api_gateway_event(
            method="PUT",
            path=f"{FORM_PATH}/{form_id}",
            path_params={"workspace_id": WORKSPACE_ID, "form_id": form_id},
            body={"name": "Updated Form Name"},
        )

        response = handler(event, None)

        assert response["statusCode"] == 200
        data = json.loads(response["body"])
        assert data["id"] == form_id
        assert data["name"] == "Updated Form Name"
        # Original fields should remain unchanged
        assert len(data["fields"]) == 2

    # ------------------------------------------------------------------
    # 5. Delete
    # ------------------------------------------------------------------

    def test_delete_form_success(self, dynamodb_table, api_gateway_event):
        """DELETE an existing form returns 200 with deleted confirmation."""
        from api.forms import handler

        created = _create_form(handler, api_gateway_event)
        form_id = created["id"]

        event = api_gateway_event(
            method="DELETE",
            path=f"{FORM_PATH}/{form_id}",
            path_params={"workspace_id": WORKSPACE_ID, "form_id": form_id},
        )

        response = handler(event, None)

        assert response["statusCode"] == 200
        data = json.loads(response["body"])
        assert data["deleted"] is True
        assert data["id"] == form_id

        # Verify it is actually gone
        get_event = api_gateway_event(
            method="GET",
            path=f"{FORM_PATH}/{form_id}",
            path_params={"workspace_id": WORKSPACE_ID, "form_id": form_id},
        )
        get_response = handler(get_event, None)
        assert get_response["statusCode"] == 404

    def test_delete_form_not_found(self, dynamodb_table, api_gateway_event):
        """DELETE a non-existent form returns 404."""
        from api.forms import handler

        event = api_gateway_event(
            method="DELETE",
            path=f"{FORM_PATH}/nonexistent-form-id",
            path_params={"workspace_id": WORKSPACE_ID, "form_id": "nonexistent-form-id"},
        )

        response = handler(event, None)

        assert response["statusCode"] == 404
        data = json.loads(response["body"])
        assert data["error"] is True
        assert data["error_code"] == "NOT_FOUND"

    # ------------------------------------------------------------------
    # 6. Authorization
    # ------------------------------------------------------------------

    def test_unauthorized_workspace(self, dynamodb_table, api_gateway_event):
        """Accessing a workspace not in the user's workspace_ids returns 403."""
        from api.forms import handler

        event = api_gateway_event(
            method="GET",
            path="/workspaces/unauthorized-workspace/forms",
            path_params={"workspace_id": "unauthorized-workspace"},
            workspace_ids=["some-other-workspace"],
        )

        response = handler(event, None)

        assert response["statusCode"] == 403
        data = json.loads(response["body"])
        assert data["error"] is True
        assert data["error_code"] == "FORBIDDEN"
