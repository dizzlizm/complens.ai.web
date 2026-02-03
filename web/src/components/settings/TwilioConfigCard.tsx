import { useState, useEffect } from 'react';
import { Phone, Check, AlertCircle, Loader2 } from 'lucide-react';
import {
  useIntegrationStatus,
  useSaveTwilioConfig,
  useTestTwilioConnection,
  useDisconnectIntegration,
} from '../../lib/hooks/useIntegrations';

interface TwilioConfigCardProps {
  workspaceId: string;
}

export default function TwilioConfigCard({ workspaceId }: TwilioConfigCardProps) {
  const { data: status, isLoading } = useIntegrationStatus(workspaceId);
  const saveTwilio = useSaveTwilioConfig(workspaceId);
  const testConnection = useTestTwilioConnection(workspaceId);
  const disconnect = useDisconnectIntegration(workspaceId);

  const [isEditing, setIsEditing] = useState(false);
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const isConnected = status?.twilio?.connected ?? false;

  useEffect(() => {
    if (status?.twilio?.connected) {
      setPhoneNumber(status.twilio.phone_number || '');
    }
  }, [status]);

  const handleSave = async () => {
    try {
      await saveTwilio.mutateAsync({
        account_sid: accountSid,
        auth_token: authToken,
        phone_number: phoneNumber,
      });
      setIsEditing(false);
      setAuthToken('');
    } catch {
      // error handled by mutation state
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync('twilio');
      setShowDisconnectConfirm(false);
      setAccountSid('');
      setAuthToken('');
      setPhoneNumber('');
    } catch {
      // error handled by mutation state
    }
  };

  const handleTest = async () => {
    try {
      await testConnection.mutateAsync();
    } catch {
      // error handled by mutation state
    }
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
            <Phone className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Twilio</h2>
            <p className="text-sm text-gray-500">SMS messaging and phone calls</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-red-50 rounded-lg flex items-center justify-center">
            <Phone className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Twilio</h2>
            <p className="text-sm text-gray-500">SMS messaging and phone calls</p>
          </div>
        </div>
        {isConnected && (
          <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">
            <Check className="w-4 h-4" />
            Connected
          </div>
        )}
      </div>

      {isConnected && !isEditing ? (
        <>
          <div className="p-4 bg-gray-50 rounded-lg mb-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Account SID</p>
                <p className="font-medium text-gray-900 font-mono text-sm">
                  {status?.twilio?.account_sid_masked || '****'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Phone Number</p>
                <p className="font-medium text-gray-900">{status?.twilio?.phone_number || '-'}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-4">
            <button
              onClick={handleTest}
              disabled={testConnection.isPending}
              className="btn btn-secondary inline-flex items-center gap-2"
            >
              {testConnection.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Test Connection
            </button>
            <button
              onClick={() => setIsEditing(true)}
              className="btn btn-secondary"
            >
              Update Credentials
            </button>
          </div>

          {testConnection.isSuccess && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-4 flex items-center gap-2">
              <Check className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700">
                Connection successful{testConnection.data?.account_name ? ` - ${testConnection.data.account_name}` : ''}
              </span>
            </div>
          )}

          {testConnection.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span className="text-sm text-red-700">Connection failed. Check your credentials.</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-gray-500">Twilio integration active</p>
            {showDisconnectConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Are you sure?</span>
                <button
                  onClick={handleDisconnect}
                  disabled={disconnect.isPending}
                  className="btn btn-sm bg-red-600 hover:bg-red-700 text-white"
                >
                  {disconnect.isPending ? 'Disconnecting...' : 'Yes, Disconnect'}
                </button>
                <button
                  onClick={() => setShowDisconnectConfirm(false)}
                  className="btn btn-sm btn-secondary"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowDisconnectConfirm(true)}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Disconnect
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account SID
              </label>
              <input
                type="text"
                className="input font-mono text-sm"
                value={accountSid}
                onChange={(e) => setAccountSid(e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Auth Token
              </label>
              <input
                type="password"
                className="input font-mono text-sm"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="Enter your Twilio auth token"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                className="input"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+15551234567"
              />
              <p className="mt-1 text-xs text-gray-500">Your Twilio phone number in E.164 format</p>
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleSave}
              disabled={!accountSid || !authToken || !phoneNumber || saveTwilio.isPending}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              {saveTwilio.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {saveTwilio.isPending ? 'Saving...' : 'Save & Connect'}
            </button>
            {isEditing && (
              <button
                onClick={() => setIsEditing(false)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            )}
          </div>

          {saveTwilio.isError && (
            <p className="text-sm text-red-600 mt-2">Failed to save. Please check your credentials.</p>
          )}
        </>
      )}
    </div>
  );
}
