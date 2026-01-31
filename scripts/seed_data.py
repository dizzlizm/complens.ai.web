#!/usr/bin/env python3
"""Seed development data into DynamoDB."""

import argparse
import os
import sys

import boto3

# Add the shared layer to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "layers", "shared", "python"))

from complens.models.contact import Contact
from complens.models.workspace import Workspace
from complens.models.workflow import Workflow, WorkflowEdge, WorkflowStatus
from complens.models.workflow_node import WorkflowNode


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Seed development data")
    parser.add_argument("--stage", default="dev", help="Deployment stage")
    parser.add_argument("--region", default="us-east-1", help="AWS region")
    args = parser.parse_args()

    table_name = f"complens-{args.stage}"
    print(f"Seeding data to table: {table_name}")

    dynamodb = boto3.resource("dynamodb", region_name=args.region)
    table = dynamodb.Table(table_name)

    # Create test workspace
    workspace = Workspace(
        id="demo-workspace",
        agency_id="demo-agency",
        name="Demo Workspace",
        slug="demo",
        settings={
            "timezone": "America/New_York",
            "business_name": "Demo Business",
        },
    )

    put_item(table, workspace)
    print(f"Created workspace: {workspace.name}")

    # Create test contacts
    contacts = [
        Contact(
            id="contact-001",
            workspace_id="demo-workspace",
            email="john.doe@example.com",
            phone="+15551234567",
            first_name="John",
            last_name="Doe",
            tags=["lead", "newsletter"],
            source="website",
        ),
        Contact(
            id="contact-002",
            workspace_id="demo-workspace",
            email="jane.smith@example.com",
            phone="+15559876543",
            first_name="Jane",
            last_name="Smith",
            tags=["customer", "vip"],
            source="referral",
        ),
        Contact(
            id="contact-003",
            workspace_id="demo-workspace",
            email="bob.wilson@example.com",
            first_name="Bob",
            last_name="Wilson",
            tags=["lead"],
            source="ads",
        ),
    ]

    for contact in contacts:
        put_item(table, contact, contact.get_gsi1_keys())
        print(f"Created contact: {contact.full_name}")

    # Create sample workflow
    workflow_nodes = [
        WorkflowNode(
            id="trigger-1",
            node_type="trigger_tag_added",
            position={"x": 250, "y": 50},
            data={
                "label": "When tagged as lead",
                "config": {
                    "tag_name": "lead",
                    "tag_operation": "added",
                },
            },
        ),
        WorkflowNode(
            id="action-1",
            node_type="action_send_sms",
            position={"x": 250, "y": 200},
            data={
                "label": "Send welcome SMS",
                "config": {
                    "sms_message": "Hi {{contact.first_name}}! Thanks for your interest. Reply YES to learn more.",
                },
            },
        ),
        WorkflowNode(
            id="action-2",
            node_type="action_wait",
            position={"x": 250, "y": 350},
            data={
                "label": "Wait 1 hour",
                "config": {
                    "wait_duration": 3600,
                },
            },
        ),
        WorkflowNode(
            id="action-3",
            node_type="action_send_email",
            position={"x": 250, "y": 500},
            data={
                "label": "Send follow-up email",
                "config": {
                    "email_subject": "Thanks for connecting, {{contact.first_name}}!",
                    "email_body": "We're excited to have you. Here's what happens next...",
                },
            },
        ),
    ]

    workflow_edges = [
        WorkflowEdge(id="edge-1", source="trigger-1", target="action-1"),
        WorkflowEdge(id="edge-2", source="action-1", target="action-2"),
        WorkflowEdge(id="edge-3", source="action-2", target="action-3"),
    ]

    workflow = Workflow(
        id="welcome-flow",
        workspace_id="demo-workspace",
        name="New Lead Welcome Flow",
        description="Sends welcome SMS and follow-up email to new leads",
        status=WorkflowStatus.DRAFT,
        nodes=workflow_nodes,
        edges=workflow_edges,
    )

    put_item(table, workflow, workflow.get_gsi1_keys())
    print(f"Created workflow: {workflow.name}")

    print("\nSeeding complete!")
    print(f"\nTo test locally:")
    print(f"  make local")
    print(f"\nTo deploy:")
    print(f"  make deploy STAGE={args.stage}")


def put_item(table, model, gsi_keys=None):
    """Put a model item into DynamoDB."""
    item = model.to_dynamodb()
    item.update(model.get_keys())

    if gsi_keys:
        item.update(gsi_keys)

    table.put_item(Item=item)


if __name__ == "__main__":
    main()
