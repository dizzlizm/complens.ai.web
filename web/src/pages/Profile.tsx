import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { Camera, Mail, Phone, Calendar, Loader2, Check, AlertCircle } from 'lucide-react';
import { useToast } from '../components/Toast';

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (user) {
      const nameParts = (user.name || '').split(' ');
      setFirstName(nameParts[0] || '');
      setLastName(nameParts.slice(1).join(' ') || '');
      setPhone(user.phone || '');
    }
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError('');
    try {
      const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
      await updateProfile({
        name: fullName || undefined,
        phone_number: phone.trim() || undefined,
      });
      setIsSaving(false);
      setIsEditing(false);
      showToast('success', 'Profile updated successfully');
    } catch (err: unknown) {
      setIsSaving(false);
      const message = err instanceof Error ? err.message : 'Failed to save profile';
      setSaveError(message);
      showToast('error', message);
    }
  };

  const handleCancel = () => {
    if (user) {
      const nameParts = (user.name || '').split(' ');
      setFirstName(nameParts[0] || '');
      setLastName(nameParts.slice(1).join(' ') || '');
      setPhone(user.phone || '');
    }
    setSaveError('');
    setIsEditing(false);
  };

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <p className="mt-1 text-gray-500">Manage your personal information</p>
        </div>
        {!isEditing ? (
          <button className="btn btn-primary" onClick={() => setIsEditing(true)}>
            Edit Profile
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              className="btn btn-secondary"
              onClick={handleCancel}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary inline-flex items-center gap-2"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {saveError && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {saveError}
        </div>
      )}

      {/* Profile card */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Avatar section */}
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-2xl font-bold">
                {firstName[0]}
                {lastName[0]}
              </div>
              {isEditing && (
                <button className="absolute bottom-0 right-0 w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center text-white hover:bg-primary-700 transition-colors">
                  <Camera className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Profile info */}
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    className="input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                ) : (
                  <p className="text-gray-900">{firstName || '-'}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name
                </label>
                {isEditing ? (
                  <input
                    type="text"
                    className="input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                ) : (
                  <p className="text-gray-900">{lastName || '-'}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Contact information */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Contact Information
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-gray-400 mt-0.5" />
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <p className="text-gray-900">{user?.email || '-'}</p>
              {isEditing && (
                <p className="text-xs text-gray-500 mt-1">Email is tied to your login and cannot be changed here</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-gray-400 mt-0.5" />
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone
              </label>
              {isEditing ? (
                <input
                  type="tel"
                  className="input"
                  placeholder="+1 (555) 000-0000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              ) : (
                <p className="text-gray-900">{phone || '-'}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Account info (read-only) */}
      <div className="card bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Account Information
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-gray-400" />
            <div>
              <p className="text-sm text-gray-500">Timezone</p>
              <p className="text-gray-900">
                {timezone.replace(/_/g, ' ')}
              </p>
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-500">Account ID</p>
            <p className="text-gray-900 font-mono text-sm truncate" title={user?.id}>
              {user?.id || 'N/A'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
