"""AI Agent service for intelligent responses.

Handles AI-powered conversations using Amazon Bedrock with tool use.
"""

import json
from typing import Any

import boto3
import structlog

from complens.models.contact import Contact
from complens.models.conversation import Conversation

logger = structlog.get_logger()


# Tool definitions for the AI agent
AGENT_TOOLS = [
    {
        "name": "book_appointment",
        "description": "Book an appointment for the contact. Use this when the contact wants to schedule a meeting or call.",
        "input_schema": {
            "type": "object",
            "properties": {
                "date": {
                    "type": "string",
                    "description": "The preferred date (YYYY-MM-DD format)",
                },
                "time": {
                    "type": "string",
                    "description": "The preferred time (HH:MM format, 24-hour)",
                },
                "duration_minutes": {
                    "type": "integer",
                    "description": "Duration in minutes",
                    "default": 30,
                },
                "notes": {
                    "type": "string",
                    "description": "Additional notes for the appointment",
                },
            },
            "required": ["date", "time"],
        },
    },
    {
        "name": "update_contact",
        "description": "Update contact information or add tags. Use this when you learn new information about the contact.",
        "input_schema": {
            "type": "object",
            "properties": {
                "first_name": {"type": "string"},
                "last_name": {"type": "string"},
                "email": {"type": "string"},
                "phone": {"type": "string"},
                "add_tags": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Tags to add to the contact",
                },
                "custom_fields": {
                    "type": "object",
                    "description": "Custom field values to update",
                },
            },
        },
    },
    {
        "name": "search_knowledge_base",
        "description": "Search the knowledge base for relevant information to answer the contact's question.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The search query",
                },
                "category": {
                    "type": "string",
                    "description": "Optional category to filter results",
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "escalate_to_human",
        "description": "Escalate the conversation to a human agent. Use this when the contact explicitly requests to speak with a human, or when you cannot adequately help them.",
        "input_schema": {
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "description": "Reason for escalation",
                },
                "priority": {
                    "type": "string",
                    "enum": ["low", "medium", "high"],
                    "description": "Priority level",
                    "default": "medium",
                },
                "summary": {
                    "type": "string",
                    "description": "Summary of the conversation for the human agent",
                },
            },
            "required": ["reason"],
        },
    },
]


class AIAgentService:
    """Service for AI-powered agent conversations.

    Uses Amazon Bedrock (Claude) with tool use for intelligent responses.
    """

    def __init__(
        self,
        model_id: str = "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
        max_tokens: int = 1000,
    ):
        """Initialize AI Agent service.

        Args:
            model_id: Bedrock model ID.
            max_tokens: Maximum tokens for response.
        """
        self.model_id = model_id
        self.max_tokens = max_tokens
        self._bedrock = None
        self.logger = logger.bind(service="ai_agent")

    @property
    def bedrock(self):
        """Get Bedrock runtime client (lazy initialization)."""
        if self._bedrock is None:
            self._bedrock = boto3.client("bedrock-runtime")
        return self._bedrock

    def get_system_prompt(
        self,
        contact: Contact,
        workspace_context: dict | None = None,
    ) -> str:
        """Generate system prompt with business context.

        Args:
            contact: The contact being served.
            workspace_context: Additional workspace-specific context.

        Returns:
            System prompt string.
        """
        context = workspace_context or {}

        business_name = context.get("business_name", "our company")
        business_description = context.get("business_description", "")
        tone = context.get("tone", "friendly and professional")

        return f"""You are an AI assistant for {business_name}. {business_description}

Your communication style should be {tone}.

You are currently helping a contact with the following information:
- Name: {contact.full_name}
- Email: {contact.email or 'Not provided'}
- Phone: {contact.phone or 'Not provided'}
- Tags: {', '.join(contact.tags) if contact.tags else 'None'}

Guidelines:
1. Be helpful, concise, and accurate
2. If you don't know something, say so honestly
3. Use the available tools when appropriate
4. If the contact seems frustrated or explicitly asks for a human, use the escalate_to_human tool
5. Keep responses conversational and not too long
6. Remember previous context in the conversation

Available tools:
- book_appointment: Schedule meetings or calls
- update_contact: Save new information about the contact
- search_knowledge_base: Find answers to questions
- escalate_to_human: Transfer to human agent when needed"""

    async def generate_response(
        self,
        contact: Contact,
        conversation: Conversation,
        message_history: list[dict],
        latest_message: str,
        workspace_context: dict | None = None,
    ) -> dict[str, Any]:
        """Generate an AI response with potential tool use.

        Args:
            contact: The contact.
            conversation: The conversation.
            message_history: Previous messages in the conversation.
            latest_message: The latest message from the contact.
            workspace_context: Workspace-specific context.

        Returns:
            Dict with 'response', 'tool_calls', and 'actions_taken'.
        """
        self.logger.info(
            "Generating AI response",
            contact_id=contact.id,
            conversation_id=conversation.id,
            history_length=len(message_history),
        )

        # Build messages for the API
        messages = self._build_messages(message_history, latest_message)

        # Get system prompt
        system_prompt = self.get_system_prompt(contact, workspace_context)

        # Call Bedrock
        try:
            response = await self._invoke_model(system_prompt, messages)

            # Process response
            text_response = ""
            tool_calls = []
            actions_taken = []

            for content in response.get("content", []):
                if content["type"] == "text":
                    text_response = content["text"]
                elif content["type"] == "tool_use":
                    tool_call = {
                        "tool_name": content["name"],
                        "tool_input": content["input"],
                        "tool_use_id": content["id"],
                    }
                    tool_calls.append(tool_call)

                    # Execute the tool
                    action_result = await self._execute_tool(
                        tool_name=content["name"],
                        tool_input=content["input"],
                        contact=contact,
                        conversation=conversation,
                    )
                    actions_taken.append(action_result)

            # If tools were used, get a follow-up response
            if tool_calls:
                follow_up = await self._get_follow_up_response(
                    system_prompt, messages, response, actions_taken
                )
                if follow_up:
                    text_response = follow_up

            return {
                "response": text_response,
                "tool_calls": tool_calls,
                "actions_taken": actions_taken,
                "model": self.model_id,
                "stop_reason": response.get("stop_reason"),
            }

        except Exception as e:
            self.logger.exception("AI response generation failed", error=str(e))
            raise

    def _build_messages(
        self,
        history: list[dict],
        latest_message: str,
    ) -> list[dict]:
        """Build messages array for the API.

        Args:
            history: Previous messages.
            latest_message: Latest user message.

        Returns:
            Messages array.
        """
        messages = []

        # Add history
        for msg in history:
            role = "user" if msg.get("direction") == "inbound" else "assistant"
            messages.append({"role": role, "content": msg.get("content", "")})

        # Add latest message
        messages.append({"role": "user", "content": latest_message})

        return messages

    async def _invoke_model(
        self,
        system_prompt: str,
        messages: list[dict],
    ) -> dict:
        """Invoke the Bedrock model.

        Args:
            system_prompt: System prompt.
            messages: Conversation messages.

        Returns:
            Model response.
        """
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": self.max_tokens,
            "system": system_prompt,
            "messages": messages,
            "tools": AGENT_TOOLS,
        }

        response = self.bedrock.invoke_model(
            modelId=self.model_id,
            body=json.dumps(body),
            contentType="application/json",
        )

        return json.loads(response["body"].read())

    async def _execute_tool(
        self,
        tool_name: str,
        tool_input: dict,
        contact: Contact,
        conversation: Conversation,
    ) -> dict:
        """Execute a tool call.

        Args:
            tool_name: Name of the tool.
            tool_input: Tool input parameters.
            contact: The contact.
            conversation: The conversation.

        Returns:
            Tool execution result.
        """
        self.logger.info("Executing tool", tool_name=tool_name, input=tool_input)

        result = {"tool_name": tool_name, "success": True, "result": {}}

        try:
            if tool_name == "book_appointment":
                result["result"] = await self._tool_book_appointment(
                    contact, tool_input
                )
            elif tool_name == "update_contact":
                result["result"] = await self._tool_update_contact(
                    contact, tool_input
                )
            elif tool_name == "search_knowledge_base":
                result["result"] = await self._tool_search_knowledge(
                    tool_input.get("query", ""),
                    tool_input.get("category"),
                )
            elif tool_name == "escalate_to_human":
                result["result"] = await self._tool_escalate(
                    contact, conversation, tool_input
                )
            else:
                result["success"] = False
                result["error"] = f"Unknown tool: {tool_name}"

        except Exception as e:
            result["success"] = False
            result["error"] = str(e)

        return result

    async def _tool_book_appointment(
        self,
        contact: Contact,
        input_data: dict,
    ) -> dict:
        """Book an appointment.

        Args:
            contact: The contact.
            input_data: Appointment details.

        Returns:
            Booking result.
        """
        # TODO: Integrate with calendar system
        return {
            "status": "scheduled",
            "date": input_data.get("date"),
            "time": input_data.get("time"),
            "duration_minutes": input_data.get("duration_minutes", 30),
            "confirmation_message": f"Appointment scheduled for {input_data.get('date')} at {input_data.get('time')}",
        }

    async def _tool_update_contact(
        self,
        contact: Contact,
        input_data: dict,
    ) -> dict:
        """Update contact information.

        Args:
            contact: The contact to update.
            input_data: Fields to update.

        Returns:
            Update result.
        """
        updates = []

        # Update standard fields
        for field in ["first_name", "last_name", "email", "phone"]:
            if field in input_data:
                setattr(contact, field, input_data[field])
                updates.append(field)

        # Add tags
        if "add_tags" in input_data:
            for tag in input_data["add_tags"]:
                contact.add_tag(tag)
                updates.append(f"+tag:{tag}")

        # Update custom fields
        if "custom_fields" in input_data:
            for key, value in input_data["custom_fields"].items():
                contact.custom_fields[key] = value
                updates.append(f"custom.{key}")

        # TODO: Save contact to database

        return {
            "status": "updated",
            "fields_updated": updates,
        }

    async def _tool_search_knowledge(
        self,
        query: str,
        category: str | None = None,
    ) -> dict:
        """Search knowledge base using Bedrock Knowledge Base.

        Args:
            query: Search query.
            category: Optional category filter.

        Returns:
            Search results.
        """
        from complens.services.knowledge_base_service import get_knowledge_base_service

        kb_service = get_knowledge_base_service()
        results = kb_service.retrieve(
            workspace_id=self.workspace_id,
            query=query,
            max_results=5,
        )

        if not results:
            return {
                "status": "no_results",
                "query": query,
                "message": "No relevant documents found in the knowledge base.",
            }

        return {
            "status": "found",
            "query": query,
            "results": results,
            "count": len(results),
        }

    async def _tool_escalate(
        self,
        contact: Contact,
        conversation: Conversation,
        input_data: dict,
    ) -> dict:
        """Escalate to human agent.

        Args:
            contact: The contact.
            conversation: The conversation.
            input_data: Escalation details.

        Returns:
            Escalation result.
        """
        # Mark conversation for human handoff
        conversation.ai_handoff_requested = True

        # TODO: Create escalation task/notification

        return {
            "status": "escalated",
            "reason": input_data.get("reason"),
            "priority": input_data.get("priority", "medium"),
            "message": "A human agent will be with you shortly.",
        }

    async def _get_follow_up_response(
        self,
        system_prompt: str,
        original_messages: list[dict],
        model_response: dict,
        tool_results: list[dict],
    ) -> str | None:
        """Get follow-up response after tool use.

        Args:
            system_prompt: System prompt.
            original_messages: Original messages.
            model_response: Model's response with tool use.
            tool_results: Results from tool execution.

        Returns:
            Follow-up text response or None.
        """
        # Build tool result messages
        messages = original_messages.copy()

        # Add assistant's tool use response
        messages.append({"role": "assistant", "content": model_response["content"]})

        # Add tool results
        tool_result_content = []
        for i, result in enumerate(tool_results):
            tool_result_content.append({
                "type": "tool_result",
                "tool_use_id": model_response["content"][i + (1 if model_response["content"][0]["type"] == "text" else 0)]["id"],
                "content": json.dumps(result["result"]),
            })

        messages.append({"role": "user", "content": tool_result_content})

        # Get follow-up response
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": self.max_tokens,
            "system": system_prompt,
            "messages": messages,
        }

        response = self.bedrock.invoke_model(
            modelId=self.model_id,
            body=json.dumps(body),
            contentType="application/json",
        )

        response_body = json.loads(response["body"].read())

        for content in response_body.get("content", []):
            if content["type"] == "text":
                return content["text"]

        return None
