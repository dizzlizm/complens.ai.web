"""Contact note repository for DynamoDB operations."""

from complens.models.contact_note import ContactNote
from complens.repositories.base import BaseRepository


class ContactNoteRepository(BaseRepository[ContactNote]):
    """Repository for ContactNote entities."""

    def __init__(self, table_name: str | None = None):
        """Initialize contact note repository."""
        super().__init__(ContactNote, table_name)

    def create_note(self, note: ContactNote) -> ContactNote:
        """Create a new contact note.

        Args:
            note: The note to create.

        Returns:
            The created note.
        """
        gsi_keys = note.get_gsi1_keys()
        return self.create(note, gsi_keys=gsi_keys)

    def list_by_contact(
        self,
        contact_id: str,
        limit: int = 50,
        last_key: dict | None = None,
    ) -> tuple[list[ContactNote], dict | None]:
        """List notes for a contact, most recent first.

        Args:
            contact_id: The contact ID.
            limit: Maximum notes to return.
            last_key: Pagination cursor.

        Returns:
            Tuple of (notes, next_page_key).
        """
        return self.query(
            pk=f"CONTACT#{contact_id}",
            sk_begins_with="NOTE#",
            limit=limit,
            last_key=last_key,
            scan_forward=False,
        )

    def get_note(self, contact_id: str, note_sk: str) -> ContactNote | None:
        """Get a note by its full sort key.

        Args:
            contact_id: The contact ID.
            note_sk: The full sort key (NOTE#{created_at}#{id}).

        Returns:
            ContactNote or None if not found.
        """
        return self.get(pk=f"CONTACT#{contact_id}", sk=note_sk)

    def update_note(self, note: ContactNote) -> ContactNote:
        """Update an existing note.

        Args:
            note: The note to update.

        Returns:
            The updated note.
        """
        gsi_keys = note.get_gsi1_keys()
        return self.update(note, gsi_keys=gsi_keys)

    def delete_note(self, contact_id: str, note_sk: str) -> bool:
        """Delete a note.

        Args:
            contact_id: The contact ID.
            note_sk: The full sort key (NOTE#{created_at}#{id}).

        Returns:
            True if deleted, False if not found.
        """
        return self.delete(pk=f"CONTACT#{contact_id}", sk=note_sk)
