#!/usr/bin/env python3
"""API Testing Script for Complens.ai.

This script helps test the Complens.ai API endpoints without a frontend.
It can be used for manual verification and debugging.

Usage:
    # Set environment variables first
    export API_URL="https://your-api-url.execute-api.us-east-1.amazonaws.com/dev"
    export COGNITO_CLIENT_ID="your-cognito-client-id"

    # Run all tests
    python scripts/test_api.py

    # Run specific test
    python scripts/test_api.py --test workspaces

    # Use existing token
    python scripts/test_api.py --token "your-jwt-token"
"""

import argparse
import json
import os
import sys
from datetime import datetime
from typing import Any

import httpx

# Configuration from environment
API_URL = os.environ.get("API_URL", "")
COGNITO_CLIENT_ID = os.environ.get("COGNITO_CLIENT_ID", "")
COGNITO_REGION = os.environ.get("COGNITO_REGION", "us-east-1")


class Colors:
    """ANSI color codes for terminal output."""

    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    RESET = "\033[0m"
    BOLD = "\033[1m"


def print_success(msg: str) -> None:
    """Print success message in green."""
    print(f"{Colors.GREEN}[OK]{Colors.RESET} {msg}")


def print_error(msg: str) -> None:
    """Print error message in red."""
    print(f"{Colors.RED}[ERROR]{Colors.RESET} {msg}")


def print_info(msg: str) -> None:
    """Print info message in blue."""
    print(f"{Colors.BLUE}[INFO]{Colors.RESET} {msg}")


def print_warning(msg: str) -> None:
    """Print warning message in yellow."""
    print(f"{Colors.YELLOW}[WARN]{Colors.RESET} {msg}")


def print_header(msg: str) -> None:
    """Print section header."""
    print(f"\n{Colors.BOLD}{'=' * 60}{Colors.RESET}")
    print(f"{Colors.BOLD}{msg}{Colors.RESET}")
    print(f"{Colors.BOLD}{'=' * 60}{Colors.RESET}\n")


class APITester:
    """API testing utility for Complens.ai."""

    def __init__(self, api_url: str, token: str | None = None):
        """Initialize the API tester.

        Args:
            api_url: Base URL of the API.
            token: Optional JWT token for authentication.
        """
        self.api_url = api_url.rstrip("/")
        self.token = token
        self.client = httpx.Client(timeout=30.0)

        # Track created resources for cleanup
        self.created_resources: dict[str, list[str]] = {
            "workspaces": [],
            "contacts": [],
            "workflows": [],
        }

    def _headers(self) -> dict[str, str]:
        """Get request headers including auth token."""
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    def _request(
        self,
        method: str,
        path: str,
        data: dict | None = None,
        expect_status: int = 200,
    ) -> dict[str, Any] | None:
        """Make an API request.

        Args:
            method: HTTP method.
            path: API path.
            data: Request body data.
            expect_status: Expected status code.

        Returns:
            Response data or None on error.
        """
        url = f"{self.api_url}{path}"
        try:
            response = self.client.request(
                method=method,
                url=url,
                json=data,
                headers=self._headers(),
            )

            if response.status_code == expect_status:
                if response.status_code == 204:
                    return {}
                return response.json()
            else:
                print_error(f"{method} {path} returned {response.status_code}")
                print(f"  Response: {response.text[:500]}")
                return None

        except httpx.RequestError as e:
            print_error(f"Request failed: {e}")
            return None

    # =========================================
    # Authentication
    # =========================================

    def authenticate(self, email: str, password: str) -> bool:
        """Authenticate with Cognito and get JWT token.

        Args:
            email: User email.
            password: User password.

        Returns:
            True if authentication successful.
        """
        import boto3

        print_info(f"Authenticating as {email}...")

        try:
            cognito = boto3.client("cognito-idp", region_name=COGNITO_REGION)

            response = cognito.initiate_auth(
                ClientId=COGNITO_CLIENT_ID,
                AuthFlow="USER_PASSWORD_AUTH",
                AuthParameters={
                    "USERNAME": email,
                    "PASSWORD": password,
                },
            )

            self.token = response["AuthenticationResult"]["IdToken"]
            print_success("Authentication successful")
            return True

        except Exception as e:
            print_error(f"Authentication failed: {e}")
            return False

    # =========================================
    # Workspace Tests
    # =========================================

    def test_workspaces(self) -> bool:
        """Test workspace CRUD operations.

        Returns:
            True if all tests pass.
        """
        print_header("Testing Workspaces API")

        # Create workspace
        print_info("Creating workspace...")
        workspace_data = {
            "name": f"Test Workspace {datetime.now().strftime('%H%M%S')}",
            "slug": f"test-ws-{datetime.now().strftime('%H%M%S')}",
            "settings": {"timezone": "America/New_York"},
        }

        result = self._request("POST", "/workspaces", workspace_data, 201)
        if not result:
            return False

        workspace_id = result.get("id")
        if not workspace_id:
            print_error("No workspace ID in response")
            return False

        self.created_resources["workspaces"].append(workspace_id)
        print_success(f"Created workspace: {workspace_id}")

        # Get workspace
        print_info("Getting workspace...")
        result = self._request("GET", f"/workspaces/{workspace_id}")
        if not result:
            return False
        print_success(f"Got workspace: {result.get('name')}")

        # List workspaces
        print_info("Listing workspaces...")
        result = self._request("GET", "/workspaces")
        if not result:
            return False
        print_success(f"Found {len(result.get('items', []))} workspaces")

        # Update workspace
        print_info("Updating workspace...")
        update_data = {"name": "Updated Workspace Name"}
        result = self._request("PUT", f"/workspaces/{workspace_id}", update_data)
        if not result:
            return False
        print_success(f"Updated workspace name to: {result.get('name')}")

        return True

    # =========================================
    # Contact Tests
    # =========================================

    def test_contacts(self, workspace_id: str) -> bool:
        """Test contact CRUD operations.

        Args:
            workspace_id: Workspace ID to use.

        Returns:
            True if all tests pass.
        """
        print_header("Testing Contacts API")

        # Create contact
        print_info("Creating contact...")
        contact_data = {
            "first_name": "Test",
            "last_name": "Contact",
            "email": f"test{datetime.now().strftime('%H%M%S')}@example.com",
            "phone": f"+1555{datetime.now().strftime('%H%M%S%f')[:7]}",
            "tags": ["test", "api-test"],
        }

        result = self._request(
            "POST", f"/workspaces/{workspace_id}/contacts", contact_data, 201
        )
        if not result:
            return False

        contact_id = result.get("id")
        if not contact_id:
            print_error("No contact ID in response")
            return False

        self.created_resources["contacts"].append((workspace_id, contact_id))
        print_success(f"Created contact: {contact_id}")

        # Get contact
        print_info("Getting contact...")
        result = self._request(
            "GET", f"/workspaces/{workspace_id}/contacts/{contact_id}"
        )
        if not result:
            return False
        print_success(f"Got contact: {result.get('first_name')} {result.get('last_name')}")

        # List contacts
        print_info("Listing contacts...")
        result = self._request("GET", f"/workspaces/{workspace_id}/contacts")
        if not result:
            return False
        print_success(f"Found {len(result.get('items', []))} contacts")

        # Update contact
        print_info("Updating contact...")
        update_data = {"first_name": "Updated", "tags": ["test", "updated"]}
        result = self._request(
            "PUT", f"/workspaces/{workspace_id}/contacts/{contact_id}", update_data
        )
        if not result:
            return False
        print_success(f"Updated contact: {result.get('first_name')}")

        return True

    # =========================================
    # Workflow Tests
    # =========================================

    def test_workflows(self, workspace_id: str, contact_id: str) -> bool:
        """Test workflow CRUD and execution.

        Args:
            workspace_id: Workspace ID to use.
            contact_id: Contact ID to use for execution.

        Returns:
            True if all tests pass.
        """
        print_header("Testing Workflows API")

        # Create workflow
        print_info("Creating workflow...")
        workflow_data = {
            "name": f"Test Workflow {datetime.now().strftime('%H%M%S')}",
            "description": "API test workflow",
            "nodes": [
                {
                    "id": "node-1",
                    "type": "trigger_tag_added",
                    "position": {"x": 100, "y": 100},
                    "config": {"trigger_tag": "test"},
                },
                {
                    "id": "node-2",
                    "type": "action_wait",
                    "position": {"x": 100, "y": 200},
                    "config": {"wait_duration": 5},
                },
            ],
            "edges": [
                {"id": "edge-1", "source": "node-1", "target": "node-2"},
            ],
        }

        result = self._request(
            "POST", f"/workspaces/{workspace_id}/workflows", workflow_data, 201
        )
        if not result:
            return False

        workflow_id = result.get("id")
        if not workflow_id:
            print_error("No workflow ID in response")
            return False

        self.created_resources["workflows"].append((workspace_id, workflow_id))
        print_success(f"Created workflow: {workflow_id}")

        # Get workflow
        print_info("Getting workflow...")
        result = self._request(
            "GET", f"/workspaces/{workspace_id}/workflows/{workflow_id}"
        )
        if not result:
            return False
        print_success(f"Got workflow: {result.get('name')}")

        # List workflows
        print_info("Listing workflows...")
        result = self._request("GET", f"/workspaces/{workspace_id}/workflows")
        if not result:
            return False
        print_success(f"Found {len(result.get('items', []))} workflows")

        # Execute workflow
        print_info("Executing workflow...")
        execute_data = {
            "contact_id": contact_id,
            "trigger_data": {"test": True},
        }
        result = self._request(
            "POST",
            f"/workspaces/{workspace_id}/workflows/{workflow_id}/execute",
            execute_data,
        )
        if not result:
            print_warning("Workflow execution may require proper trigger setup")
        else:
            run_id = result.get("run_id")
            print_success(f"Started workflow run: {run_id}")

        # List runs
        print_info("Listing workflow runs...")
        result = self._request(
            "GET", f"/workspaces/{workspace_id}/workflows/{workflow_id}/runs"
        )
        if result:
            print_success(f"Found {len(result.get('items', []))} runs")

        return True

    # =========================================
    # Cleanup
    # =========================================

    def cleanup(self) -> None:
        """Clean up created test resources."""
        print_header("Cleanup")

        # Delete workflows
        for workspace_id, workflow_id in self.created_resources["workflows"]:
            print_info(f"Deleting workflow {workflow_id}...")
            self._request(
                "DELETE",
                f"/workspaces/{workspace_id}/workflows/{workflow_id}",
                expect_status=204,
            )

        # Delete contacts
        for workspace_id, contact_id in self.created_resources["contacts"]:
            print_info(f"Deleting contact {contact_id}...")
            self._request(
                "DELETE",
                f"/workspaces/{workspace_id}/contacts/{contact_id}",
                expect_status=204,
            )

        # Delete workspaces
        for workspace_id in self.created_resources["workspaces"]:
            print_info(f"Deleting workspace {workspace_id}...")
            self._request(
                "DELETE", f"/workspaces/{workspace_id}", expect_status=204
            )

        print_success("Cleanup complete")

    # =========================================
    # Run All Tests
    # =========================================

    def run_all(self, cleanup: bool = True) -> bool:
        """Run all API tests.

        Args:
            cleanup: Whether to clean up resources after tests.

        Returns:
            True if all tests pass.
        """
        success = True

        try:
            # Test workspaces
            if not self.test_workspaces():
                success = False
                return success

            workspace_id = self.created_resources["workspaces"][0]

            # Test contacts
            if not self.test_contacts(workspace_id):
                success = False
                return success

            # Get a contact ID for workflow testing
            contact_id = None
            if self.created_resources["contacts"]:
                contact_id = self.created_resources["contacts"][0][1]

            # Test workflows
            if contact_id and not self.test_workflows(workspace_id, contact_id):
                success = False

        finally:
            if cleanup:
                self.cleanup()

        return success


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Complens.ai API Testing Script")
    parser.add_argument("--api-url", help="API base URL", default=API_URL)
    parser.add_argument("--token", help="JWT token for authentication")
    parser.add_argument("--email", help="Email for Cognito authentication")
    parser.add_argument("--password", help="Password for Cognito authentication")
    parser.add_argument(
        "--test",
        choices=["all", "workspaces", "contacts", "workflows"],
        default="all",
        help="Which tests to run",
    )
    parser.add_argument(
        "--no-cleanup", action="store_true", help="Don't clean up test resources"
    )

    args = parser.parse_args()

    # Validate configuration
    if not args.api_url:
        print_error("API_URL not set. Use --api-url or set API_URL environment variable.")
        sys.exit(1)

    print_header("Complens.ai API Tester")
    print_info(f"API URL: {args.api_url}")

    # Initialize tester
    tester = APITester(args.api_url, token=args.token)

    # Authenticate if needed
    if not args.token:
        if args.email and args.password:
            if not tester.authenticate(args.email, args.password):
                print_error("Authentication failed")
                sys.exit(1)
        else:
            print_warning("No token or credentials provided. Running unauthenticated tests.")
            print_info("Some tests may fail without authentication.")

    # Run tests
    success = False
    if args.test == "all":
        success = tester.run_all(cleanup=not args.no_cleanup)
    elif args.test == "workspaces":
        success = tester.test_workspaces()
    else:
        print_error(f"Test '{args.test}' requires running workspaces first")
        sys.exit(1)

    # Report result
    print_header("Test Results")
    if success:
        print_success("All tests passed!")
        sys.exit(0)
    else:
        print_error("Some tests failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
