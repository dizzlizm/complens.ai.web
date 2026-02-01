import { useState } from 'react';
import { Plus, Search, Upload, MoreVertical, Mail, Phone, Loader2, Users, Trash2, AlertTriangle } from 'lucide-react';
import { useInfiniteContacts, useCurrentWorkspace, useCreateContact, useDeleteContact, type Contact, type CreateContactInput } from '../lib/hooks';
import Modal, { ModalFooter } from '../components/ui/Modal';
import { useToast } from '../components/Toast';
import DropdownMenu, { DropdownItem } from '../components/ui/DropdownMenu';

// Format relative time
function formatRelativeTime(dateString?: string): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${diffDays} days ago`;
}

// Get initials from name or email
function getInitials(contact: Contact): string {
  if (contact.full_name) {
    return contact.full_name.split(' ').map(n => n[0]).join('').toUpperCase();
  }
  if (contact.first_name && contact.last_name) {
    return `${contact.first_name[0]}${contact.last_name[0]}`.toUpperCase();
  }
  if (contact.first_name) {
    return contact.first_name[0].toUpperCase();
  }
  if (contact.email) {
    return contact.email[0].toUpperCase();
  }
  return '?';
}

// Get display name
function getDisplayName(contact: Contact): string {
  if (contact.full_name) return contact.full_name;
  if (contact.first_name && contact.last_name) {
    return `${contact.first_name} ${contact.last_name}`;
  }
  if (contact.first_name) return contact.first_name;
  if (contact.email) return contact.email;
  if (contact.phone) return contact.phone;
  return 'Unknown Contact';
}

// Empty form state
const emptyForm: CreateContactInput = {
  email: '',
  phone: '',
  first_name: '',
  last_name: '',
  tags: [],
};

export default function Contacts() {
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formData, setFormData] = useState<CreateContactInput>(emptyForm);
  const [tagInput, setTagInput] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteContacts(workspaceId || '');
  const createContact = useCreateContact(workspaceId || '');
  const deleteContact = useDeleteContact(workspaceId || '');
  const toast = useToast();

  // Flatten all pages of contacts
  const contacts = data?.pages.flatMap((page) => page.contacts) || [];

  // Handle form field changes
  const handleFieldChange = (field: keyof CreateContactInput, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Add a tag
  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !formData.tags?.includes(tag)) {
      setFormData((prev) => ({ ...prev, tags: [...(prev.tags || []), tag] }));
      setTagInput('');
    }
  };

  // Remove a tag
  const handleRemoveTag = (tag: string) => {
    setFormData((prev) => ({ ...prev, tags: prev.tags?.filter((t) => t !== tag) }));
  };

  // Submit the form
  const handleSubmit = async () => {
    // Validate: need at least email or phone
    if (!formData.email && !formData.phone) {
      toast.warning('Please provide an email or phone number');
      return;
    }

    try {
      await createContact.mutateAsync(formData);
      setIsAddModalOpen(false);
      setFormData(emptyForm);
      toast.success('Contact created successfully');
    } catch (error) {
      console.error('Failed to create contact:', error);
      toast.error('Failed to create contact. Please try again.');
    }
  };

  // Delete contact
  const handleDelete = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;

    setDeletingId(contactId);

    try {
      await deleteContact.mutateAsync(contactId);
      toast.success('Contact deleted');
    } catch (error) {
      console.error('Failed to delete contact:', error);
      toast.error('Failed to delete contact');
    } finally {
      setDeletingId(null);
    }
  };

  // Open add modal
  const openAddModal = () => {
    setFormData(emptyForm);
    setTagInput('');
    setIsAddModalOpen(true);
  };

  // Get unique tags from all contacts
  const allTags = Array.from(new Set(contacts.flatMap(c => c.tags || [])));

  // Filter contacts
  const filteredContacts = contacts.filter((contact) => {
    const name = getDisplayName(contact).toLowerCase();
    const email = contact.email?.toLowerCase() || '';
    const phone = contact.phone || '';
    const matchesSearch = name.includes(searchQuery.toLowerCase()) ||
      email.includes(searchQuery.toLowerCase()) ||
      phone.includes(searchQuery);
    const matchesTag = tagFilter === 'all' || contact.tags?.includes(tagFilter);
    return matchesSearch && matchesTag;
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="mt-1 text-gray-500">Manage your contact list and segments</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary inline-flex items-center gap-2" disabled>
            <Upload className="w-5 h-5" />
            Import
          </button>
          <button onClick={openAddModal} className="btn btn-primary inline-flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Contact
          </button>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search contacts..."
            className="input pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <select
          className="input w-full sm:w-40"
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
        >
          <option value="all">All Tags</option>
          {allTags.map((tag) => (
            <option key={tag} value={tag}>{tag}</option>
          ))}
        </select>
      </div>

      {/* Loading state */}
      {(isLoading || isLoadingWorkspace) && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto text-red-400 mb-3" />
          <h3 className="text-lg font-medium text-red-800 mb-1">Failed to load contacts</h3>
          <p className="text-red-600 mb-4">Something went wrong while fetching your contacts.</p>
          <button
            onClick={() => refetch()}
            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isLoadingWorkspace && !error && filteredContacts.length === 0 && (
        <div className="card text-center py-12">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No contacts yet</h3>
          <p className="text-gray-500 mb-4">Add your first contact to get started.</p>
          <button onClick={openAddModal} className="btn btn-primary inline-flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Contact
          </button>
        </div>
      )}

      {/* Contacts list */}
      {!isLoading && !isLoadingWorkspace && !error && filteredContacts.length > 0 && (
        <>
          <div className="card p-0 overflow-visible">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input type="checkbox" className="rounded border-gray-300" />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tags
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Added
                  </th>
                  <th className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredContacts.map((contact) => (
                  <tr key={contact.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <input type="checkbox" className="rounded border-gray-300" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-medium">
                          {getInitials(contact)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{getDisplayName(contact)}</p>
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            {contact.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="w-4 h-4" />
                                {contact.email}
                              </span>
                            )}
                            {contact.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-4 h-4" />
                                {contact.phone}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(contact.tags || []).map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800"
                          >
                            {tag}
                          </span>
                        ))}
                        {(!contact.tags || contact.tags.length === 0) && (
                          <span className="text-gray-400 text-sm">No tags</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {formatRelativeTime(contact.created_at)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm font-medium">
                      <DropdownMenu
                        trigger={
                          <button className="p-1 text-gray-400 hover:text-gray-600">
                            {deletingId === contact.id ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <MoreVertical className="w-5 h-5" />
                            )}
                          </button>
                        }
                      >
                        <DropdownItem
                          variant="danger"
                          onClick={() => handleDelete(contact.id)}
                          disabled={deletingId === contact.id}
                        >
                          <span className="flex items-center gap-2">
                            <Trash2 className="w-4 h-4" />
                            Delete
                          </span>
                        </DropdownItem>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination info */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {filteredContacts.length} of {contacts.length} contacts
              {hasNextPage && ' (more available)'}
            </p>
            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="btn btn-secondary inline-flex items-center gap-2"
              >
                {isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin" />}
                {isFetchingNextPage ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        </>
      )}

      {/* Add Contact Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Contact"
        size="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                value={formData.first_name || ''}
                onChange={(e) => handleFieldChange('first_name', e.target.value)}
                className="input"
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                value={formData.last_name || ''}
                onChange={(e) => handleFieldChange('last_name', e.target.value)}
                className="input"
                placeholder="Doe"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email <span className="text-gray-400">(required if no phone)</span>
            </label>
            <input
              type="email"
              value={formData.email || ''}
              onChange={(e) => handleFieldChange('email', e.target.value)}
              className="input"
              placeholder="john@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone <span className="text-gray-400">(required if no email)</span>
            </label>
            <input
              type="tel"
              value={formData.phone || ''}
              onChange={(e) => handleFieldChange('phone', e.target.value)}
              className="input"
              placeholder="+1 555 123 4567"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tags</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                className="input flex-1"
                placeholder="Type a tag and press Enter"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="btn btn-secondary"
              >
                Add
              </button>
            </div>
            {formData.tags && formData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-primary-100 text-primary-700"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-primary-900"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <ModalFooter>
          <button
            onClick={() => setIsAddModalOpen(false)}
            className="btn btn-secondary"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={createContact.isPending}
            className="btn btn-primary"
          >
            {createContact.isPending ? 'Creating...' : 'Create Contact'}
          </button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
