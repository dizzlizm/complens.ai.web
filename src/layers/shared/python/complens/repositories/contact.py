"""Contact repository for DynamoDB operations."""

from complens.models.contact import Contact
from complens.repositories.base import BaseRepository


class ContactRepository(BaseRepository[Contact]):
    """Repository for Contact entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize contact repository."""
        super().__init__(Contact, table_name)

    def get_by_id(self, workspace_id: str, contact_id: str) -> Contact | None:
        """Get contact by ID.

        Args:
            workspace_id: The workspace ID.
            contact_id: The contact ID.

        Returns:
            Contact or None if not found.
        """
        return self.get(pk=f"WS#{workspace_id}", sk=f"CONTACT#{contact_id}")

    def get_by_email(self, workspace_id: str, email: str) -> Contact | None:
        """Get contact by email using GSI1.

        Args:
            workspace_id: The workspace ID.
            email: The email address.

        Returns:
            Contact or None if not found.
        """
        items, _ = self.query(
            pk=f"WS#{workspace_id}#EMAIL",
            sk_begins_with=email.lower(),
            index_name="GSI1",
            limit=1,
        )
        return items[0] if items else None

    def get_by_phone(self, workspace_id: str, phone: str) -> Contact | None:
        """Get contact by phone number using GSI4.

        Falls back to partition filter for pre-GSI4 items.

        Args:
            workspace_id: The workspace ID.
            phone: The phone number (E.164 format).

        Returns:
            Contact or None if not found.
        """
        # Try GSI4 first (efficient)
        try:
            items, _ = self.query(
                pk=f"WS#{workspace_id}#PHONE",
                sk_begins_with=phone,
                index_name="GSI4",
                limit=1,
            )
            if items:
                return items[0]
        except Exception:
            pass

        # Fallback for pre-GSI4 items
        items, _ = self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="CONTACT#",
            filter_expression="phone = :phone",
            expression_values={":phone": phone},
            limit=1,
        )
        return items[0] if items else None

    def list_by_workspace(
        self,
        workspace_id: str,
        limit: int = 50,
        last_key: dict | None = None,
    ) -> tuple[list[Contact], dict | None]:
        """List contacts in a workspace.

        Args:
            workspace_id: The workspace ID.
            limit: Maximum contacts to return.
            last_key: Pagination cursor.

        Returns:
            Tuple of (contacts, next_page_key).
        """
        return self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="CONTACT#",
            limit=limit,
            last_key=last_key,
        )

    def list_by_tag(
        self,
        workspace_id: str,
        tag: str,
        limit: int = 50,
    ) -> list[Contact]:
        """List contacts with a specific tag.

        Args:
            workspace_id: The workspace ID.
            tag: The tag to filter by.
            limit: Maximum contacts to return.

        Returns:
            List of contacts with the tag.
        """
        items, _ = self.query(
            pk=f"WS#{workspace_id}",
            sk_begins_with="CONTACT#",
            filter_expression="contains(tags, :tag)",
            expression_values={":tag": tag.lower()},
            limit=limit,
        )
        return items

    def _get_all_gsi_keys(self, contact: Contact) -> dict[str, str] | None:
        """Get all GSI keys for a contact."""
        gsi_keys = contact.get_gsi1_keys() or {}
        gsi4_keys = contact.get_gsi4_keys()
        if gsi4_keys:
            gsi_keys.update(gsi4_keys)
        return gsi_keys or None

    def create_contact(self, contact: Contact) -> Contact:
        """Create a new contact.

        Args:
            contact: The contact to create.

        Returns:
            The created contact.
        """
        return self.create(contact, gsi_keys=self._get_all_gsi_keys(contact))

    def update_contact(self, contact: Contact) -> Contact:
        """Update an existing contact.

        Args:
            contact: The contact to update.

        Returns:
            The updated contact.
        """
        return self.update(contact, gsi_keys=self._get_all_gsi_keys(contact))

    def delete_contact(self, workspace_id: str, contact_id: str) -> bool:
        """Delete a contact.

        Args:
            workspace_id: The workspace ID.
            contact_id: The contact ID.

        Returns:
            True if deleted, False if not found.
        """
        return self.delete(pk=f"WS#{workspace_id}", sk=f"CONTACT#{contact_id}")

    def find_or_create_by_email(
        self,
        workspace_id: str,
        email: str,
        defaults: dict | None = None,
    ) -> tuple[Contact, bool]:
        """Find contact by email or create if not exists.

        Args:
            workspace_id: The workspace ID.
            email: The email address.
            defaults: Default values for new contact.

        Returns:
            Tuple of (contact, was_created).
        """
        existing = self.get_by_email(workspace_id, email)
        if existing:
            return existing, False

        contact_data = defaults or {}
        contact_data["workspace_id"] = workspace_id
        contact_data["email"] = email

        contact = Contact(**contact_data)
        created = self.create_contact(contact)
        return created, True

    def find_or_create_by_phone(
        self,
        workspace_id: str,
        phone: str,
        defaults: dict | None = None,
    ) -> tuple[Contact, bool]:
        """Find contact by phone or create if not exists.

        Args:
            workspace_id: The workspace ID.
            phone: The phone number (E.164 format).
            defaults: Default values for new contact.

        Returns:
            Tuple of (contact, was_created).
        """
        existing = self.get_by_phone(workspace_id, phone)
        if existing:
            return existing, False

        contact_data = defaults or {}
        contact_data["workspace_id"] = workspace_id
        contact_data["phone"] = phone

        contact = Contact(**contact_data)
        created = self.create_contact(contact)
        return created, True
