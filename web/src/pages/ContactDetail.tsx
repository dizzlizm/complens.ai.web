import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertTriangle, Trash2, DollarSign } from 'lucide-react';
import Tabs from '../components/ui/Tabs';
import {
  useContact, useUpdateContact, useDeleteContact,
  useContactActivity, useContactNotes,
  useCreateContactNote, useDeleteContactNote,
  useCurrentWorkspace,
  useContactDeals,
} from '../lib/hooks';
import { useToast } from '../components/Toast';
import ContactProfileCard from '../components/contacts/ContactProfileCard';
import ContactActivityTimeline from '../components/contacts/ContactActivityTimeline';
import ContactNotes from '../components/contacts/ContactNotes';
import ContactEditForm from '../components/contacts/ContactEditForm';
import { ConfirmDialog } from '../components/ui/Modal';

type Tab = 'activity' | 'details' | 'notes' | 'deals';

export default function ContactDetail() {
  const { id: contactId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('activity');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();

  const {
    data: contact,
    isLoading: isLoadingContact,
    error: contactError,
  } = useContact(workspaceId || '', contactId || '');

  const updateContact = useUpdateContact(workspaceId || '', contactId || '');
  const deleteContact = useDeleteContact(workspaceId || '');

  const {
    data: activities = [],
    isLoading: isLoadingActivity,
  } = useContactActivity(workspaceId || '', contactId || '');

  const {
    data: notes = [],
    isLoading: isLoadingNotes,
  } = useContactNotes(workspaceId || '', contactId || '');

  const createNote = useCreateContactNote(workspaceId || '', contactId || '');
  const deleteNote = useDeleteContactNote(workspaceId || '', contactId || '');

  const { data: contactDealsData } = useContactDeals(workspaceId || '', contactId);
  const contactDeals = contactDealsData?.deals || [];

  const handleEditTags = async (tags: string[]) => {
    try {
      await updateContact.mutateAsync({ tags });
    } catch {
      toast.error('Failed to update tags');
    }
  };

  const handleSave = async (data: Record<string, unknown>) => {
    try {
      await updateContact.mutateAsync(data);
      toast.success('Contact updated');
    } catch {
      toast.error('Failed to update contact');
    }
  };

  const handleCreateNote = async (content: string) => {
    try {
      await createNote.mutateAsync({ content });
    } catch {
      toast.error('Failed to create note');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await deleteNote.mutateAsync(noteId);
    } catch {
      toast.error('Failed to delete note');
    }
  };

  const handleDelete = async () => {
    if (!contactId) return;
    try {
      await deleteContact.mutateAsync(contactId);
      toast.success('Contact deleted');
      navigate('/contacts');
    } catch {
      toast.error('Failed to delete contact');
    }
    setShowDeleteDialog(false);
  };

  if (isLoadingContact || isLoadingWorkspace) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (contactError || !contact) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto text-red-400 mb-3" />
          <h3 className="text-lg font-medium text-red-800 mb-1">Contact not found</h3>
          <p className="text-red-600 mb-4">This contact may have been deleted.</p>
          <Link to="/contacts" className="btn btn-secondary">
            Back to Contacts
          </Link>
        </div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'activity', label: 'Activity' },
    { id: 'details', label: 'Details' },
    { id: 'notes', label: `Notes${notes.length > 0 ? ` (${notes.length})` : ''}` },
    { id: 'deals', label: `Deals${contactDeals.length > 0 ? ` (${contactDeals.length})` : ''}` },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/contacts"
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Contact Details</h1>
        </div>
        <button
          onClick={() => setShowDeleteDialog(true)}
          className="btn bg-red-50 text-red-600 hover:bg-red-100 inline-flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>

      {/* Main layout: sidebar + content */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar (profile card) */}
        <div className="lg:w-80 shrink-0">
          <div className="card p-5 sticky top-6">
            <ContactProfileCard
              contact={contact}
              onEditTags={handleEditTags}
            />
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 min-w-0">
          {/* Tabs */}
          <div className="mb-6">
            <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} size="md" />
          </div>

          {/* Tab content */}
          <div className="card p-5">
            {activeTab === 'activity' && (
              <ContactActivityTimeline
                activities={activities}
                isLoading={isLoadingActivity}
              />
            )}
            {activeTab === 'details' && (
              <ContactEditForm
                contact={contact}
                onSave={handleSave}
                isSaving={updateContact.isPending}
              />
            )}
            {activeTab === 'notes' && (
              <ContactNotes
                notes={notes}
                isLoading={isLoadingNotes}
                onCreateNote={handleCreateNote}
                onDeleteNote={handleDeleteNote}
                isCreating={createNote.isPending}
              />
            )}
            {activeTab === 'deals' && (
              <ContactDealsTab deals={contactDeals} />
            )}
          </div>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Delete Contact"
        message="Are you sure you want to delete this contact? This action cannot be undone. All notes and activity history for this contact will remain but will no longer be linked."
        confirmLabel="Delete Contact"
        isDestructive
        isLoading={deleteContact.isPending}
      />
    </div>
  );
}

interface ContactDeal {
  id: string;
  title: string;
  value: number;
  stage: string;
  priority: 'low' | 'medium' | 'high';
  created_at: string;
  expected_close_date?: string;
}

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
};

function ContactDealsTab({ deals }: { deals: ContactDeal[] }) {
  if (deals.length === 0) {
    return (
      <div className="text-center py-8">
        <DollarSign className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-gray-500 font-medium">No deals linked to this contact</p>
        <p className="text-sm text-gray-400 mt-1">
          Deals will appear here when created with this contact attached.
        </p>
        <Link to="/deals" className="text-sm text-primary-600 hover:text-primary-700 mt-3 inline-block">
          Go to Deal Pipeline
        </Link>
      </div>
    );
  }

  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">{deals.length} deal{deals.length !== 1 ? 's' : ''}</p>
        <p className="text-sm font-medium text-gray-700">
          Total: ${totalValue.toLocaleString()}
        </p>
      </div>
      <div className="space-y-2">
        {deals.map((deal) => (
          <Link
            key={deal.id}
            to={`/deals?selected=${deal.id}`}
            className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50/30 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 truncate">{deal.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-500">{deal.stage}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_STYLES[deal.priority] || PRIORITY_STYLES.low}`}>
                  {deal.priority}
                </span>
                {deal.expected_close_date && (
                  <span className="text-xs text-gray-400">
                    Close: {new Date(deal.expected_close_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className="font-semibold text-gray-900">${(deal.value || 0).toLocaleString()}</p>
              <p className="text-xs text-gray-400">{new Date(deal.created_at).toLocaleDateString()}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
