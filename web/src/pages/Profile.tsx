import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';
import { Camera, Mail, Phone, MapPin, Building, Calendar, Loader2, Check } from 'lucide-react';
import { TimezoneSelect } from '../components/ui';
import { useToast } from '../components/Toast';

export default function Profile() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize from user data when available
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    company: '',
    role: '',
    location: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    bio: '',
  });

  // Update profile when user data is available
  useEffect(() => {
    if (user) {
      const nameParts = (user.name || '').split(' ');
      setProfile((prev) => ({
        ...prev,
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        email: user.email || '',
      }));
    }
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate API call - in production, this would save to Cognito user attributes
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsSaving(false);
    setIsEditing(false);
    showToast('success', 'Profile updated successfully');
  };

  // Member since would come from user attributes if stored, use a placeholder for now
  const memberSince = 'Member';

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
              onClick={() => setIsEditing(false)}
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

      {/* Profile card */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-6">
          {/* Avatar section */}
          <div className="flex-shrink-0">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-2xl font-bold">
                {profile.firstName[0]}
                {profile.lastName[0]}
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
                    value={profile.firstName}
                    onChange={(e) =>
                      setProfile({ ...profile, firstName: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-gray-900">{profile.firstName}</p>
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
                    value={profile.lastName}
                    onChange={(e) =>
                      setProfile({ ...profile, lastName: e.target.value })
                    }
                  />
                ) : (
                  <p className="text-gray-900">{profile.lastName}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bio
              </label>
              {isEditing ? (
                <textarea
                  className="input min-h-[80px]"
                  value={profile.bio}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                />
              ) : (
                <p className="text-gray-600">{profile.bio}</p>
              )}
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
              {isEditing ? (
                <input
                  type="email"
                  className="input"
                  value={profile.email}
                  onChange={(e) =>
                    setProfile({ ...profile, email: e.target.value })
                  }
                />
              ) : (
                <p className="text-gray-900">{profile.email}</p>
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
                  value={profile.phone}
                  onChange={(e) =>
                    setProfile({ ...profile, phone: e.target.value })
                  }
                />
              ) : (
                <p className="text-gray-900">{profile.phone}</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Building className="w-5 h-5 text-gray-400 mt-0.5" />
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company
              </label>
              {isEditing ? (
                <input
                  type="text"
                  className="input"
                  value={profile.company}
                  onChange={(e) =>
                    setProfile({ ...profile, company: e.target.value })
                  }
                />
              ) : (
                <p className="text-gray-900">{profile.company}</p>
              )}
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </label>
              {isEditing ? (
                <input
                  type="text"
                  className="input"
                  value={profile.location}
                  onChange={(e) =>
                    setProfile({ ...profile, location: e.target.value })
                  }
                />
              ) : (
                <p className="text-gray-900">{profile.location}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Work information */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Work Information
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Role
            </label>
            {isEditing ? (
              <input
                type="text"
                className="input"
                value={profile.role}
                onChange={(e) => setProfile({ ...profile, role: e.target.value })}
              />
            ) : (
              <p className="text-gray-900">{profile.role}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Timezone
            </label>
            {isEditing ? (
              <TimezoneSelect
                value={profile.timezone}
                onChange={(value) => setProfile({ ...profile, timezone: value })}
              />
            ) : (
              <p className="text-gray-900">
                {profile.timezone.replace('America/', '').replace('_', ' ').replace('/', ' / ')}
              </p>
            )}
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
              <p className="text-sm text-gray-500">Member for</p>
              <p className="text-gray-900">{memberSince}</p>
            </div>
          </div>
          <div>
            <p className="text-sm text-gray-500">Account ID</p>
            <p className="text-gray-900 font-mono text-sm truncate" title={user?.id}>
              {user?.id ? user.id.slice(0, 20) + '...' : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="card border-red-200">
        <h2 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h2>
        <p className="text-sm text-gray-600 mb-4">
          Once you delete your account, there is no going back. Please be certain.
        </p>
        <button className="btn bg-red-600 text-white hover:bg-red-700">
          Delete Account
        </button>
      </div>
    </div>
  );
}
