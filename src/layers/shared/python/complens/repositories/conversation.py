"""Conversation repository for DynamoDB operations."""

from complens.models.conversation import Conversation, ConversationStatus
from complens.repositories.base import BaseRepository


class ConversationRepository(BaseRepository[Conversation]):
    """Repository for Conversation entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize conversation repository."""
        super().__init__(Conversation, table_name)

    def get_by_id(self, workspace_id: str, conversation_id: str) -> Conversation | None:
        """Get conversation by ID.

        Args:
            workspace_id: The workspace ID.
            conversation_id: The conversation ID.

        Returns:
            Conversation or None if not found.
        """
        return self.get(pk=f"WS#{workspace_id}", sk=f"CONV#{conversation_id}")

    def list_by_workspace(
        self,
        workspace_id: str,
        status: ConversationStatus | None = None,
        limit: int = 50,
        last_key: dict | None = None,
    ) -> tuple[list[Conversation], dict | None]:
        """List conversations in a workspace.

        Args:
            workspace_id: The workspace ID.
            status: Optional status filter.
            limit: Maximum conversations to return.
            last_key: Pagination cursor.

        Returns:
            Tuple of (conversations, next_page_key).
        """
        filter_expr = None
        expr_values = None

        if status:
            filter_expr = "#status = :status"
            expr_values = {":status": status.value}

        items, next_key = self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="CONV#",
            limit=limit,
            last_key=last_key,
            filter_expression=filter_expr,
            expression_values=expr_values,
        )

        return items, next_key

    def list_by_contact(
        self,
        contact_id: str,
        limit: int = 50,
        scan_forward: bool = False,
    ) -> list[Conversation]:
        """List conversations for a contact using GSI1.

        Args:
            contact_id: The contact ID.
            limit: Maximum conversations to return.
            scan_forward: Sort order (False = newest first).

        Returns:
            List of conversations.
        """
        items, _ = self.query(
            pk=f"CONTACT#{contact_id}",
            sk_begins_with="CONV#",
            index_name="GSI1",
            limit=limit,
            scan_forward=scan_forward,
        )
        return items

    def get_latest_by_contact(
        self,
        workspace_id: str,
        contact_id: str,
    ) -> Conversation | None:
        """Get the most recent conversation for a contact.

        Args:
            workspace_id: The workspace ID.
            contact_id: The contact ID.

        Returns:
            Most recent conversation or None.
        """
        conversations = self.list_by_contact(contact_id, limit=1, scan_forward=False)
        return conversations[0] if conversations else None

    def create_conversation(self, conversation: Conversation) -> Conversation:
        """Create a new conversation.

        Args:
            conversation: The conversation to create.

        Returns:
            The created conversation.
        """
        return self.create(conversation, gsi_keys=conversation.get_gsi1_keys())

    def update_conversation(self, conversation: Conversation) -> Conversation:
        """Update an existing conversation.

        Args:
            conversation: The conversation to update.

        Returns:
            The updated conversation.
        """
        return self.update(conversation, gsi_keys=conversation.get_gsi1_keys())

    def update_last_message(
        self,
        workspace_id: str,
        conversation_id: str,
        message_preview: str,
        timestamp: str,
    ) -> Conversation | None:
        """Update conversation with last message info.

        Args:
            workspace_id: The workspace ID.
            conversation_id: The conversation ID.
            message_preview: Preview text of the message.
            timestamp: Message timestamp.

        Returns:
            Updated conversation or None if not found.
        """
        conversation = self.get_by_id(workspace_id, conversation_id)
        if not conversation:
            return None

        conversation.last_message_at = timestamp
        conversation.last_message_preview = message_preview[:200]
        conversation.message_count += 1

        return self.update_conversation(conversation)

    def close_conversation(
        self,
        workspace_id: str,
        conversation_id: str,
    ) -> Conversation | None:
        """Close a conversation.

        Args:
            workspace_id: The workspace ID.
            conversation_id: The conversation ID.

        Returns:
            Updated conversation or None if not found.
        """
        conversation = self.get_by_id(workspace_id, conversation_id)
        if not conversation:
            return None

        conversation.status = ConversationStatus.CLOSED
        return self.update_conversation(conversation)
