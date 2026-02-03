import { useState } from 'react';
import {
  Mail, Phone, MapPin, Calendar, MessageSquare,
  Check, X, Tag, Edit2, Shield,
} from 'lucide-react';
import type { Contact } from '../../lib/hooks/useContacts';

interface ContactProfileCardProps {
  contact: Contact;
  onEditTags?: (tags: string[]) => void;
}

function getInitials(contact: Contact): string {
  if (contact.first_name && contact.last_name) {
    return `${contact.first_name[0]}${contact.last_name[0]}`.toUpperCase();
  }
  if (contact.first_name) return contact.first_name[0].toUpperCase();
  if (contact.email) return contact.email[0].toUpperCase();
  return '?';
}

function getDisplayName(contact: Contact): string {
  if (contact.full_name) return contact.full_name;
  if (contact.first_name && contact.last_name) return `${contact.first_name} ${contact.last_name}`;
  if (contact.first_name) return contact.first_name;
  if (contact.email) return contact.email;
  if (contact.phone) return contact.phone;
  return 'Unknown Contact';
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-gray-100 text-gray-800',
  unsubscribed: 'bg-red-100 text-red-800',
  bounced: 'bg-yellow-100 text-yellow-800',
};

function formatDate(dateString?: string): string {
  if (!dateString) return 'Never';
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function ContactProfileCard({ contact, onEditTags }: ContactProfileCardProps) {
  const [tagInput, setTagInput] = useState('');
  const [isEditingTags, setIsEditingTags] = useState(false);

  const handleAddTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !contact.tags.includes(tag) && onEditTags) {
      onEditTags([...contact.tags, tag]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    if (onEditTags) {
      onEditTags(contact.tags.filter(t => t !== tag));
    }
  };

  return (
    <div className="space-y-6">
      {/* Avatar + Name */}
      <div className="text-center">
        <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-2xl font-bold mx-auto">
          {getInitials(contact)}
        </div>
        <h2 className="mt-3 text-xl font-semibold text-gray-900">{getDisplayName(contact)}</h2>
        <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[contact.status] || statusColors.active}`}>
          {contact.status}
        </span>
      </div>

      {/* Contact info */}
      <div className="space-y-3">
        {contact.email && (
          <div className="flex items-center gap-2 text-sm">
            <Mail className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-gray-700 truncate">{contact.email}</span>
          </div>
        )}
        {contact.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-gray-700">{contact.phone}</span>
          </div>
        )}
        {contact.source && (
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="text-gray-700">{contact.source}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
          <span className="text-gray-500">Added {formatDate(contact.created_at)}</span>
        </div>
      </div>

      {/* Engagement metrics */}
      <div>
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Engagement</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <div className="text-lg font-semibold text-gray-900">{contact.total_messages_sent}</div>
            <div className="text-xs text-gray-500">Sent</div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2.5 text-center">
            <div className="text-lg font-semibold text-gray-900">{contact.total_messages_received}</div>
            <div className="text-xs text-gray-500">Received</div>
          </div>
        </div>
        <div className="mt-2 space-y-1 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            Last contacted: {formatDate(contact.last_contacted_at)}
          </div>
          <div className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            Last response: {formatDate(contact.last_response_at)}
          </div>
        </div>
      </div>

      {/* Opt-in status */}
      <div>
        <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Opt-in Status</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-gray-400" />
              <span>Email</span>
            </div>
            {contact.email_opt_in ? (
              <span className="flex items-center gap-1 text-green-600 text-xs">
                <Check className="w-3 h-3" /> Opted in
              </span>
            ) : (
              <span className="flex items-center gap-1 text-gray-400 text-xs">
                <X className="w-3 h-3" /> Opted out
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-gray-400" />
              <span>SMS</span>
            </div>
            {contact.sms_opt_in ? (
              <span className="flex items-center gap-1 text-green-600 text-xs">
                <Check className="w-3 h-3" /> Opted in
              </span>
            ) : (
              <span className="flex items-center gap-1 text-gray-400 text-xs">
                <X className="w-3 h-3" /> Opted out
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tags */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider">Tags</h3>
          {onEditTags && (
            <button
              onClick={() => setIsEditingTags(!isEditingTags)}
              className="text-gray-400 hover:text-gray-600"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {contact.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary-50 text-primary-700"
            >
              <Tag className="w-3 h-3" />
              {tag}
              {isEditingTags && (
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="hover:text-primary-900 ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
          {contact.tags.length === 0 && !isEditingTags && (
            <span className="text-xs text-gray-400">No tags</span>
          )}
        </div>
        {isEditingTags && (
          <div className="flex gap-1.5 mt-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
              className="input text-xs flex-1"
              placeholder="Add tag..."
            />
            <button onClick={handleAddTag} className="btn btn-secondary text-xs px-2 py-1">
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
