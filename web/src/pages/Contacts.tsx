import { useState } from 'react';
import { Plus, Search, Upload, MoreVertical, Mail, Phone, Loader2, Users } from 'lucide-react';
import { useContacts, useCurrentWorkspace, type Contact } from '../lib/hooks';

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

export default function Contacts() {
  const [searchQuery, setSearchQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const { data, isLoading, error } = useContacts(workspaceId || '');

  const contacts = data?.contacts || [];

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
          <button className="btn btn-secondary inline-flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import
          </button>
          <button className="btn btn-primary inline-flex items-center gap-2">
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
        <div className="card bg-red-50 border-red-200 text-red-800 p-4">
          Failed to load contacts. Please try again.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !isLoadingWorkspace && !error && filteredContacts.length === 0 && (
        <div className="card text-center py-12">
          <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No contacts yet</h3>
          <p className="text-gray-500 mb-4">Add your first contact to get started.</p>
          <button className="btn btn-primary inline-flex items-center gap-2">
            <Plus className="w-5 h-5" />
            Add Contact
          </button>
        </div>
      )}

      {/* Contacts list */}
      {!isLoading && !isLoadingWorkspace && !error && filteredContacts.length > 0 && (
        <>
          <div className="card p-0 overflow-hidden">
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
                      <button className="p-1 text-gray-400 hover:text-gray-600">
                        <MoreVertical className="w-5 h-5" />
                      </button>
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
            </p>
            {data?.next_cursor && (
              <button className="btn btn-secondary">Load More</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
