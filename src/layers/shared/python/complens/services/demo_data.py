"""Demo data seeding for new workspaces.

Seeds a demo landing page, form, workflow, and workflow runs so that
new users see a populated dashboard from day one.
"""

from datetime import datetime, timedelta, timezone
from random import Random

import structlog

from complens.models.base import generate_ulid
from complens.models.form import Form, FormField, FormFieldType
from complens.models.page import Page, PageBlock, PageStatus
from complens.models.workflow import (
    Workflow,
    WorkflowEdge,
    WorkflowStatus,
    TriggerConfig,
)
from complens.models.workflow_node import WorkflowNode, NodePosition
from complens.models.workflow_run import RunStatus, WorkflowRun
from complens.repositories.form import FormRepository
from complens.repositories.page import PageRepository
from complens.repositories.workflow import WorkflowRepository, WorkflowRunRepository

logger = structlog.get_logger()


def seed_demo_data(workspace_id: str, table) -> None:
    """Seed demo content into a newly created workspace.

    Creates a demo landing page, form, workflow, and realistic workflow runs.
    Idempotent: skips if the workspace already has pages.

    Args:
        workspace_id: The workspace to seed.
        table: DynamoDB table resource (used to set analytics counters).
    """
    table_name = table.table_name

    # Idempotency: skip if workspace already has any pages
    page_repo = PageRepository(table_name=table_name)
    existing_pages, _ = page_repo.list_by_workspace(workspace_id, limit=1)
    if existing_pages:
        logger.info("Workspace already has pages, skipping demo seed", workspace_id=workspace_id)
        return

    # Create demo entities
    page = _create_demo_page(workspace_id, page_repo)
    form = _create_demo_form(workspace_id, page.id, table_name)
    workflow = _create_demo_workflow(workspace_id, page.id, form.id, table_name)
    _create_demo_runs(workspace_id, workflow.id, table_name)

    # Set analytics counters directly (avoids incrementing one-by-one)
    _set_page_counters(table, workspace_id, page.id)
    _set_form_counter(table, workspace_id, form.id)
    _set_workflow_counters(table, workspace_id, workflow.id)

    logger.info(
        "Demo data seeded",
        workspace_id=workspace_id,
        page_id=page.id,
        form_id=form.id,
        workflow_id=workflow.id,
    )


def _create_demo_page(workspace_id: str, page_repo: PageRepository) -> Page:
    """Create the demo landing page."""
    page = Page(
        workspace_id=workspace_id,
        name="Welcome to Complens.ai",
        slug="demo",
        status=PageStatus.PUBLISHED,
        headline="Grow Your Business with AI-Powered Marketing",
        subheadline="Create landing pages, automate workflows, and engage leads — all from one platform.",
        blocks=[
            PageBlock(
                id="hero-1",
                type="hero",
                order=0,
                config={
                    "headline": "Grow Your Business with AI-Powered Marketing",
                    "subheadline": "Create landing pages, automate workflows, and engage leads — all from one platform.",
                    "cta_text": "Get Started Free",
                    "cta_url": "#form",
                    "background_color": "#6366f1",
                },
            ),
            PageBlock(
                id="feat-1",
                type="features",
                order=1,
                config={
                    "headline": "Everything You Need",
                    "features": [
                        {
                            "icon": "sparkles",
                            "title": "AI Page Builder",
                            "description": "Describe your business and let AI create a stunning landing page in seconds.",
                        },
                        {
                            "icon": "mail",
                            "title": "Email Warmup",
                            "description": "Warm up your email domain reputation automatically before launching campaigns.",
                        },
                        {
                            "icon": "zap",
                            "title": "Workflow Automation",
                            "description": "Build visual workflows that send emails, tag contacts, and respond with AI.",
                        },
                    ],
                },
            ),
            PageBlock(
                id="cta-1",
                type="cta",
                order=2,
                config={
                    "headline": "Ready to Automate Your Marketing?",
                    "subheadline": "Join thousands of businesses using Complens.ai to grow faster.",
                    "cta_text": "Start Building",
                    "cta_url": "#form",
                },
            ),
            PageBlock(
                id="form-1",
                type="form",
                order=3,
                config={
                    "headline": "Get Started",
                    "form_id": "",  # Will be updated after form creation
                },
            ),
        ],
    )
    page = page_repo.create_page(page)
    return page


def _create_demo_form(workspace_id: str, page_id: str, table_name: str) -> Form:
    """Create the demo lead capture form."""
    form_repo = FormRepository(table_name=table_name)
    form = Form(
        workspace_id=workspace_id,
        page_id=page_id,
        name="Get Started Form",
        description="Capture leads from the demo landing page.",
        fields=[
            FormField(
                id="email",
                name="email",
                label="Email Address",
                type=FormFieldType.EMAIL,
                required=True,
                placeholder="you@company.com",
                map_to_contact_field="email",
            ),
            FormField(
                id="first_name",
                name="first_name",
                label="First Name",
                type=FormFieldType.TEXT,
                required=False,
                placeholder="Jane",
                map_to_contact_field="first_name",
            ),
            FormField(
                id="message",
                name="message",
                label="How can we help?",
                type=FormFieldType.TEXTAREA,
                required=False,
                placeholder="Tell us about your business...",
            ),
        ],
        submit_button_text="Get Started",
        success_message="Thanks! We'll be in touch soon.",
    )
    form = form_repo.create_form(form)

    # Update page form block with form_id
    page_repo = PageRepository(table_name=table_name)
    page = page_repo.get_by_id(workspace_id, page_id)
    if page:
        for block in page.blocks:
            if block.type == "form":
                block.config["form_id"] = form.id
        page.form_ids = [form.id]
        page_repo.update_page(page)

    return form


def _create_demo_workflow(
    workspace_id: str, page_id: str, form_id: str, table_name: str
) -> Workflow:
    """Create the demo workflow with 3 nodes."""
    wf_repo = WorkflowRepository(table_name=table_name)

    trigger_id = "trigger-1"
    email_id = "email-1"
    update_id = "update-1"

    workflow = Workflow(
        workspace_id=workspace_id,
        page_id=page_id,
        name="Welcome New Leads",
        description="Sends a welcome email and tags new form submissions as leads.",
        status=WorkflowStatus.ACTIVE,
        nodes=[
            WorkflowNode(
                id=trigger_id,
                type="trigger_form_submitted",
                position=NodePosition(x=250, y=50),
                data={
                    "label": "Form Submitted",
                    "config": {"form_id": form_id},
                },
            ),
            WorkflowNode(
                id=email_id,
                type="action_send_email",
                position=NodePosition(x=250, y=200),
                data={
                    "label": "Send Welcome Email",
                    "config": {
                        "email_to": "{{contact.email}}",
                        "email_subject": "Welcome {{contact.first_name}}!",
                        "email_body": (
                            "Hi {{contact.first_name}},\n\n"
                            "Thanks for reaching out! We're excited to help you grow your business.\n\n"
                            "One of our team members will be in touch shortly.\n\n"
                            "Best,\nThe Team"
                        ),
                    },
                },
            ),
            WorkflowNode(
                id=update_id,
                type="action_update_contact",
                position=NodePosition(x=250, y=350),
                data={
                    "label": "Tag as Lead",
                    "config": {"add_tags": ["lead"]},
                },
            ),
        ],
        edges=[
            WorkflowEdge(id="e1", source=trigger_id, target=email_id),
            WorkflowEdge(id="e2", source=email_id, target=update_id),
        ],
        trigger_config=TriggerConfig(
            trigger_node_id=trigger_id,
            trigger_type="trigger_form_submitted",
            form_id=form_id,
        ),
    )
    workflow = wf_repo.create_workflow(workflow)
    return workflow


def _create_demo_runs(workspace_id: str, workflow_id: str, table_name: str) -> None:
    """Create ~15 realistic workflow runs staggered over the past 30 days."""
    run_repo = WorkflowRunRepository(table_name=table_name)
    now = datetime.now(timezone.utc)
    rng = Random(workspace_id)  # deterministic per workspace

    # 15 runs spread over 30 days
    run_count = 15
    completed_count = 12

    for i in range(run_count):
        days_ago = 30 - int(i * (30 / run_count))
        hours_offset = rng.randint(0, 23)
        created_at = now - timedelta(days=days_ago, hours=hours_offset)

        is_completed = i < completed_count
        status = RunStatus.COMPLETED if is_completed else RunStatus.FAILED

        run = WorkflowRun(
            workflow_id=workflow_id,
            workspace_id=workspace_id,
            contact_id=None,
            status=status,
            trigger_type="trigger_form_submitted",
            trigger_data={"source": "demo"},
            started_at=created_at,
            completed_at=created_at + timedelta(seconds=rng.randint(1, 5)),
            steps_completed=3 if is_completed else rng.randint(1, 2),
            error_message="Demo: simulated email delivery failure" if not is_completed else None,
            error_node_id="email-1" if not is_completed else None,
            created_at=created_at,
        )
        run_repo.create_run(run)


def _set_page_counters(table, workspace_id: str, page_id: str) -> None:
    """Set demo view and submission counters on the page."""
    table.update_item(
        Key={"PK": f"WS#{workspace_id}", "SK": f"PAGE#{page_id}"},
        UpdateExpression="SET view_count = :views, form_submission_count = :subs",
        ExpressionAttributeValues={":views": 147, ":subs": 23},
    )


def _set_form_counter(table, workspace_id: str, form_id: str) -> None:
    """Set demo submission counter on the form."""
    table.update_item(
        Key={"PK": f"WS#{workspace_id}", "SK": f"FORM#{form_id}"},
        UpdateExpression="SET submission_count = :count",
        ExpressionAttributeValues={":count": 23},
    )


def _set_workflow_counters(table, workspace_id: str, workflow_id: str) -> None:
    """Set demo run counters on the workflow."""
    table.update_item(
        Key={"PK": f"WS#{workspace_id}", "SK": f"WF#{workflow_id}"},
        UpdateExpression="SET total_runs = :total, successful_runs = :success, failed_runs = :failed",
        ExpressionAttributeValues={":total": 15, ":success": 12, ":failed": 3},
    )
