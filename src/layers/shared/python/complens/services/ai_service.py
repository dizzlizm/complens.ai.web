"""AI Service for contextual content generation.

This service provides AI capabilities that use the business profile
for context-aware generation of pages, blocks, workflows, and more.
"""

import json
import os
from typing import Any

import boto3
import structlog

from complens.models.business_profile import BusinessProfile
from complens.repositories.business_profile import BusinessProfileRepository

logger = structlog.get_logger()

# Bedrock model configuration
# Using models available in your Bedrock account
# Haiku 4.5 requires inference profile (us. prefix), Sonnet 3.0 works with direct model ID
DEFAULT_MODEL = "anthropic.claude-3-sonnet-20240229-v1:0"  # Claude 3 Sonnet
FAST_MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0"  # Claude Haiku 4.5 (inference profile)
IMAGE_MODEL = "amazon.titan-image-generator-v2:0"  # Amazon Titan Image Generator v2

# Initialize clients
bedrock = boto3.client("bedrock-runtime")


def get_business_context(workspace_id: str, page_id: str | None = None) -> str:
    """Get the business profile context for a workspace or page.

    Args:
        workspace_id: The workspace ID.
        page_id: Optional page ID for page-specific profile.

    Returns:
        Formatted context string for AI prompts.
    """
    repo = BusinessProfileRepository()
    profile = repo.get_or_create(workspace_id, page_id)
    return profile.get_ai_context()


def invoke_claude(
    prompt: str,
    system: str | None = None,
    workspace_id: str | None = None,
    page_id: str | None = None,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 4096,
    temperature: float = 0.7,
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

    Returns:
        The generated text response.
    """
    # Build system prompt with business context
    system_parts = []

    if workspace_id:
        context = get_business_context(workspace_id, page_id)
        if context:
            system_parts.append(context)
            system_parts.append("")  # Add blank line

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
) -> dict:
    """Invoke Claude and parse JSON response.

    Args:
        prompt: The user prompt (should request JSON output).
        system: Optional system prompt.
        workspace_id: Optional workspace ID for business context.
        page_id: Optional page ID for page-specific profile.
        model: The model to use.

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

    return invoke_claude_json(prompt, system, workspace_id, page_id)


def generate_page_blocks(
    workspace_id: str,
    description: str,
    style: str = "professional",
    include_form: bool = True,
    include_chat: bool = False,
    page_id: str | None = None,
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

    blocks = invoke_claude_json(prompt, system, workspace_id, page_id)

    # Ensure it's a list
    if isinstance(blocks, dict) and "blocks" in blocks:
        blocks = blocks["blocks"]

    return blocks if isinstance(blocks, list) else []


def generate_workflow_from_description(
    workspace_id: str,
    description: str,
    available_triggers: list[str] | None = None,
    available_actions: list[str] | None = None,
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

Available trigger types: {', '.join(triggers)}
Available action types: {', '.join(actions)}
Logic nodes: logic_branch (if/else), logic_filter, logic_ab_split

Create a workflow that:
1. Starts with an appropriate trigger
2. Uses actions that make sense for the business
3. Includes smart logic for personalization
4. Considers the target audience from the business context

Return JSON with:
- name: workflow name
- description: what it does
- nodes: array of node objects with id, type, label, position (x, y), config
- edges: array of edge objects with id, source, target"""

    prompt = f"""Create a workflow for:

{description}

Return the workflow as a JSON object."""

    return invoke_claude_json(prompt, system, workspace_id)


def generate_image_prompt(
    workspace_id: str,
    context: str,
    style: str = "professional",
) -> str:
    """Generate an image prompt based on business context.

    Args:
        workspace_id: The workspace ID for business context.
        context: What the image should represent.
        style: Visual style.

    Returns:
        Detailed image generation prompt.
    """
    system = """You are an expert at writing prompts for AI image generation.
Create detailed, specific prompts that result in professional, brand-appropriate images.

Guidelines:
- Be specific about composition, lighting, colors
- Match the brand personality from the business context
- Avoid text in images (AI struggles with text)
- Focus on mood and emotion
- Include technical quality modifiers

Return ONLY the image prompt, nothing else."""

    prompt = f"""Create an image generation prompt for:
{context}

Visual style: {style}

The image should align with the brand and appeal to the target audience."""

    return invoke_claude(prompt, system, workspace_id, model=FAST_MODEL, max_tokens=500)


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
        logger.error("Image generation failed", error=error_msg)
        raise


def ask_onboarding_question(
    workspace_id: str,
    previous_answers: list[dict],
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

    return invoke_claude_json(prompt, system, workspace_id, model=FAST_MODEL)


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
