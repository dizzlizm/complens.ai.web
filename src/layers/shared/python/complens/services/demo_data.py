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
    """Create the demo landing page.

    Showcases every major block type with polished, realistic content
    so new users immediately see what the page builder can do.
    """
    page = Page(
        workspace_id=workspace_id,
        name="Complens.ai — AI Marketing Platform",
        slug="demo",
        status=PageStatus.PUBLISHED,
        headline="Turn Visitors into Customers — Automatically",
        subheadline="AI-powered landing pages, email warmup, and workflow automation in one platform.",
        primary_color="#6366f1",
        blocks=[
            # ── Hero ────────────────────────────────────────────────
            PageBlock(
                id="hero-1",
                type="hero",
                order=0,
                config={
                    "headline": "Turn Visitors into Customers — Automatically",
                    "subheadline": (
                        "Build beautiful landing pages in seconds, warm up your email reputation, "
                        "and let AI-powered workflows nurture every lead while you sleep."
                    ),
                    "showButton": True,
                    "buttonText": "Start Free Trial",
                    "buttonLink": "#get-started",
                    "backgroundType": "gradient",
                    "gradientFrom": "#4f46e5",
                    "gradientTo": "#7c3aed",
                    "textAlign": "center",
                },
            ),
            # ── Stats ───────────────────────────────────────────────
            PageBlock(
                id="stats-1",
                type="stats",
                order=1,
                config={
                    "title": "",
                    "items": [
                        {"value": "2,400+", "label": "Landing Pages Created"},
                        {"value": "98%", "label": "Email Deliverability"},
                        {"value": "3.2x", "label": "Lead Conversion Lift"},
                        {"value": "< 60s", "label": "Average Page Build Time"},
                    ],
                },
            ),
            # ── Features (6 items, 3 columns) ──────────────────────
            PageBlock(
                id="feat-1",
                type="features",
                order=2,
                config={
                    "title": "Everything You Need to Grow",
                    "subtitle": "One platform replaces your page builder, email tool, and automation stack.",
                    "columns": 3,
                    "items": [
                        {
                            "icon": "sparkles",
                            "title": "AI Page Builder",
                            "description": (
                                "Describe your business in plain English and get a "
                                "conversion-ready landing page in under a minute."
                            ),
                        },
                        {
                            "icon": "mail",
                            "title": "Email Warmup",
                            "description": (
                                "Automatically ramp your sending domain from 10 to 10,000 emails/day "
                                "with built-in reputation monitoring."
                            ),
                        },
                        {
                            "icon": "zap",
                            "title": "Workflow Automation",
                            "description": (
                                "Drag-and-drop visual workflows that send emails, tag contacts, "
                                "branch on conditions, and trigger AI responses."
                            ),
                        },
                        {
                            "icon": "message-circle",
                            "title": "AI Chat Widget",
                            "description": (
                                "Embed an intelligent chat assistant on any page — it knows your "
                                "business and qualifies leads 24/7."
                            ),
                        },
                        {
                            "icon": "bar-chart",
                            "title": "Real-Time Analytics",
                            "description": (
                                "Track page views, form submissions, email opens, and workflow "
                                "performance from a single dashboard."
                            ),
                        },
                        {
                            "icon": "globe",
                            "title": "Custom Domains & SSL",
                            "description": (
                                "Publish on your own domain with automatic SSL — or use a free "
                                "complens.ai subdomain to go live instantly."
                            ),
                        },
                    ],
                },
            ),
            # ── Divider ─────────────────────────────────────────────
            PageBlock(
                id="div-1",
                type="divider",
                order=3,
                config={"style": "dots", "height": "medium"},
            ),
            # ── Testimonials ────────────────────────────────────────
            PageBlock(
                id="test-1",
                type="testimonials",
                order=4,
                config={
                    "title": "Loved by Marketing Teams",
                    "items": [
                        {
                            "quote": (
                                "We replaced three separate tools with Complens and our lead "
                                "volume doubled in the first month. The AI page builder alone "
                                "saved us 20 hours a week."
                            ),
                            "author": "Sarah Chen",
                            "company": "GrowthLab Agency",
                            "avatar": "",
                        },
                        {
                            "quote": (
                                "Email warmup was a game-changer. We went from 60% inbox "
                                "placement to 98% in six weeks — completely hands-off."
                            ),
                            "author": "Marcus Rivera",
                            "company": "Outbound.io",
                            "avatar": "",
                        },
                        {
                            "quote": (
                                "The workflow builder is incredibly intuitive. I set up our "
                                "entire onboarding sequence in an afternoon — no developer needed."
                            ),
                            "author": "Priya Patel",
                            "company": "Neon Fitness Co.",
                            "avatar": "",
                        },
                    ],
                },
            ),
            # ── Pricing ─────────────────────────────────────────────
            PageBlock(
                id="price-1",
                type="pricing",
                order=5,
                config={
                    "title": "Simple, Transparent Pricing",
                    "subtitle": "Start free. Upgrade when you're ready.",
                    "items": [
                        {
                            "name": "Free",
                            "price": "$0",
                            "period": "/month",
                            "features": [
                                "1 landing page",
                                "100 contacts",
                                "Basic workflows",
                                "Complens.ai subdomain",
                                "Community support",
                            ],
                            "highlighted": False,
                            "buttonText": "Get Started",
                            "buttonLink": "#get-started",
                        },
                        {
                            "name": "Pro",
                            "price": "$49",
                            "period": "/month",
                            "features": [
                                "Unlimited pages",
                                "5,000 contacts",
                                "Email warmup (1 domain)",
                                "AI chat widget",
                                "Custom domain + SSL",
                                "Priority support",
                            ],
                            "highlighted": True,
                            "buttonText": "Start Free Trial",
                            "buttonLink": "#get-started",
                        },
                        {
                            "name": "Business",
                            "price": "$149",
                            "period": "/month",
                            "features": [
                                "Everything in Pro",
                                "50,000 contacts",
                                "Unlimited warmup domains",
                                "Advanced analytics",
                                "Team collaboration",
                                "Dedicated account manager",
                            ],
                            "highlighted": False,
                            "buttonText": "Contact Sales",
                            "buttonLink": "#get-started",
                        },
                    ],
                },
            ),
            # ── FAQ ──────────────────────────────────────────────────
            PageBlock(
                id="faq-1",
                type="faq",
                order=6,
                config={
                    "title": "Frequently Asked Questions",
                    "items": [
                        {
                            "question": "How does the AI page builder work?",
                            "answer": (
                                "Describe your business, choose a style, and our AI generates a "
                                "complete landing page with headlines, features, testimonials, and "
                                "a lead capture form — all in under 60 seconds. You can tweak "
                                "every block in the visual editor afterward."
                            ),
                        },
                        {
                            "question": "What is email warmup and why do I need it?",
                            "answer": (
                                "New email domains start with no reputation. If you send hundreds "
                                "of emails on day one, most will land in spam. Our warmup system "
                                "gradually increases your daily sending volume over 6 weeks while "
                                "monitoring bounce and complaint rates — so when you launch your "
                                "campaign, you hit the inbox."
                            ),
                        },
                        {
                            "question": "Can I use my own domain?",
                            "answer": (
                                "Absolutely. Point a CNAME record to Complens and we handle SSL "
                                "certificates automatically. You can also use a free subdomain "
                                "like yourname.complens.ai to get started immediately."
                            ),
                        },
                        {
                            "question": "Do I need to know how to code?",
                            "answer": (
                                "Not at all. Everything — pages, forms, workflows, and AI chat — "
                                "is built with drag-and-drop editors and plain-English prompts. "
                                "If you can write an email, you can use Complens."
                            ),
                        },
                        {
                            "question": "Is there a free trial?",
                            "answer": (
                                "Yes! The Free plan is free forever with 1 page and 100 contacts. "
                                "Pro and Business plans come with a 14-day free trial — no credit "
                                "card required."
                            ),
                        },
                    ],
                },
            ),
            # ── Final CTA ───────────────────────────────────────────
            PageBlock(
                id="cta-1",
                type="cta",
                order=7,
                config={
                    "headline": "Ready to Automate Your Marketing?",
                    "description": (
                        "Join thousands of businesses using Complens.ai to build pages, "
                        "warm up domains, and convert leads on autopilot."
                    ),
                    "buttonText": "Start Your Free Trial",
                    "buttonLink": "#get-started",
                    "backgroundColor": "#4f46e5",
                    "textColor": "light",
                },
            ),
            # ── Lead Capture Form ────────────────────────────────────
            PageBlock(
                id="form-1",
                type="form",
                order=8,
                config={
                    "title": "Get Started Today",
                    "description": "Enter your email and we'll set up your workspace in seconds.",
                    "formId": "",  # Updated after form creation
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
                id="first_name",
                name="first_name",
                label="First Name",
                type=FormFieldType.TEXT,
                required=True,
                placeholder="Jane",
                map_to_contact_field="first_name",
            ),
            FormField(
                id="email",
                name="email",
                label="Work Email",
                type=FormFieldType.EMAIL,
                required=True,
                placeholder="jane@company.com",
                map_to_contact_field="email",
            ),
            FormField(
                id="company",
                name="company",
                label="Company",
                type=FormFieldType.TEXT,
                required=False,
                placeholder="Acme Inc.",
                map_to_contact_field="company",
            ),
            FormField(
                id="message",
                name="message",
                label="What are you looking to achieve?",
                type=FormFieldType.TEXTAREA,
                required=False,
                placeholder="e.g. I want to generate more leads from my website...",
            ),
        ],
        submit_button_text="Start Free Trial",
        success_message="You're in! Check your email for next steps.",
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
    """Create the demo workflow with 4 nodes.

    Trigger → Welcome Email → Notify Owner → Tag as Lead
    """
    wf_repo = WorkflowRepository(table_name=table_name)

    trigger_id = "trigger-1"
    email_id = "email-1"
    notify_id = "notify-1"
    update_id = "update-1"

    workflow = Workflow(
        workspace_id=workspace_id,
        page_id=page_id,
        name="Welcome New Leads",
        description=(
            "When someone fills out the demo form: sends a welcome email, "
            "notifies the workspace owner, and tags the contact as a lead."
        ),
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
                        "email_subject": "Welcome to Complens, {{contact.first_name}}!",
                        "email_body": (
                            "Hi {{contact.first_name}},\n\n"
                            "Thanks for signing up! Your workspace is ready.\n\n"
                            "Here's what you can do right now:\n"
                            "1. Build a landing page with AI\n"
                            "2. Set up email warmup for your domain\n"
                            "3. Create your first automation workflow\n\n"
                            "If you have any questions, just reply to this email — "
                            "a real human will get back to you within the hour.\n\n"
                            "Best,\nThe Complens.ai Team"
                        ),
                    },
                },
            ),
            WorkflowNode(
                id=notify_id,
                type="action_send_email",
                position=NodePosition(x=250, y=350),
                data={
                    "label": "Notify Owner",
                    "config": {
                        "email_to": "{{workspace.notification_email}}",
                        "email_subject": "New lead: {{contact.first_name}} ({{contact.email}})",
                        "email_body": (
                            "New lead from your landing page!\n\n"
                            "Name: {{contact.first_name}}\n"
                            "Email: {{contact.email}}\n"
                            "Company: {{trigger_data.form_data.company}}\n"
                            "Message: {{trigger_data.form_data.message}}\n\n"
                            "View in dashboard: https://app.complens.ai/contacts"
                        ),
                    },
                },
            ),
            WorkflowNode(
                id=update_id,
                type="action_update_contact",
                position=NodePosition(x=250, y=500),
                data={
                    "label": "Tag as Lead",
                    "config": {"add_tags": ["lead", "demo-page"]},
                },
            ),
        ],
        edges=[
            WorkflowEdge(id="e1", source=trigger_id, target=email_id),
            WorkflowEdge(id="e2", source=email_id, target=notify_id),
            WorkflowEdge(id="e3", source=notify_id, target=update_id),
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
            steps_completed=4 if is_completed else rng.randint(1, 3),
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
        ExpressionAttributeValues={":views": 1_247, ":subs": 83},
    )


def _set_form_counter(table, workspace_id: str, form_id: str) -> None:
    """Set demo submission counter on the form."""
    table.update_item(
        Key={"PK": f"WS#{workspace_id}", "SK": f"FORM#{form_id}"},
        UpdateExpression="SET submission_count = :count",
        ExpressionAttributeValues={":count": 83},
    )


def _set_workflow_counters(table, workspace_id: str, workflow_id: str) -> None:
    """Set demo run counters on the workflow."""
    table.update_item(
        Key={"PK": f"WS#{workspace_id}", "SK": f"WF#{workflow_id}"},
        UpdateExpression="SET total_runs = :total, successful_runs = :success, failed_runs = :failed",
        ExpressionAttributeValues={":total": 15, ":success": 12, ":failed": 3},
    )
