"""AI Service for contextual content generation.

This service provides AI capabilities that use the business profile
for context-aware generation of pages, blocks, workflows, and more.
"""

import json
import os
import uuid
from typing import Any

import boto3
import structlog
from botocore.config import Config

from complens.models.business_profile import BusinessProfile
from complens.repositories.business_profile import BusinessProfileRepository

logger = structlog.get_logger()

# Bedrock model configuration
# Using cross-region inference profiles (us. prefix) for newer models
DEFAULT_MODEL = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"  # Claude Sonnet 4.5
FAST_MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0"  # Claude Haiku 4.5
IMAGE_MODEL = "amazon.titan-image-generator-v2:0"  # Amazon Titan Image Generator v2

# Bedrock timeout configuration
# Prevents hung requests from blocking Lambda execution indefinitely
BEDROCK_CONFIG = Config(
    read_timeout=60,      # 60 second read timeout for response streaming
    connect_timeout=10,   # 10 second connection timeout
    retries={
        "max_attempts": 2,           # Retry once on transient failures
        "mode": "adaptive",          # Use adaptive retry mode for better backoff
    },
)

# Initialize clients with timeout configuration
bedrock = boto3.client("bedrock-runtime", config=BEDROCK_CONFIG)


def get_business_context(
    workspace_id: str,
    page_id: str | None = None,
    site_id: str | None = None,
) -> str:
    """Get the business profile context for a workspace, site, or page.

    Args:
        workspace_id: The workspace ID.
        page_id: Optional page ID for page-specific profile.
        site_id: Optional site ID for site-specific profile.

    Returns:
        Formatted context string for AI prompts.
    """
    repo = BusinessProfileRepository()
    # Cascade read (page → site → workspace) — never create as a side-effect
    profile = repo.get_effective_profile(workspace_id, page_id, site_id)
    if not profile:
        return ""
    return profile.get_ai_context()


def get_kb_context(workspace_id: str, query: str, site_id: str | None = None) -> str:
    """Retrieve relevant knowledge base documents for AI prompts.

    Args:
        workspace_id: The workspace ID.
        query: Search query to find relevant documents.
        site_id: Optional site ID for site-scoped retrieval.

    Returns:
        Formatted context string from KB, or empty string if no results.
    """
    try:
        from complens.services.knowledge_base_service import KnowledgeBaseService

        kb_service = KnowledgeBaseService()
        results = kb_service.retrieve(workspace_id, query, max_results=3, site_id=site_id)

        if not results:
            return ""

        parts = ["=== KNOWLEDGE BASE ==="]
        for r in results:
            text = r.get("text", "").strip()
            if text:
                parts.append(text)

        return "\n\n".join(parts) if len(parts) > 1 else ""
    except Exception as e:
        logger.warning("KB retrieval failed", error=str(e))
        return ""


def invoke_claude(
    prompt: str,
    system: str | None = None,
    workspace_id: str | None = None,
    page_id: str | None = None,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 4096,
    temperature: float = 0.7,
    site_id: str | None = None,
) -> str:
    """Invoke Claude with optional business context.

    Args:
        prompt: The user prompt.
        system: Optional system prompt (business context added automatically).
        workspace_id: Optional workspace ID for business context.
        page_id: Optional page ID for page-specific profile.
        model: The model to use.
        max_tokens: Maximum tokens to generate.
        temperature: Sampling temperature.
        site_id: Optional site ID for site-specific profile.

    Returns:
        The generated text response.
    """
    # Build system prompt with business context
    system_parts = []

    if workspace_id:
        context = get_business_context(workspace_id, page_id, site_id)
        if context:
            system_parts.append(context)
            system_parts.append("")  # Add blank line

        # Include knowledge base context
        kb_context = get_kb_context(workspace_id, prompt, site_id=site_id)
        if kb_context:
            system_parts.append(kb_context)
            system_parts.append("")

    if system:
        system_parts.append(system)

    full_system = "\n".join(system_parts) if system_parts else None

    # Build request
    messages = [{"role": "user", "content": prompt}]

    request_body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": messages,
    }

    if full_system:
        request_body["system"] = full_system

    try:
        response = bedrock.invoke_model(
            modelId=model,
            body=json.dumps(request_body),
            contentType="application/json",
            accept="application/json",
        )

        response_body = json.loads(response["body"].read())
        return response_body["content"][0]["text"]

    except Exception as e:
        logger.error("Claude invocation failed", error=str(e))
        raise


def invoke_claude_json(
    prompt: str,
    system: str | None = None,
    workspace_id: str | None = None,
    page_id: str | None = None,
    model: str = DEFAULT_MODEL,
    site_id: str | None = None,
) -> dict:
    """Invoke Claude and parse JSON response.

    Args:
        prompt: The user prompt (should request JSON output).
        system: Optional system prompt.
        workspace_id: Optional workspace ID for business context.
        page_id: Optional page ID for page-specific profile.
        model: The model to use.
        site_id: Optional site ID for site-specific profile.

    Returns:
        Parsed JSON response as dict.
    """
    response = invoke_claude(
        prompt=prompt,
        system=system,
        workspace_id=workspace_id,
        page_id=page_id,
        model=model,
        temperature=0.5,  # Lower temperature for structured output
        site_id=site_id,
    )

    # Try to parse JSON from response
    try:
        # Handle markdown code blocks
        if "```json" in response:
            json_start = response.find("```json") + 7
            json_end = response.find("```", json_start)
            response = response[json_start:json_end].strip()
        elif "```" in response:
            json_start = response.find("```") + 3
            json_end = response.find("```", json_start)
            response = response[json_start:json_end].strip()

        return json.loads(response)

    except json.JSONDecodeError as e:
        logger.error("Failed to parse JSON response", response=response, error=str(e))
        raise ValueError(f"Invalid JSON response from AI: {e}")


def improve_block_content(
    workspace_id: str,
    block_type: str,
    current_config: dict,
    page_context: dict | None = None,
    instruction: str = "Improve this content",
    page_id: str | None = None,
    site_id: str | None = None,
) -> dict:
    """Improve a block's content using AI with full context.

    Args:
        workspace_id: The workspace ID for business context.
        block_type: The type of block (hero, features, etc.).
        current_config: The current block configuration.
        page_context: Optional context about the page (headline, other blocks).
        instruction: What kind of improvement to make.
        page_id: Optional page ID for page-specific profile.

    Returns:
        Improved block configuration.
    """
    # Build context about the page
    page_info = ""
    if page_context:
        if page_context.get("headline"):
            page_info += f"Page headline: {page_context['headline']}\n"
        if page_context.get("subheadline"):
            page_info += f"Page subheadline: {page_context['subheadline']}\n"
        if page_context.get("other_blocks"):
            page_info += f"Other blocks on page: {', '.join(page_context['other_blocks'])}\n"

    system = f"""You are an expert copywriter and UX designer.
You're improving content for a {block_type} block on a landing page.

{page_info}

Your task: {instruction}

Important guidelines:
- Match the brand voice and tone from the business context
- Keep copy concise and impactful
- Use power words that resonate with the target audience
- Focus on benefits, not just features
- Include clear calls to action where appropriate

Return ONLY valid JSON with the improved block configuration.
Do not include any explanation or markdown - just the JSON object."""

    prompt = f"""Current {block_type} block configuration:
{json.dumps(current_config, indent=2)}

Improve this content following the instruction: {instruction}

Return the improved configuration as a JSON object with the same structure."""

    return invoke_claude_json(prompt, system, workspace_id, page_id, site_id=site_id)


def generate_page_blocks(
    workspace_id: str,
    description: str,
    style: str = "professional",
    include_form: bool = True,
    include_chat: bool = False,
    page_id: str | None = None,
    site_id: str | None = None,
) -> list[dict]:
    """Generate page blocks from a description using AI with full context.

    Args:
        workspace_id: The workspace ID for business context.
        description: Description of what the page should be about.
        style: Visual style (professional, bold, minimal, playful).
        include_form: Whether to include a lead capture form.
        include_chat: Whether to include a chat widget.
        page_id: Optional page ID for page-specific profile.

    Returns:
        List of block configurations.
    """
    system = f"""You are an expert landing page designer.
You create high-converting landing pages that perfectly match the business context.

Visual style: {style}
Include form block: {include_form}
Include chat block: {include_chat}

Create a complete page with these block types:
- hero: Full-screen header with headline, subheadline, CTA button
- features: 2-3 feature cards with icons and descriptions
- stats: Key metrics or achievements (if available from context)
- testimonials: Customer quotes (if available from context)
- cta: Call-to-action section
- form: Lead capture form (if include_form is true)
- faq: Frequently asked questions (if relevant)

Important:
- Use REAL content from the business context, not placeholders
- Headlines should be compelling and benefit-focused
- Copy should speak directly to the target audience's pain points
- Include specific numbers and achievements from the business profile
- Match the brand voice exactly

Return ONLY valid JSON array of block objects. Each block should have:
- id: unique 8-char string
- type: block type
- order: position (0-indexed)
- width: 4 (full width)
- config: block-specific configuration"""

    prompt = f"""Create a landing page based on this description:

{description}

Generate the blocks as a JSON array. Use the business context to personalize all content."""

    blocks = invoke_claude_json(prompt, system, workspace_id, page_id, site_id=site_id)

    # Ensure it's a list
    if isinstance(blocks, dict) and "blocks" in blocks:
        blocks = blocks["blocks"]

    return blocks if isinstance(blocks, list) else []


def suggest_next_workflow_step(
    workspace_id: str,
    nodes: list[dict],
    edges: list[dict],
    source_node_id: str,
    page_id: str | None = None,
    forms: list[dict] | None = None,
    pages: list[dict] | None = None,
    domains: list[str] | None = None,
    site_id: str | None = None,
) -> list[dict]:
    """Suggest the next workflow step based on current workflow context.

    Args:
        workspace_id: The workspace ID for business context.
        nodes: Simplified list of current nodes [{id, type, label, config}].
        edges: List of current edges [{source, target}].
        source_node_id: The node ID to build from.
        page_id: Optional page ID for page-specific profile.
        forms: Available forms [{id, name}].
        pages: Available pages [{id, name}].
        domains: Verified domain names.

    Returns:
        List of suggestion dicts with node_type, label, config, description.
    """
    # Build workflow summary
    source_node = next((n for n in nodes if n.get("id") == source_node_id), None)
    workflow_lines = []
    for n in nodes:
        connections = [e["target"] for e in edges if e["source"] == n["id"]]
        conn_str = f" -> {', '.join(connections)}" if connections else " -> (no outgoing)"
        workflow_lines.append(f"  - [{n.get('type', '?')}] \"{n.get('label', '?')}\" (id: {n['id']}){conn_str}")

    workflow_summary = "\n".join(workflow_lines) if workflow_lines else "  (empty workflow)"

    # Build resources context
    resources_parts = []
    if forms:
        resources_parts.append(f"Available forms: {json.dumps(forms)}")
    if pages:
        resources_parts.append(f"Available pages: {json.dumps(pages)}")
    if domains:
        resources_parts.append(f"Verified domains: {json.dumps(domains)}")
    resources_ctx = "\n".join(resources_parts) if resources_parts else "No workspace resources available yet."

    system = f"""You are an expert marketing automation architect.
Given a workflow-in-progress, suggest 3-4 logical next nodes to connect after a specific node.

## Available node types and their config schemas

### Actions
- action_send_email:
    email_to: "{{{{contact.email}}}}" (default)
    email_subject: "Subject line" (REQUIRED)
    email_body: "Email body with {{{{contact.first_name}}}} variables" (REQUIRED)
    email_from: "noreply@domain.com" (optional, use verified domain if available)

- action_send_sms:
    sms_to: "{{{{contact.phone}}}}"
    sms_message: "SMS text" (REQUIRED)

- action_ai_respond:
    ai_prompt: "Instruction for AI" (REQUIRED)
    ai_respond_via: "email" | "sms" | "same_channel"

- action_update_contact:
    add_tags: ["tag1", "tag2"]
    remove_tags: ["tag3"]
    update_fields: {{"field_name": "value"}}

- action_wait:
    wait_duration: 300 (integer seconds: 300=5min, 3600=1hr, 86400=1day)

- action_webhook:
    webhook_url: "https://..." (REQUIRED)
    webhook_method: "POST"
    webhook_headers: {{}}
    webhook_body: {{}}

### Logic
- logic_branch:
    conditions: [{{"field": "contact.tags", "operator": "contains", "value": "vip", "output_handle": "yes"}}, {{"output_handle": "no"}}]
    default_output: "no"

- logic_filter:
    filter_conditions: [{{"field": "contact.email", "operator": "exists"}}]
    filter_operator: "and"

### AI Nodes
- ai_decision: config with ai_prompt describing the decision
- ai_generate: config with ai_prompt describing what to generate
- ai_analyze: config with ai_prompt describing what to analyze

## Template variables
{{{{contact.email}}}}, {{{{contact.first_name}}}}, {{{{contact.last_name}}}}, {{{{contact.phone}}}},
{{{{contact.custom_fields.company}}}}, {{{{trigger_data.form_data.message}}}},
{{{{workspace.notification_email}}}}, {{{{owner.email}}}}

## Rules
- Return exactly 3-4 suggestions ranked by relevance
- Each suggestion must have complete, ready-to-use config
- Use real business context (name, domain, voice) in email copy
- Use real form/page IDs when referencing workspace resources
- Don't suggest node types that are already downstream of the source node
- Tailor suggestions to what makes sense after the source node's type
- Write real email subjects/bodies, not placeholders

Return ONLY valid JSON array. No markdown, no explanation."""

    source_desc = "unknown node"
    if source_node:
        source_desc = f"[{source_node.get('type', '?')}] \"{source_node.get('label', '?')}\""

    prompt = f"""Current workflow:
{workflow_summary}

Building from node: {source_desc} (id: {source_node_id})

{resources_ctx}

Suggest 3-4 logical next nodes to connect after this node.
Return a JSON array where each element has:
- "node_type": the node type string
- "label": short display name
- "description": one-line explanation of why this step is useful
- "config": complete config object ready to use"""

    result = invoke_claude_json(prompt, system, workspace_id, page_id, model=FAST_MODEL, site_id=site_id)

    # Normalize: accept both array and {"suggestions": [...]}
    if isinstance(result, dict) and "suggestions" in result:
        result = result["suggestions"]

    if not isinstance(result, list):
        return []

    return result[:4]


def generate_page_workflow(
    workspace_id: str,
    page_id: str,
    page: dict,
    forms: list[dict],
    domains: list[str] | None = None,
    from_email: str | None = None,
    owner_email: str | None = None,
    site_id: str | None = None,
) -> dict:
    """Generate a complete workflow for a landing page.

    Uses a two-phase approach: AI generates a simple step list (what to do),
    then deterministic Python builds the actual workflow nodes/edges.

    Args:
        workspace_id: The workspace ID.
        page_id: The page ID (used for profile lookup).
        page: Page data dict with headline, blocks, etc.
        forms: List of form dicts with id, name, fields.
        domains: Verified domain names for email from-addresses.
        from_email: Resolved sender email address.
        owner_email: Owner/notification email address.

    Returns:
        Dict with name, description, trigger_type, nodes[], edges[].
    """
    # Build page content summary
    page_name = page.get("name") or page.get("headline") or "Untitled Page"
    headline = page.get("headline", "")
    subheadline = page.get("subheadline", "")
    blocks = page.get("blocks", [])

    block_summary_lines = []
    for b in blocks:
        btype = b.get("type", "unknown")
        bconfig = b.get("config", {})
        if btype == "hero":
            parts = [f"Hero: \"{bconfig.get('headline', '')}\""]
            if bconfig.get("subheadline"):
                parts.append(f"    Subheadline: \"{bconfig['subheadline']}\"")
            if bconfig.get("ctaText"):
                parts.append(f"    CTA: \"{bconfig['ctaText']}\"")
            block_summary_lines.append("  - " + "\n".join(parts))
        elif btype == "features":
            items = bconfig.get("items", [])
            if items:
                feature_lines = [f"Features ({len(items)} items):"]
                for item in items[:6]:
                    title = item.get("title", "")
                    desc = item.get("description", "")
                    if title:
                        feature_lines.append(f"    • {title}" + (f" — {desc}" if desc else ""))
                block_summary_lines.append("  - " + "\n".join(feature_lines))
            else:
                block_summary_lines.append("  - Features: (empty)")
        elif btype == "form":
            block_summary_lines.append(f"  - Form block (formId: {bconfig.get('formId', 'none')})")
        elif btype == "cta":
            parts = [f"CTA: \"{bconfig.get('headline', '')}\""]
            if bconfig.get("subheadline"):
                parts.append(f"    Subheadline: \"{bconfig['subheadline']}\"")
            if bconfig.get("buttonText"):
                parts.append(f"    Button: \"{bconfig['buttonText']}\"")
            block_summary_lines.append("  - " + "\n".join(parts))
        elif btype == "testimonials":
            items = bconfig.get("items", [])
            if items:
                testimonial_lines = [f"Testimonials ({len(items)} quotes):"]
                for item in items[:4]:
                    quote = item.get("quote", "")
                    author = item.get("author", "")
                    if quote:
                        short_quote = quote[:120] + "..." if len(quote) > 120 else quote
                        testimonial_lines.append(f"    • \"{short_quote}\" — {author}" if author else f"    • \"{short_quote}\"")
                block_summary_lines.append("  - " + "\n".join(testimonial_lines))
            else:
                block_summary_lines.append("  - Testimonials: (empty)")
        elif btype == "faq":
            items = bconfig.get("items", [])
            if items:
                faq_lines = [f"FAQ ({len(items)} questions):"]
                for item in items[:6]:
                    q = item.get("question", "")
                    if q:
                        faq_lines.append(f"    • {q}")
                block_summary_lines.append("  - " + "\n".join(faq_lines))
            else:
                block_summary_lines.append("  - FAQ: (empty)")
        elif btype == "pricing":
            items = bconfig.get("items", [])
            if items:
                pricing_lines = [f"Pricing ({len(items)} tiers):"]
                for item in items[:4]:
                    name = item.get("name", "")
                    price = item.get("price", "")
                    if name:
                        pricing_lines.append(f"    • {name}: {price}" if price else f"    • {name}")
                block_summary_lines.append("  - " + "\n".join(pricing_lines))
            else:
                block_summary_lines.append("  - Pricing: (empty)")
        elif btype == "text":
            content = bconfig.get("content", "")
            if content:
                short = content[:200] + "..." if len(content) > 200 else content
                block_summary_lines.append(f"  - Text: \"{short}\"")
            else:
                block_summary_lines.append("  - Text block")
        elif btype == "stats":
            items = bconfig.get("items", [])
            if items:
                stat_parts = [f"{s.get('value', '')} {s.get('label', '')}" for s in items[:4]]
                block_summary_lines.append(f"  - Stats: {', '.join(stat_parts)}")
            else:
                block_summary_lines.append("  - Stats block")
        elif btype == "chat":
            block_summary_lines.append("  - AI Chat widget")
        else:
            block_summary_lines.append(f"  - {btype}")

    block_summary = "\n".join(block_summary_lines) if block_summary_lines else "  (no blocks)"

    # Build form details
    form_details_lines = []
    for f in forms:
        fields = f.get("fields", [])
        field_names = [fld.get("label") or fld.get("name", "?") for fld in fields]
        tags = f.get("add_tags", [])
        form_details_lines.append(
            f"  - Form \"{f.get('name', 'Unnamed')}\" (id: {f.get('id', '?')})\n"
            f"    Fields: {', '.join(field_names) if field_names else 'none'}\n"
            f"    Auto-tags: {', '.join(tags) if tags else 'none'}"
        )
    form_details = "\n".join(form_details_lines) if form_details_lines else "  (no forms on this page)"

    # Domain context for AI
    domain_ctx = f"Verified domains: {', '.join(domains)}" if domains else "No verified domains"

    system = f"""You are an expert marketing automation architect.
Given a landing page with its content, forms, and business profile, design a
step-by-step automation sequence that handles everything when someone submits a form.

You output ONLY a simple step list — you do NOT need to worry about node IDs, positions,
edge wiring, or any visual layout. Just describe WHAT should happen, in order.

## Available step types

- tag_contact: Add tags to the contact
  Required: "tags" (array of strings)

- send_email: Send an email
  Required: "to" ("contact" or "owner"), "subject", "body"
  The body can use template variables like {{{{contact.first_name}}}}, {{{{contact.last_name}}}},
  {{{{contact.email}}}}, {{{{contact.phone}}}}, {{{{trigger_data.form_data.message}}}}

- wait: Pause before the next step
  Required: "duration" (integer seconds: 300=5min, 3600=1hr, 86400=1day)
  Optional: "label" (e.g. "Wait 1 Day")

## Rules
- Design a realistic 3-6 step sequence
- A typical flow: tag contact → welcome email to contact → notify owner → wait → follow-up email
- Write REAL email copy that matches the business's brand voice and page content
- Include meaningful tag names based on the page's purpose
- Wait steps should use realistic durations (e.g., 86400 for a 1-day follow-up)
- Emails to "contact" should be warm and professional
- Emails to "owner" should include lead details with template variables

## Output format
Return JSON with:
- name: workflow name (related to the page purpose)
- description: one-line description
- steps: array of step objects

Example:
{{
  "name": "Lead Automation - Acme Co",
  "description": "Handles new form submissions from the Acme landing page",
  "steps": [
    {{"action": "tag_contact", "tags": ["lead", "website"]}},
    {{"action": "send_email", "to": "contact", "subject": "Thanks!", "body": "Hi {{{{contact.first_name}}}}..."}},
    {{"action": "send_email", "to": "owner", "subject": "New Lead", "body": "New lead..."}},
    {{"action": "wait", "duration": 86400, "label": "Wait 1 Day"}},
    {{"action": "send_email", "to": "contact", "subject": "Following up", "body": "Hi {{{{contact.first_name}}}}..."}}
  ]
}}

Return ONLY valid JSON. No markdown, no explanation."""

    prompt = f"""Page: "{page_name}"
Headline: "{headline}"
Subheadline: "{subheadline}"

Page blocks:
{block_summary}

Forms:
{form_details}

{domain_ctx}

Design the automation steps for this landing page.
Write real email copy that matches this page's purpose and brand voice."""

    result = invoke_claude_json(prompt, system, workspace_id, page_id, model=FAST_MODEL, site_id=site_id)

    if not isinstance(result, dict) or "steps" not in result:
        logger.warning("generate_page_workflow: unexpected AI result", result_type=type(result).__name__)
        result = {
            "name": f"Workflow for {page_name}",
            "description": "Auto-generated workflow",
            "steps": [],
        }

    # Pick the first form ID for the trigger
    form_id = forms[0].get("id", "") if forms else ""

    # Build deterministic workflow from AI step list
    return build_workflow_from_steps(
        steps=result.get("steps", []),
        name=result.get("name", f"Workflow for {page_name}"),
        description=result.get("description", "Auto-generated workflow"),
        form_id=form_id,
        from_email=from_email,
        owner_email=owner_email,
    )


def build_workflow_from_steps(
    steps: list[dict],
    name: str,
    description: str,
    form_id: str,
    from_email: str | None = None,
    owner_email: str | None = None,
) -> dict:
    """Convert a flat step list into a complete workflow with nodes and edges.

    This is the deterministic builder — it handles all IDs, positions, types,
    and edge wiring so the AI never has to.

    Args:
        steps: List of step dicts from AI (action, config fields).
        name: Workflow name.
        description: Workflow description.
        form_id: Form ID for the trigger node.
        from_email: Sender email address (from verified domain/workspace).
        owner_email: Owner notification email address.

    Returns:
        Dict with name, description, trigger_type, nodes[], edges[].
    """
    # Map step action to node type and React Flow category
    ACTION_MAP = {
        "tag_contact": ("action_update_contact", "action"),
        "send_email": ("action_send_email", "action"),
        "wait": ("action_wait", "action"),
        "send_sms": ("action_send_sms", "action"),
        "ai_respond": ("action_ai_respond", "ai"),
        "webhook": ("action_webhook", "action"),
    }

    nodes = []
    edges = []
    node_y = 100

    # Always start with a trigger node
    trigger_id = str(uuid.uuid4())[:8]
    nodes.append({
        "id": trigger_id,
        "type": "trigger",
        "position": {"x": 250, "y": node_y},
        "data": {
            "label": "Form Submitted",
            "nodeType": "trigger_form_submitted",
            "config": {"form_id": form_id},
        },
    })
    last_node_id = trigger_id
    node_y += 150

    # Track whether we have parallel nodes at the same y level
    # (e.g. welcome email + owner notification sent from the same parent)
    for step in steps:
        action = step.get("action", "")
        if action not in ACTION_MAP:
            logger.warning("build_workflow_from_steps: unknown action, skipping", action=action)
            continue

        node_type, rf_type = ACTION_MAP[action]
        node_id = str(uuid.uuid4())[:8]
        config = {}
        label = ""

        if action == "tag_contact":
            tags = step.get("tags", [])
            config = {"add_tags": tags}
            label = "Tag Contact"

        elif action == "send_email":
            to = step.get("to", "contact")
            subject = step.get("subject", "")
            body = step.get("body", "")

            if to == "owner":
                config = {
                    "email_to": owner_email or "{{owner.email}}",
                    "email_subject": subject,
                    "email_body": body,
                }
                label = "Notify Owner"
            else:
                config = {
                    "email_to": "{{contact.email}}",
                    "email_subject": subject,
                    "email_body": body,
                }
                label = step.get("label", subject[:30] if subject else "Send Email")

            if from_email:
                config["email_from"] = from_email

        elif action == "wait":
            duration = step.get("duration", 86400)
            config = {"wait_duration": duration}
            label = step.get("label", f"Wait {_format_duration(duration)}")

        elif action == "send_sms":
            config = {
                "sms_to": "{{contact.phone}}",
                "sms_message": step.get("message", ""),
            }
            label = "Send SMS"

        elif action == "ai_respond":
            config = {
                "ai_prompt": step.get("prompt", ""),
                "ai_respond_via": step.get("via", "email"),
            }
            label = "AI Response"

        elif action == "webhook":
            config = {
                "webhook_url": step.get("url", ""),
                "webhook_method": step.get("method", "POST"),
            }
            label = "Call Webhook"

        nodes.append({
            "id": node_id,
            "type": rf_type,
            "position": {"x": 250, "y": node_y},
            "data": {
                "label": label,
                "nodeType": node_type,
                "config": config,
            },
        })
        edges.append({
            "id": f"e-{last_node_id}-{node_id}",
            "source": last_node_id,
            "target": node_id,
        })
        last_node_id = node_id
        node_y += 150

    return {
        "name": name,
        "description": description,
        "trigger_type": "trigger_form_submitted",
        "nodes": nodes,
        "edges": edges,
    }


def _format_duration(seconds: int) -> str:
    """Format seconds into a human-readable duration label."""
    if seconds >= 86400:
        days = seconds // 86400
        return f"{days} Day{'s' if days != 1 else ''}"
    if seconds >= 3600:
        hours = seconds // 3600
        return f"{hours} Hour{'s' if hours != 1 else ''}"
    minutes = seconds // 60
    return f"{minutes} Min{'s' if minutes != 1 else ''}"


def autofill_node_config(
    workspace_id: str,
    node_type: str,
    current_config: dict,
    preceding_nodes: list[dict],
    business_profile: dict | None = None,
    site_id: str | None = None,
) -> dict:
    """Suggest values for empty fields in a workflow node's configuration.

    Uses AI to intelligently fill in unconfigured fields based on the node
    type, what the preceding nodes do, and the business profile context.

    Args:
        workspace_id: The workspace ID for business context.
        node_type: The workflow node type (e.g. 'action_send_email').
        current_config: The current (possibly empty/partial) config dict.
        preceding_nodes: List of preceding node dicts [{type, label, config}].
        business_profile: Optional business profile dict for extra context.

    Returns:
        Dict of field:value pairs for fields that were empty.
    """
    # Build preceding nodes summary
    if preceding_nodes:
        preceding_lines = []
        for i, node in enumerate(preceding_nodes, 1):
            ntype = node.get("type") or node.get("nodeType", "unknown")
            label = node.get("label", "")
            config = node.get("config", {})
            config_summary = json.dumps(config, indent=2) if config else "{}"
            preceding_lines.append(
                f"  {i}. [{ntype}] \"{label}\"\n     Config: {config_summary}"
            )
        preceding_summary = "\n".join(preceding_lines)
    else:
        preceding_summary = "  (this is the first node in the workflow)"

    # Build business profile context
    profile_ctx = ""
    if business_profile:
        profile_parts = []
        for key in ("business_name", "description", "industry", "target_audience",
                     "brand_voice", "unique_value_proposition"):
            if business_profile.get(key):
                profile_parts.append(f"- {key}: {business_profile[key]}")
        if profile_parts:
            profile_ctx = "Business profile:\n" + "\n".join(profile_parts)

    # Identify empty fields
    empty_fields = [k for k, v in current_config.items() if not v]
    all_empty = not any(bool(v) for v in current_config.values()) if current_config else True

    empty_note = ""
    if current_config and not all_empty:
        empty_note = f"\nFields that are currently EMPTY and need values: {', '.join(empty_fields) if empty_fields else 'all fields'}"
        empty_note += f"\nFields that already have values (DO NOT override): {json.dumps({k: v for k, v in current_config.items() if v})}"

    system = f"""You are an expert marketing automation architect.
Given a workflow node type, its current configuration, and the preceding nodes in the
workflow, suggest smart default values for any EMPTY fields.

## Node type config schemas

### Triggers
- trigger_form_submitted: form_id
- trigger_tag_added: tag_name, tag_operation (added|removed|any)
- trigger_webhook: webhook_path, webhook_secret
- trigger_schedule: cron_expression, timezone
- trigger_chat_message: body_contains
- trigger_sms_received: from_pattern, body_contains
- trigger_email_received: from_pattern, body_contains

### Actions
- action_send_email: email_to, email_subject, email_body, email_from (optional)
- action_send_sms: sms_to, sms_message
- action_ai_respond: ai_prompt, ai_respond_via (email|sms|same_channel)
- action_update_contact: add_tags, remove_tags, update_fields
- action_wait: wait_duration (integer seconds: 300=5min, 3600=1hr, 86400=1day)
- action_webhook: webhook_url, webhook_method, webhook_headers, webhook_body

### Logic
- logic_branch: conditions (array of condition objects with field, operator, value, output_handle), default_output
- logic_filter: filter_conditions (array), filter_operator (and|or)
- logic_ab_split: split_percentages (object like {{"a": 50, "b": 50}})

### AI Nodes
- ai_decision: ai_prompt
- ai_generate: ai_prompt
- ai_analyze: ai_prompt

## Template variables
{{{{contact.email}}}}, {{{{contact.first_name}}}}, {{{{contact.last_name}}}}, {{{{contact.phone}}}},
{{{{contact.custom_fields.company}}}}, {{{{trigger_data.form_data.message}}}},
{{{{workspace.notification_email}}}}, {{{{owner.email}}}}

## Rules
- ONLY suggest values for fields that are currently empty or missing
- DO NOT override fields that already have values
- Use the preceding nodes to understand context (e.g. if the trigger is form_submitted, use form template variables in email body)
- Use real business context (name, brand voice) in any copy you write
- Write real email subjects/bodies, not placeholders
- For wait durations, choose realistic values based on what comes before/after

{profile_ctx}

Return ONLY valid JSON object with field:value pairs for the suggested fields.
No markdown, no explanation."""

    prompt = f"""Node type: {node_type}
Current config: {json.dumps(current_config, indent=2)}
{empty_note}

Preceding nodes (in order, earliest first):
{preceding_summary}

Suggest values for the empty fields in this node's configuration.
Return a JSON object with only the field names and suggested values."""

    result = invoke_claude_json(prompt, system, workspace_id, model=FAST_MODEL, site_id=site_id)

    # Only return suggestions for fields that were actually empty
    if current_config and not all_empty:
        result = {k: v for k, v in result.items() if k in empty_fields or k not in current_config}

    return result


def generate_workflow_from_description(
    workspace_id: str,
    description: str,
    available_triggers: list[str] | None = None,
    available_actions: list[str] | None = None,
    site_id: str | None = None,
) -> dict:
    """Generate a workflow from a natural language description.

    Args:
        workspace_id: The workspace ID for business context.
        description: Natural language description of the workflow.
        available_triggers: List of available trigger types.
        available_actions: List of available action types.

    Returns:
        Workflow configuration with nodes and edges.
    """
    triggers = available_triggers or [
        "trigger_form_submitted",
        "trigger_tag_added",
        "trigger_webhook",
        "trigger_schedule",
        "trigger_chat_message",
    ]

    actions = available_actions or [
        "action_send_email",
        "action_send_sms",
        "action_ai_respond",
        "action_update_contact",
        "action_wait",
        "action_webhook",
    ]

    system = f"""You are an expert at creating marketing automation workflows.
You create workflows that align with the business goals and target audience.

## Available node types

### Triggers (start of workflow)
{', '.join(triggers)}

Trigger config fields by type:
- trigger_form_submitted: {{"form_id": "optional-form-id"}}
- trigger_tag_added: {{"tag_name": "tag-name", "tag_operation": "added|removed|any"}}
- trigger_webhook: {{"webhook_path": "/path", "webhook_secret": "optional"}}
- trigger_schedule: {{"cron_expression": "0 9 * * 1", "timezone": "UTC"}}
- trigger_chat_message: {{"body_contains": "optional keyword filter"}}
- trigger_sms_received: {{"from_pattern": "optional", "body_contains": "optional"}}
- trigger_email_received: {{"from_pattern": "optional", "body_contains": "optional"}}
- trigger_page_visit: {{"page_id": "optional-page-id"}}

### Actions
{', '.join(actions)}

Action config fields by type (populate ALL relevant fields):
- action_send_email:
    email_to: "{{{{contact.email}}}}" (default, or specific address)
    email_subject: "Subject line" (REQUIRED - always provide a real subject)
    email_body: "Email body text with {{{{contact.first_name}}}} variables" (REQUIRED)
    email_from: null (optional, uses workspace default)

- action_send_sms:
    sms_to: "{{{{contact.phone}}}}" (default, or specific number)
    sms_message: "SMS text with {{{{contact.first_name}}}} variables" (REQUIRED - always provide real message content)

- action_ai_respond:
    ai_prompt: "Respond to the customer inquiry about..." (REQUIRED)
    ai_respond_via: "same_channel" | "sms" | "email"
    ai_max_tokens: 500 (integer)
    ai_system_prompt: "You are a helpful assistant for..." (optional)

- action_update_contact:
    add_tags: ["tag1", "tag2"] (list of tags to add)
    remove_tags: ["tag3"] (list of tags to remove)
    update_fields: {{"field_name": "value"}} (contact fields to update)

- action_wait:
    wait_duration: 300 (REQUIRED - integer seconds, e.g. 300=5min, 3600=1hr, 86400=1day)
    OR wait_until: "2024-01-01T09:00:00Z" (ISO datetime)

- action_webhook:
    webhook_url: "https://..." (REQUIRED)
    webhook_method: "POST" | "GET" | "PUT"
    webhook_headers: {{"Authorization": "Bearer ..."}}
    webhook_body: {{"key": "{{{{contact.email}}}}"}}

- action_create_task:
    task_title: "Follow up with {{{{contact.first_name}}}}" (REQUIRED)
    task_description: "Details..."
    task_assigned_to: "owner"
    task_due_in_hours: 24 (integer)

### Logic nodes
- logic_branch: {{"conditions": [{{"field": "contact.tags", "operator": "contains", "value": "vip", "output_handle": "yes"}}, {{"field": "contact.tags", "operator": "not_contains", "value": "vip", "output_handle": "no"}}], "default_output": "no"}}
- logic_filter: {{"filter_conditions": [{{"field": "contact.email", "operator": "exists"}}], "filter_operator": "and"}}
- logic_ab_split: {{"split_percentages": {{"a": 50, "b": 50}}}}

## Template variables
Use these in text fields: {{{{contact.email}}}}, {{{{contact.first_name}}}}, {{{{contact.last_name}}}}, {{{{contact.phone}}}}, {{{{contact.custom_fields.company}}}},
{{{{trigger_data.form_data.message}}}}, {{{{trigger_data.data.field_name}}}}, {{{{workspace.notification_email}}}}, {{{{owner.email}}}}

## Node structure
Each node must have: id, type, data (with label and config), position (x, y).
The "data" object MUST contain "label" (display name) and "config" (all config fields for that node type).

IMPORTANT: Always populate config fields with real, specific content matching the user's description.
- For emails: write actual subject lines and body text
- For SMS: write actual message content
- For waits: convert time descriptions to seconds (5 min = 300, 1 hour = 3600, 1 day = 86400)
- For tags: use descriptive tag names based on the workflow purpose

## Output format
Return JSON with:
- name: workflow name
- description: what it does
- nodes: array of node objects
- edges: array of {{id, source, target}} objects connecting nodes"""

    prompt = f"""Create a workflow for:

{description}

Return the workflow as a JSON object. Make sure every node's data.config has all required fields populated with real content."""

    return invoke_claude_json(prompt, system, workspace_id, site_id=site_id)


def generate_image_prompt(
    workspace_id: str,
    context: str,
    style: str = "professional",
    colors: dict | None = None,
    site_id: str | None = None,
) -> str:
    """Generate an image prompt based on business context.

    Args:
        workspace_id: The workspace ID for business context.
        context: What the image should represent.
        style: Visual style.
        colors: Optional color palette dict with primary, secondary, accent hex values.

    Returns:
        Detailed image generation prompt.
    """
    system = """You are an expert at writing prompts for AI image generation.
Create detailed, specific prompts that result in professional, brand-appropriate images.

Guidelines:
- Be specific about composition, lighting, colors
- Match the brand personality from the business context
- If brand colors are provided, incorporate them into the color palette and mood
- Avoid text in images (AI struggles with text)
- Focus on mood and emotion
- Include technical quality modifiers

Return ONLY the image prompt, nothing else."""

    color_info = ""
    if colors:
        parts = []
        if colors.get("primary"):
            parts.append(f"primary: {colors['primary']}")
        if colors.get("secondary"):
            parts.append(f"secondary: {colors['secondary']}")
        if colors.get("accent"):
            parts.append(f"accent: {colors['accent']}")
        if parts:
            color_info = f"\n\nBrand color palette: {', '.join(parts)}. Use these colors or complementary tones in the image."

    prompt = f"""Create an image generation prompt for:
{context}

Visual style: {style}{color_info}

The image should align with the brand and appeal to the target audience."""

    return invoke_claude(prompt, system, workspace_id, model=FAST_MODEL, max_tokens=500, site_id=site_id)


def generate_image(
    prompt: str,
    width: int = 1024,
    height: int = 1024,
    quality: str = "standard",
) -> bytes:
    """Generate an image using Amazon Titan Image Generator v2.

    Args:
        prompt: The image generation prompt.
        width: Image width (must be multiple of 64, 320-4096).
        height: Image height (must be multiple of 64, 320-4096).
        quality: Image quality ("standard" or "premium").

    Returns:
        Image bytes (PNG).

    Raises:
        NotImplementedError: If image generation is not available.
    """
    import base64

    # Amazon Titan Image Generator v2 request format
    # Titan has a 512 character limit for prompts
    truncated_prompt = prompt[:512] if len(prompt) > 512 else prompt

    request_body = {
        "taskType": "TEXT_IMAGE",
        "textToImageParams": {
            "text": truncated_prompt,
        },
        "imageGenerationConfig": {
            "numberOfImages": 1,
            "quality": quality,
            "cfgScale": 8.0,
            "height": height,
            "width": width,
        },
    }

    try:
        response = bedrock.invoke_model(
            modelId=IMAGE_MODEL,
            body=json.dumps(request_body),
            contentType="application/json",
            accept="application/json",
        )

        response_body = json.loads(response["body"].read())

        # Titan returns base64 encoded image in images array
        return base64.b64decode(response_body["images"][0])

    except bedrock.exceptions.AccessDeniedException:
        logger.warning("Image model not enabled - enable Titan Image Generator v2 in Bedrock Model Access")
        raise NotImplementedError(
            "Image generation not available. Enable 'Titan Image Generator G1 v2' in AWS Bedrock Model Access."
        )
    except Exception as e:
        error_msg = str(e)
        if "AccessDenied" in error_msg or "not authorized" in error_msg.lower():
            logger.warning("Image model access denied", error=error_msg)
            raise NotImplementedError(
                "Image generation not available. Enable 'Titan Image Generator G1 v2' in AWS Bedrock Model Access."
            )
        if "ValidationException" in error_msg and "content filters" in error_msg.lower():
            logger.warning("Image prompt blocked by content filter", prompt=truncated_prompt[:100])
            raise ValueError(
                "Image prompt was flagged by content filters. Try a different description."
            )
        logger.error("Image generation failed", error=error_msg)
        raise


def ask_onboarding_question(
    workspace_id: str,
    previous_answers: list[dict],
    site_id: str | None = None,
) -> dict:
    """Generate the next onboarding question based on previous answers.

    Uses AI to ask smart follow-up questions to build the business profile.

    Args:
        workspace_id: The workspace ID.
        previous_answers: List of {question, answer} dicts.

    Returns:
        Dict with question, field, input_type, and options.
    """
    # Build conversation history
    history = ""
    for qa in previous_answers:
        history += f"Q: {qa['question']}\nA: {qa['answer']}\n\n"

    system = """You are a friendly business consultant helping to understand a new client's business.
Based on the conversation so far, ask the most relevant next question to build their profile.

Focus on:
1. Understanding their unique value proposition
2. Identifying their ideal customer
3. Learning about their products/services
4. Understanding their brand personality

Return JSON with:
- question: the question to ask (conversational, friendly tone)
- field: which profile field this populates (business_name, description, target_audience, etc.)
- input_type: "text", "textarea", or "select"
- options: array of options if select type
- is_complete: true if we have enough information (after 5-7 good questions)"""

    prompt = f"""Conversation so far:
{history}

What's the most important question to ask next?
If we have enough information, set is_complete to true."""

    return invoke_claude_json(prompt, system, workspace_id, model=FAST_MODEL, site_id=site_id)


def analyze_content_for_profile(
    workspace_id: str,
    content: str,
) -> dict:
    """Analyze pasted content (resume, website, etc.) to extract profile info.

    Args:
        workspace_id: The workspace ID.
        content: The content to analyze.

    Returns:
        Extracted profile fields.
    """
    system = """You are an expert at analyzing business content and extracting key information.
Analyze the provided content and extract relevant business profile information.

Return JSON with these fields (only include what you can confidently extract):
- business_name: string (person or company name)
- tagline: string (short memorable phrase)
- description: string (2-3 sentence description)
- industry: string (one of: technology, consulting, healthcare, finance, education, real_estate, marketing, creative, professional_services, retail, hospitality, nonprofit, other)
- business_type: string (one of: saas, agency, freelancer, ecommerce_store, local_business, consultant, coach, creator, nonprofit, other)
- target_audience: string (describe the ideal customer/audience in one paragraph)
- unique_value_proposition: string (what makes them unique)
- key_benefits: array of strings
- achievements: array of strings (awards, metrics, notable accomplishments)
- products: array of objects with {name: string, description: string, price: string or null}
- keywords: array of strings

IMPORTANT: target_audience MUST be a single string, not an array. products MUST be an array of objects.
Only include fields where you have clear information. Don't guess."""

    prompt = f"""Analyze this content and extract business profile information:

{content}

Return the extracted information as JSON."""

    extracted = invoke_claude_json(prompt, system, workspace_id, model=FAST_MODEL)

    # Sanitize the extracted data to match expected types
    return _sanitize_extracted_profile(extracted)


def analyze_domain_content(
    workspace_id: str,
    domain: str,
    content: str,
) -> dict:
    """Analyze website content to extract brand and business information.

    Args:
        workspace_id: Workspace ID.
        domain: The domain being analyzed.
        content: Extracted text content from the website.

    Returns:
        Dict with extracted business profile fields.
    """
    system_prompt = """You are a brand analyst. Analyze the website content and extract structured business information.

Return a JSON object with these fields (leave null if not determinable):
{
  "business_name": "The company/business name",
  "industry": "Industry/sector",
  "description": "1-2 sentence business description",
  "tagline": "Main tagline or value proposition",
  "target_audience": "Who they serve",
  "tone": "Brand voice tone (e.g., professional, friendly, bold)",
  "key_features": ["Feature 1", "Feature 2", ...],
  "services": ["Service 1", "Service 2", ...],
  "unique_selling_points": ["USP 1", "USP 2", ...],
  "colors": {"primary": "#hex", "secondary": "#hex"} or null
}

Only include information clearly present in the content. Do not fabricate details."""

    user_prompt = f"Analyze this website content from {domain}:\n\n{content}"

    result = invoke_claude_json(
        prompt=user_prompt,
        system=system_prompt,
        model=FAST_MODEL,
    )
    return result


def generate_page_content_from_description(
    workspace_id: str,
    business_description: str,
    page_id: str | None = None,
    site_id: str | None = None,
) -> dict:
    """Generate rich page content from a business description.

    This is the core AI generation for the wizard. It extracts business info
    and generates all the marketing copy needed for a landing page.

    Args:
        workspace_id: The workspace ID for business context.
        business_description: Free-form description of the business.
        page_id: Optional page ID for page-specific profile.

    Returns:
        Dict with business_info and generated content.
    """
    system = """You are an expert marketing copywriter and business analyst.

IMPORTANT: If BUSINESS CONTEXT is provided above, use it as your PRIMARY source of information.
The business context contains verified details about the business - use these exact values for:
- Business name, tagline, description
- Industry and business type
- Target audience and customer pain points
- Value proposition and key benefits
- Products/services and pricing
- Achievements, testimonials, and social proof
- Brand voice and personality

The user's description below may provide ADDITIONAL context or focus for this specific page,
but the business context should inform all your copy. Match the brand voice exactly.

If no business context is provided, analyze the user's description to extract this information.

Return a JSON object with this exact structure:
{
  "business_info": {
    "business_name": "Name of the business or person",
    "business_type": "saas|agency|freelancer|ecommerce|consultant|coach|creator|other",
    "industry": "technology|consulting|healthcare|finance|education|real_estate|marketing|creative|professional_services|retail|hospitality|other",
    "products": ["Product or service 1", "Product or service 2"],
    "audience": "Description of target audience",
    "tone": "professional|friendly|bold|playful|authoritative|casual|inspirational"
  },
  "content": {
    "headlines": [
      "Punchy headline option 1 (3-6 words)",
      "Punchy headline option 2 (3-6 words)",
      "Punchy headline option 3 (3-6 words)"
    ],
    "tagline": "Memorable tagline (5-10 words)",
    "value_props": [
      "Key benefit 1 - what they get",
      "Key benefit 2 - what they get",
      "Key benefit 3 - what they get"
    ],
    "features": [
      {"title": "Feature 1", "description": "What this does and why it matters", "icon": "🚀"},
      {"title": "Feature 2", "description": "What this does and why it matters", "icon": "⚡"},
      {"title": "Feature 3", "description": "What this does and why it matters", "icon": "✨"}
    ],
    "testimonial_concepts": [
      "What a happy customer might say about benefit 1",
      "What a happy customer might say about benefit 2"
    ],
    "faq": [
      {"q": "Common question 1?", "a": "Helpful answer that addresses concerns"},
      {"q": "Common question 2?", "a": "Helpful answer that addresses concerns"},
      {"q": "Common question 3?", "a": "Helpful answer that addresses concerns"}
    ],
    "cta_text": "Primary call-to-action (2-3 words)",
    "hero_subheadline": "Compelling subheadline for hero (15-25 words)",
    "social_proof": "A credibility statement (e.g., 'Trusted by 1000+ businesses')"
  },
  "suggested_colors": {
    "primary": "#hex color that fits the brand",
    "secondary": "#complementary hex color",
    "accent": "#accent hex color"
  }
}

Guidelines:
- Headlines must be SHORT and PUNCHY. No filler words. Use power words.
- Features focus on BENEFITS, not just features
- FAQ should address real customer concerns and objections
- Tone should match the business type
- Use appropriate emojis for icons: 🚀 ⚡ ✨ 💎 🎯 📈 💡 🔒 ⭐ 🛠️ 💰 🔥 ✅ 🏆 💪 🎨 📱 🌟 ❤️

COLOR GUIDELINES - Choose colors that match the industry and brand personality:
- Technology/SaaS: Blues (#3B82F6), purples (#8B5CF6), teals (#14B8A6)
- Healthcare/Wellness: Greens (#10B981), calming blues (#0EA5E9), soft teals
- Finance: Navy blues (#1E3A8A), golds (#F59E0B), deep greens (#047857)
- Creative/Design: Pinks (#EC4899), purples (#A855F7), vibrant colors
- Food/Restaurant: Warm oranges (#F97316), reds (#EF4444), warm yellows (#EAB308)
- Real Estate: Earth tones (#78716C), forest greens (#166534), warm browns
- Education: Friendly blues (#3B82F6), oranges (#F97316), greens
- Professional Services: Navy (#1E40AF), charcoal (#374151), sophisticated tones
- Retail/Ecommerce: Bold reds (#DC2626), energetic oranges, bright colors
- Fitness: Energetic oranges (#EA580C), bold reds (#DC2626), electric blues

DO NOT default to indigo/purple (#6366f1) - choose colors specific to this business!

Return ONLY valid JSON, no markdown."""

    prompt = f"""Additional context or focus for this page:

{business_description}

Using the BUSINESS CONTEXT above (if provided) combined with this description,
generate compelling marketing copy that will convert visitors into leads.
Prioritize information from the business context - it contains verified details."""

    try:
        result = invoke_claude_json(prompt, system, workspace_id, page_id, model=FAST_MODEL, site_id=site_id)

        # Validate and ensure required structure
        if "business_info" not in result:
            result["business_info"] = {}
        if "content" not in result:
            result["content"] = {}
        if "suggested_colors" not in result:
            result["suggested_colors"] = {
                "primary": "#6366f1",
                "secondary": "#818cf8",
                "accent": "#c7d2fe"
            }

        return result

    except Exception as e:
        logger.error("Failed to generate page content", error=str(e))
        raise


def refine_page_content(
    workspace_id: str,
    current_content: dict,
    feedback: str,
    section: str | None = None,
    page_id: str | None = None,
    site_id: str | None = None,
) -> dict:
    """Refine generated page content based on user feedback.

    Args:
        workspace_id: The workspace ID for business context.
        current_content: The current generated content.
        feedback: User's feedback or refinement request.
        section: Optional section to refine (headlines, features, faq, etc.)
        page_id: Optional page ID for page-specific profile.

    Returns:
        Updated content dict with refinements applied.
    """
    section_note = f"\nFocus on refining the '{section}' section." if section else ""

    system = f"""You are an expert marketing copywriter.
You're refining landing page content based on user feedback.
{section_note}

IMPORTANT: If BUSINESS CONTEXT is provided above, ensure all refinements stay consistent with:
- The brand voice and personality
- The target audience
- The unique value proposition
- Any specific products, achievements, or testimonials mentioned

Return the COMPLETE updated content structure in the same JSON format.
Apply the user's feedback while maintaining consistency with the business context.

Return ONLY valid JSON, no markdown."""

    prompt = f"""Current content:
{json.dumps(current_content, indent=2)}

User feedback: {feedback}

Generate the updated content with the feedback applied."""

    try:
        return invoke_claude_json(prompt, system, workspace_id, page_id, model=FAST_MODEL, site_id=site_id)
    except Exception as e:
        logger.error("Failed to refine page content", error=str(e))
        raise


def _sanitize_extracted_profile(data: dict) -> dict:
    """Sanitize extracted profile data to match expected model types.

    Args:
        data: Raw extracted data from AI.

    Returns:
        Sanitized data matching model types.
    """
    sanitized = {}

    # String fields
    string_fields = [
        "business_name", "tagline", "description", "industry", "business_type",
        "target_audience", "unique_value_proposition", "brand_voice", "brand_personality",
        "pricing_model", "founder_story", "contact_email", "phone", "address", "website",
    ]
    for field in string_fields:
        if field in data:
            value = data[field]
            if isinstance(value, list):
                # Convert list to comma-separated string
                sanitized[field] = ", ".join(str(v) for v in value)
            elif isinstance(value, str):
                sanitized[field] = value
            else:
                sanitized[field] = str(value)

    # Array of strings fields
    array_fields = [
        "key_benefits", "achievements", "notable_clients", "brand_values",
        "customer_pain_points", "differentiators", "keywords",
    ]
    for field in array_fields:
        if field in data:
            value = data[field]
            if isinstance(value, list):
                sanitized[field] = [str(v) for v in value]
            elif isinstance(value, str):
                # Split comma-separated string into list
                sanitized[field] = [s.strip() for s in value.split(",") if s.strip()]
            else:
                sanitized[field] = [str(value)]

    # Products - must be list of dicts with name, description, price
    if "products" in data:
        products = data["products"]
        sanitized_products = []
        if isinstance(products, list):
            for p in products:
                if isinstance(p, dict):
                    sanitized_products.append({
                        "name": str(p.get("name", "")),
                        "description": str(p.get("description", "")),
                        "price": str(p.get("price", "")) if p.get("price") else None,
                        "features": p.get("features", []) if isinstance(p.get("features"), list) else [],
                        "target_audience": str(p.get("target_audience", "")) if p.get("target_audience") else None,
                    })
        elif isinstance(products, dict):
            # Single product as dict - wrap in list
            sanitized_products.append({
                "name": str(products.get("name", "")),
                "description": str(products.get("description", "")),
                "price": str(products.get("price", "")) if products.get("price") else None,
                "features": products.get("features", []) if isinstance(products.get("features"), list) else [],
                "target_audience": str(products.get("target_audience", "")) if products.get("target_audience") else None,
            })
        if sanitized_products:
            sanitized["products"] = sanitized_products

    return sanitized
