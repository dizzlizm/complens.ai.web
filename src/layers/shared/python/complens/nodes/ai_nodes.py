"""AI node implementations.

AI nodes use Bedrock (Claude) for intelligent decision making,
content generation, analysis, and conversational AI.
"""

import json
from typing import Any

import boto3
import structlog

from complens.nodes.base import BaseNode, NodeContext, NodeResult

logger = structlog.get_logger()


class AIDecisionNode(BaseNode):
    """AI makes a decision between multiple options."""

    node_type = "ai_decision"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Have AI decide which path to take.

        Args:
            context: Execution context.

        Returns:
            NodeResult with the chosen decision.
        """
        options = self._get_config_value("decision_options", [])
        decision_prompt = self._get_config_value("decision_prompt", "")
        model = self._get_config_value("model", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
        max_tokens = self._get_config_value("max_tokens", 500)

        if not options:
            return NodeResult.failed(error="No decision options configured")

        # Build the prompt
        prompt = context.render_template(decision_prompt) if decision_prompt else ""

        # Add context about the contact
        contact_info = f"""
Contact Information:
- Name: {context.contact.full_name}
- Email: {context.contact.email or 'N/A'}
- Phone: {context.contact.phone or 'N/A'}
- Tags: {', '.join(context.contact.tags) if context.contact.tags else 'None'}
"""

        # Format options
        options_text = "\n".join(
            f"- {opt['label']}: {opt.get('description', 'No description')}"
            for opt in options
        )

        full_prompt = f"""You are a decision-making AI for a marketing automation system.

{contact_info}

Context from workflow variables:
{json.dumps(context.variables, indent=2)}

Decision prompt:
{prompt}

Available options:
{options_text}

Based on the information provided, choose the most appropriate option.
Respond with ONLY the option label, nothing else."""

        self.logger.info(
            "AI making decision",
            options_count=len(options),
            prompt_length=len(full_prompt),
        )

        try:
            decision = await self._invoke_bedrock(model, full_prompt, max_tokens)
            decision = decision.strip()

            # Find matching option
            for opt in options:
                if opt["label"].lower() == decision.lower():
                    self.logger.info("AI decision made", choice=opt["label"])
                    return NodeResult.completed(
                        output={"decision": opt["label"], "reasoning": decision},
                        next_node_id=opt.get("output_handle", opt["label"]),
                        variables={"ai_decision": opt["label"]},
                    )

            # No exact match - use first option as fallback
            self.logger.warning(
                "AI decision did not match any option, using first",
                ai_response=decision,
            )
            fallback = options[0]
            return NodeResult.completed(
                output={"decision": fallback["label"], "ai_response": decision},
                next_node_id=fallback.get("output_handle", fallback["label"]),
                variables={"ai_decision": fallback["label"]},
            )

        except Exception as e:
            return NodeResult.failed(
                error=f"AI decision failed: {str(e)}",
                error_details={"exception": type(e).__name__},
            )

    async def _invoke_bedrock(self, model: str, prompt: str, max_tokens: int) -> str:
        """Invoke Bedrock model.

        Args:
            model: Model ID.
            prompt: Prompt text.
            max_tokens: Maximum tokens.

        Returns:
            Model response text.
        """
        bedrock = boto3.client("bedrock-runtime")

        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }

        response = bedrock.invoke_model(
            modelId=model,
            body=json.dumps(body),
            contentType="application/json",
        )

        response_body = json.loads(response["body"].read())
        return response_body["content"][0]["text"]


class AIGenerateNode(BaseNode):
    """AI generates content (text, email, message, etc.)."""

    node_type = "ai_generate"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Generate content using AI.

        Args:
            context: Execution context.

        Returns:
            NodeResult with generated content.
        """
        generate_prompt = self._get_config_value("generate_prompt", "")
        output_variable = self._get_config_value("generate_output_variable", "ai_output")
        generate_format = self._get_config_value("generate_format", "text")
        model = self._get_config_value("model", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
        max_tokens = self._get_config_value("max_tokens", 500)
        temperature = self._get_config_value("temperature", 0.7)
        system_prompt = self._get_config_value("system_prompt", "")

        prompt = context.render_template(generate_prompt)

        if not prompt:
            return NodeResult.failed(error="Generation prompt is required")

        # Add contact context
        full_prompt = f"""Contact Information:
- Name: {context.contact.full_name}
- Email: {context.contact.email or 'N/A'}
- Tags: {', '.join(context.contact.tags) if context.contact.tags else 'None'}

Variables:
{json.dumps(context.variables, indent=2)}

Task:
{prompt}"""

        if generate_format == "json":
            full_prompt += "\n\nRespond with valid JSON only."

        self.logger.info(
            "AI generating content",
            format=generate_format,
            prompt_length=len(full_prompt),
        )

        try:
            generated = await self._invoke_bedrock(
                model, full_prompt, max_tokens, system_prompt, temperature
            )

            # Parse JSON if requested
            if generate_format == "json":
                try:
                    generated = json.loads(generated)
                except json.JSONDecodeError:
                    self.logger.warning("AI output was not valid JSON")

            return NodeResult.completed(
                output={"generated_content": generated, "format": generate_format},
                variables={output_variable: generated},
            )

        except Exception as e:
            return NodeResult.failed(
                error=f"AI generation failed: {str(e)}",
                error_details={"exception": type(e).__name__},
            )

    async def _invoke_bedrock(
        self,
        model: str,
        prompt: str,
        max_tokens: int,
        system_prompt: str = "",
        temperature: float = 0.7,
    ) -> str:
        """Invoke Bedrock model."""
        bedrock = boto3.client("bedrock-runtime")

        body: dict[str, Any] = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }

        if system_prompt:
            body["system"] = system_prompt

        response = bedrock.invoke_model(
            modelId=model,
            body=json.dumps(body),
            contentType="application/json",
        )

        response_body = json.loads(response["body"].read())
        return response_body["content"][0]["text"]


class AIAnalyzeNode(BaseNode):
    """AI analyzes content (sentiment, intent, summary)."""

    node_type = "ai_analyze"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Analyze content using AI.

        Args:
            context: Execution context.

        Returns:
            NodeResult with analysis.
        """
        analyze_type = self._get_config_value("analyze_type", "sentiment")
        analyze_prompt = self._get_config_value("analyze_prompt", "")
        output_variable = self._get_config_value("analyze_output_variable", "analysis")
        model = self._get_config_value("model", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
        max_tokens = self._get_config_value("max_tokens", 500)

        # Get content to analyze from variables or trigger data
        content = context.variables.get("message_content") or context.trigger_data.get("body", "")

        if not content:
            return NodeResult.failed(error="No content to analyze")

        # Build analysis prompt based on type
        if analyze_type == "sentiment":
            prompt = f"""Analyze the sentiment of the following message:

"{content}"

Respond with a JSON object containing:
- sentiment: "positive", "negative", or "neutral"
- confidence: a number from 0 to 1
- keywords: list of key emotional words"""

        elif analyze_type == "intent":
            prompt = f"""Determine the intent of the following message:

"{content}"

Respond with a JSON object containing:
- intent: the primary intent (e.g., "purchase_inquiry", "support_request", "complaint", "feedback", "question")
- confidence: a number from 0 to 1
- entities: list of key entities mentioned"""

        elif analyze_type == "summary":
            prompt = f"""Summarize the following content in 2-3 sentences:

"{content}"

Respond with just the summary."""

        else:  # custom
            prompt = context.render_template(analyze_prompt)
            prompt = f"{prompt}\n\nContent to analyze:\n{content}"

        self.logger.info(
            "AI analyzing content",
            analyze_type=analyze_type,
            content_length=len(content),
        )

        try:
            result = await self._invoke_bedrock(model, prompt, max_tokens)

            # Try to parse as JSON for structured responses
            try:
                result = json.loads(result)
            except json.JSONDecodeError:
                pass  # Keep as string

            return NodeResult.completed(
                output={"analysis_type": analyze_type, "result": result},
                variables={output_variable: result},
            )

        except Exception as e:
            return NodeResult.failed(
                error=f"AI analysis failed: {str(e)}",
                error_details={"exception": type(e).__name__},
            )

    async def _invoke_bedrock(self, model: str, prompt: str, max_tokens: int) -> str:
        """Invoke Bedrock model."""
        bedrock = boto3.client("bedrock-runtime")

        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }

        response = bedrock.invoke_model(
            modelId=model,
            body=json.dumps(body),
            contentType="application/json",
        )

        response_body = json.loads(response["body"].read())
        return response_body["content"][0]["text"]


class AIConversationNode(BaseNode):
    """Multi-turn AI conversation handler."""

    node_type = "ai_conversation"

    async def execute(self, context: NodeContext) -> NodeResult:
        """Handle AI conversation with tool use.

        Args:
            context: Execution context.

        Returns:
            NodeResult with AI response.
        """
        system_prompt = self._get_config_value(
            "system_prompt",
            "You are a helpful marketing assistant.",
        )
        model = self._get_config_value("model", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
        max_tokens = self._get_config_value("max_tokens", 500)
        context_messages = self._get_config_value("conversation_context_messages", 10)
        tools = self._get_config_value("conversation_tools", [])

        # Get the latest message
        latest_message = (
            context.variables.get("message_content") or context.trigger_data.get("body", "")
        )

        if not latest_message:
            return NodeResult.failed(error="No message to respond to")

        # Build conversation history
        history = context.variables.get("conversation_history", [])
        history = history[-context_messages:] if len(history) > context_messages else history

        # Add latest message
        history.append({"role": "user", "content": latest_message})

        self.logger.info(
            "AI conversation",
            history_length=len(history),
            tools_count=len(tools),
        )

        try:
            response, tool_calls = await self._invoke_bedrock_with_tools(
                model, system_prompt, history, max_tokens, tools
            )

            # Update history
            history.append({"role": "assistant", "content": response})

            return NodeResult.completed(
                output={
                    "response": response,
                    "tool_calls": tool_calls,
                },
                variables={
                    "ai_response": response,
                    "conversation_history": history,
                    "tool_calls": tool_calls,
                },
            )

        except Exception as e:
            return NodeResult.failed(
                error=f"AI conversation failed: {str(e)}",
                error_details={"exception": type(e).__name__},
            )

    async def _invoke_bedrock_with_tools(
        self,
        model: str,
        system_prompt: str,
        messages: list[dict],
        max_tokens: int,
        tools: list[dict],
    ) -> tuple[str, list[dict]]:
        """Invoke Bedrock with tool use.

        Args:
            model: Model ID.
            system_prompt: System prompt.
            messages: Conversation messages.
            max_tokens: Maximum tokens.
            tools: Available tools.

        Returns:
            Tuple of (response text, tool calls).
        """
        bedrock = boto3.client("bedrock-runtime")

        body: dict[str, Any] = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": messages,
        }

        # Add tools if configured
        if tools:
            body["tools"] = tools

        response = bedrock.invoke_model(
            modelId=model,
            body=json.dumps(body),
            contentType="application/json",
        )

        response_body = json.loads(response["body"].read())

        # Extract response and tool calls
        text_response = ""
        tool_calls = []

        for content in response_body.get("content", []):
            if content["type"] == "text":
                text_response = content["text"]
            elif content["type"] == "tool_use":
                tool_calls.append(
                    {
                        "tool_name": content["name"],
                        "tool_input": content["input"],
                        "tool_use_id": content["id"],
                    }
                )

        return text_response, tool_calls


# Registry of AI node classes
AI_NODES = {
    "ai_decision": AIDecisionNode,
    "ai_generate": AIGenerateNode,
    "ai_analyze": AIAnalyzeNode,
    "ai_conversation": AIConversationNode,
}
