import { useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import type { Contact, CreateContactInput } from '../../lib/hooks/useContacts';

interface ContactEditFormProps {
  contact: Contact;
  onSave: (data: Partial<CreateContactInput>) => Promise<void>;
  isSaving: boolean;
}

export default function ContactEditForm({ contact, onSave, isSaving }: ContactEditFormProps) {
  const [formData, setFormData] = useState({
    first_name: contact.first_name || '',
    last_name: contact.last_name || '',
    email: contact.email || '',
    phone: contact.phone || '',
    status: contact.status || 'active',
    source: contact.source || '',
    sms_opt_in: contact.sms_opt_in ?? false,
    email_opt_in: contact.email_opt_in ?? true,
  });
  const [customFields, setCustomFields] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(contact.custom_fields || {}).map(([k, v]) => [k, String(v)])
    )
  );
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');

  const handleChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAddCustomField = () => {
    if (newFieldKey.trim()) {
      setCustomFields(prev => ({ ...prev, [newFieldKey.trim()]: newFieldValue }));
      setNewFieldKey('');
      setNewFieldValue('');
    }
  };

  const handleRemoveCustomField = (key: string) => {
    setCustomFields(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const data: Partial<CreateContactInput> = {
      ...formData,
      custom_fields: customFields,
    };
    // Only include changed fields
    await onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
          <input
            type="text"
            value={formData.first_name}
            onChange={(e) => handleChange('first_name', e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
          <input
            type="text"
            value={formData.last_name}
            onChange={(e) => handleChange('last_name', e.target.value)}
            className="input"
          />
        </div>
      </div>

      {/* Email & Phone */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          className="input"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
        <input
          type="tel"
          value={formData.phone}
          onChange={(e) => handleChange('phone', e.target.value)}
          className="input"
        />
      </div>

      {/* Status & Source */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={formData.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className="input"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="unsubscribed">Unsubscribed</option>
            <option value="bounced">Bounced</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
          <input
            type="text"
            value={formData.source}
            onChange={(e) => handleChange('source', e.target.value)}
            className="input"
            placeholder="e.g. website, referral"
          />
        </div>
      </div>

      {/* Opt-in toggles */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Communication Preferences</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.email_opt_in}
              onChange={(e) => handleChange('email_opt_in', e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">Email opt-in</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.sms_opt_in}
              onChange={(e) => handleChange('sms_opt_in', e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-700">SMS opt-in</span>
          </label>
        </div>
      </div>

      {/* Custom fields */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Custom Fields</h3>
        {Object.entries(customFields).map(([key, value]) => (
          <div key={key} className="flex items-center gap-2 mb-2">
            <input
              type="text"
              value={key}
              disabled
              className="input flex-1 bg-gray-50 text-gray-500"
            />
            <input
              type="text"
              value={value}
              onChange={(e) => setCustomFields(prev => ({ ...prev, [key]: e.target.value }))}
              className="input flex-1"
            />
            <button
              type="button"
              onClick={() => handleRemoveCustomField(key)}
              className="text-red-400 hover:text-red-600 text-sm px-2"
            >
              Remove
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newFieldKey}
            onChange={(e) => setNewFieldKey(e.target.value)}
            placeholder="Field name"
            className="input flex-1"
          />
          <input
            type="text"
            value={newFieldValue}
            onChange={(e) => setNewFieldValue(e.target.value)}
            placeholder="Value"
            className="input flex-1"
          />
          <button
            type="button"
            onClick={handleAddCustomField}
            className="btn btn-secondary text-sm"
          >
            Add
          </button>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          type="submit"
          disabled={isSaving}
          className="btn btn-primary inline-flex items-center gap-2"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Changes
        </button>
      </div>
    </form>
  );
}
