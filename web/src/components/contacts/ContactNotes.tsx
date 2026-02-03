import { useState } from 'react';
import { StickyNote, Trash2, Pin, Loader2, Send } from 'lucide-react';
import type { ContactNote } from '../../lib/hooks/useContacts';

interface ContactNotesProps {
  notes: ContactNote[];
  isLoading: boolean;
  onCreateNote: (content: string, pinned?: boolean) => Promise<void>;
  onDeleteNote: (noteId: string) => Promise<void>;
  isCreating: boolean;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function ContactNotes({
  notes,
  isLoading,
  onCreateNote,
  onDeleteNote,
  isCreating,
}: ContactNotesProps) {
  const [newNote, setNewNote] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!newNote.trim()) return;
    await onCreateNote(newNote.trim());
    setNewNote('');
  };

  const handleDelete = async (noteId: string) => {
    setDeletingId(noteId);
    try {
      await onDeleteNote(noteId);
    } finally {
      setDeletingId(null);
    }
  };

  // Sort: pinned first, then by date
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return (
    <div className="space-y-4">
      {/* Add note */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note..."
          rows={3}
          className="w-full px-3 py-2 text-sm resize-none focus:outline-none focus:ring-0 border-0"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-200">
          <span className="text-xs text-gray-400">
            {newNote.length}/5000
          </span>
          <button
            onClick={handleSubmit}
            disabled={!newNote.trim() || isCreating}
            className="btn btn-primary text-xs px-3 py-1 inline-flex items-center gap-1.5"
          >
            {isCreating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            Add Note
          </button>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
        </div>
      )}

      {/* Notes list */}
      {!isLoading && sortedNotes.length === 0 && (
        <div className="text-center py-8">
          <StickyNote className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">No notes yet</p>
        </div>
      )}

      {!isLoading && sortedNotes.map((note) => (
        <div
          key={note.id}
          className={`border rounded-lg p-3 ${note.pinned ? 'border-yellow-200 bg-yellow-50' : 'border-gray-200 bg-white'}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {note.pinned && (
                <Pin className="w-3 h-3 text-yellow-600 inline mr-1" />
              )}
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</p>
            </div>
            <button
              onClick={() => handleDelete(note.id)}
              disabled={deletingId === note.id}
              className="text-gray-400 hover:text-red-500 shrink-0 p-1"
            >
              {deletingId === note.id ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
            <span>{note.author_name}</span>
            <span>&middot;</span>
            <span>{formatDate(note.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
