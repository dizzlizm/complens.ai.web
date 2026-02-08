"""Tests for the contacts API handler."""

import json

import pytest
from unittest.mock import patch

from complens.services.feature_gate import FeatureGateError


WORKSPACE_ID = "test-workspace-456"
OTHER_WORKSPACE_ID = "other-workspace-999"


def _parse_body(response: dict) -> dict:
    """Parse JSON response body."""
    return json.loads(response["body"])


class TestContacts:
    """Tests for CRUD operations on the contacts handler."""

    # -----------------------------------------------------------------
    # 1. Create contact — success
    # -----------------------------------------------------------------
    def test_create_contact_success(self, dynamodb_table, api_gateway_event):
        """POST with a valid email creates a contact and returns 201."""
        from api.contacts import handler

        event = api_gateway_event(
            method="POST",
            path=f"/workspaces/{WORKSPACE_ID}/contacts",
            path_params={"workspace_id": WORKSPACE_ID},
            body={
                "email": "alice@example.com",
                "first_name": "Alice",
                "last_name": "Smith",
                "tags": ["lead"],
                "source": "website",
            },
        )

        response = handler(event, None)

        assert response["statusCode"] == 201
        body = _parse_body(response)
        assert body["email"] == "alice@example.com"
        assert body["first_name"] == "Alice"
        assert body["last_name"] == "Smith"
        assert body["tags"] == ["lead"]
        assert body["source"] == "website"
        assert "id" in body

    # -----------------------------------------------------------------
    # 2. Duplicate email returns 409
    # -----------------------------------------------------------------
    def test_create_contact_duplicate_email(self, dynamodb_table, api_gateway_event):
        """Creating two contacts with the same email returns 409 DUPLICATE_EMAIL."""
        from api.contacts import handler

        contact_body = {"email": "dupe@example.com", "first_name": "One"}

        event1 = api_gateway_event(
            method="POST",
            path=f"/workspaces/{WORKSPACE_ID}/contacts",
            path_params={"workspace_id": WORKSPACE_ID},
            body=contact_body,
        )
        response1 = handler(event1, None)
        assert response1["statusCode"] == 201

        event2 = api_gateway_event(
            method="POST",
            path=f"/workspaces/{WORKSPACE_ID}/contacts",
            path_params={"workspace_id": WORKSPACE_ID},
            body=contact_body,
        )
        response2 = handler(event2, None)

        assert response2["statusCode"] == 409
        body = _parse_body(response2)
        assert body["error_code"] == "DUPLICATE_EMAIL"

    # -----------------------------------------------------------------
    # 3. Invalid JSON body returns 400
    # -----------------------------------------------------------------
    def test_create_contact_invalid_body(self, dynamodb_table, api_gateway_event):
        """POST with malformed JSON returns 400."""
        from api.contacts import handler

        event = api_gateway_event(
            method="POST",
            path=f"/workspaces/{WORKSPACE_ID}/contacts",
            path_params={"workspace_id": WORKSPACE_ID},
            body="this is not json{{{",
        )

        response = handler(event, None)

        assert response["statusCode"] == 400
        body = _parse_body(response)
        assert body["error"] is True

    # -----------------------------------------------------------------
    # 4. Feature gate — enforce_limit raises FeatureGateError
    # -----------------------------------------------------------------
    @patch(
        "api.contacts.enforce_limit",
        side_effect=FeatureGateError("contacts", "free", "pro"),
    )
    def test_create_contact_feature_gate(
        self, mock_enforce, dynamodb_table, api_gateway_event
    ):
        """When enforce_limit raises FeatureGateError the handler returns 403."""
        from api.contacts import handler

        event = api_gateway_event(
            method="POST",
            path=f"/workspaces/{WORKSPACE_ID}/contacts",
            path_params={"workspace_id": WORKSPACE_ID},
            body={"email": "gated@example.com"},
        )

        response = handler(event, None)

        assert response["statusCode"] == 403
        body = _parse_body(response)
        assert body["error_code"] == "PLAN_LIMIT_REACHED"

    # -----------------------------------------------------------------
    # 5. List contacts — empty workspace
    # -----------------------------------------------------------------
    def test_list_contacts_empty(self, dynamodb_table, api_gateway_event):
        """GET on a workspace with no contacts returns an empty items list."""
        from api.contacts import handler

        event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/contacts",
            path_params={"workspace_id": WORKSPACE_ID},
        )

        response = handler(event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["items"] == []
        assert body["pagination"]["limit"] == 50

    # -----------------------------------------------------------------
    # 6. List contacts — with data
    # -----------------------------------------------------------------
    def test_list_contacts_with_data(self, dynamodb_table, api_gateway_event):
        """GET returns all contacts created in the workspace."""
        from api.contacts import handler

        # Create two contacts
        for email in ["one@example.com", "two@example.com"]:
            create_event = api_gateway_event(
                method="POST",
                path=f"/workspaces/{WORKSPACE_ID}/contacts",
                path_params={"workspace_id": WORKSPACE_ID},
                body={"email": email},
            )
            resp = handler(create_event, None)
            assert resp["statusCode"] == 201

        # List
        list_event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/contacts",
            path_params={"workspace_id": WORKSPACE_ID},
        )

        response = handler(list_event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert len(body["items"]) == 2
        emails = {item["email"] for item in body["items"]}
        assert emails == {"one@example.com", "two@example.com"}

    # -----------------------------------------------------------------
    # 7. List contacts — tag filter
    # -----------------------------------------------------------------
    def test_list_contacts_with_tag_filter(self, dynamodb_table, api_gateway_event):
        """GET with ?tag= returns only contacts that have the tag."""
        from api.contacts import handler

        # Create contact WITH the tag
        handler(
            api_gateway_event(
                method="POST",
                path=f"/workspaces/{WORKSPACE_ID}/contacts",
                path_params={"workspace_id": WORKSPACE_ID},
                body={"email": "tagged@example.com", "tags": ["vip"]},
            ),
            None,
        )

        # Create contact WITHOUT the tag
        handler(
            api_gateway_event(
                method="POST",
                path=f"/workspaces/{WORKSPACE_ID}/contacts",
                path_params={"workspace_id": WORKSPACE_ID},
                body={"email": "untagged@example.com", "tags": ["other"]},
            ),
            None,
        )

        # Filter by tag
        list_event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/contacts",
            path_params={"workspace_id": WORKSPACE_ID},
            query_params={"tag": "vip"},
        )

        response = handler(list_event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert len(body["items"]) == 1
        assert body["items"][0]["email"] == "tagged@example.com"

    # -----------------------------------------------------------------
    # 8. Get contact — success
    # -----------------------------------------------------------------
    def test_get_contact_success(self, dynamodb_table, api_gateway_event):
        """GET by ID returns the contact that was previously created."""
        from api.contacts import handler

        # Create
        create_resp = handler(
            api_gateway_event(
                method="POST",
                path=f"/workspaces/{WORKSPACE_ID}/contacts",
                path_params={"workspace_id": WORKSPACE_ID},
                body={"email": "get-me@example.com", "first_name": "Getter"},
            ),
            None,
        )
        contact_id = _parse_body(create_resp)["id"]

        # Get
        get_event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/contacts/{contact_id}",
            path_params={"workspace_id": WORKSPACE_ID, "contact_id": contact_id},
        )

        response = handler(get_event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["id"] == contact_id
        assert body["email"] == "get-me@example.com"
        assert body["first_name"] == "Getter"

    # -----------------------------------------------------------------
    # 9. Get contact — not found
    # -----------------------------------------------------------------
    def test_get_contact_not_found(self, dynamodb_table, api_gateway_event):
        """GET for a non-existent contact ID returns 404."""
        from api.contacts import handler

        event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/contacts/does-not-exist",
            path_params={
                "workspace_id": WORKSPACE_ID,
                "contact_id": "does-not-exist",
            },
        )

        response = handler(event, None)

        assert response["statusCode"] == 404
        body = _parse_body(response)
        assert body["error_code"] == "NOT_FOUND"

    # -----------------------------------------------------------------
    # 10. Update contact — success
    # -----------------------------------------------------------------
    def test_update_contact_success(self, dynamodb_table, api_gateway_event):
        """PUT with changed first_name updates the contact and returns 200."""
        from api.contacts import handler

        # Create
        create_resp = handler(
            api_gateway_event(
                method="POST",
                path=f"/workspaces/{WORKSPACE_ID}/contacts",
                path_params={"workspace_id": WORKSPACE_ID},
                body={"email": "update-me@example.com", "first_name": "Before"},
            ),
            None,
        )
        contact_id = _parse_body(create_resp)["id"]

        # Update
        update_event = api_gateway_event(
            method="PUT",
            path=f"/workspaces/{WORKSPACE_ID}/contacts/{contact_id}",
            path_params={"workspace_id": WORKSPACE_ID, "contact_id": contact_id},
            body={"first_name": "After"},
        )

        response = handler(update_event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["first_name"] == "After"
        # email should remain unchanged
        assert body["email"] == "update-me@example.com"

    # -----------------------------------------------------------------
    # 11. Update contact — not found
    # -----------------------------------------------------------------
    def test_update_contact_not_found(self, dynamodb_table, api_gateway_event):
        """PUT for a non-existent contact ID returns 404."""
        from api.contacts import handler

        event = api_gateway_event(
            method="PUT",
            path=f"/workspaces/{WORKSPACE_ID}/contacts/ghost",
            path_params={"workspace_id": WORKSPACE_ID, "contact_id": "ghost"},
            body={"first_name": "Nope"},
        )

        response = handler(event, None)

        assert response["statusCode"] == 404
        body = _parse_body(response)
        assert body["error_code"] == "NOT_FOUND"

    # -----------------------------------------------------------------
    # 12. Delete contact — success
    # -----------------------------------------------------------------
    def test_delete_contact_success(self, dynamodb_table, api_gateway_event):
        """DELETE removes the contact and returns 200 with deleted=True."""
        from api.contacts import handler

        # Create
        create_resp = handler(
            api_gateway_event(
                method="POST",
                path=f"/workspaces/{WORKSPACE_ID}/contacts",
                path_params={"workspace_id": WORKSPACE_ID},
                body={"email": "delete-me@example.com"},
            ),
            None,
        )
        contact_id = _parse_body(create_resp)["id"]

        # Delete
        delete_event = api_gateway_event(
            method="DELETE",
            path=f"/workspaces/{WORKSPACE_ID}/contacts/{contact_id}",
            path_params={"workspace_id": WORKSPACE_ID, "contact_id": contact_id},
        )

        response = handler(delete_event, None)

        assert response["statusCode"] == 200
        body = _parse_body(response)
        assert body["deleted"] is True
        assert body["id"] == contact_id

        # Confirm it is gone
        get_event = api_gateway_event(
            method="GET",
            path=f"/workspaces/{WORKSPACE_ID}/contacts/{contact_id}",
            path_params={"workspace_id": WORKSPACE_ID, "contact_id": contact_id},
        )
        get_resp = handler(get_event, None)
        assert get_resp["statusCode"] == 404

    # -----------------------------------------------------------------
    # 13. Delete contact — not found
    # -----------------------------------------------------------------
    def test_delete_contact_not_found(self, dynamodb_table, api_gateway_event):
        """DELETE for a non-existent contact ID returns 404."""
        from api.contacts import handler

        event = api_gateway_event(
            method="DELETE",
            path=f"/workspaces/{WORKSPACE_ID}/contacts/phantom",
            path_params={"workspace_id": WORKSPACE_ID, "contact_id": "phantom"},
        )

        response = handler(event, None)

        assert response["statusCode"] == 404
        body = _parse_body(response)
        assert body["error_code"] == "NOT_FOUND"

    # -----------------------------------------------------------------
    # 14. Unauthorized workspace returns 403
    # -----------------------------------------------------------------
    def test_unauthorized_workspace(self, dynamodb_table, api_gateway_event):
        """POST to a workspace not in the caller's workspace_ids returns 403."""
        from api.contacts import handler

        event = api_gateway_event(
            method="POST",
            path=f"/workspaces/{OTHER_WORKSPACE_ID}/contacts",
            path_params={"workspace_id": OTHER_WORKSPACE_ID},
            body={"email": "nope@example.com"},
            workspace_ids=[WORKSPACE_ID],  # does NOT include OTHER_WORKSPACE_ID
        )

        response = handler(event, None)

        assert response["statusCode"] == 403
        body = _parse_body(response)
        assert body["error_code"] == "FORBIDDEN"
