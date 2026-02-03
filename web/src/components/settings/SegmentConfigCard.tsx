import { useState } from 'react';
import { BarChart3, Check, Loader2, Copy, CheckCircle } from 'lucide-react';
import {
  useIntegrationStatus,
  useSaveSegmentConfig,
  useDisconnectIntegration,
} from '../../lib/hooks/useIntegrations';

interface SegmentConfigCardProps {
  workspaceId: string;
}

export default function SegmentConfigCard({ workspaceId }: SegmentConfigCardProps) {
  const { data: status, isLoading } = useIntegrationStatus(workspaceId);
  const saveSegment = useSaveSegmentConfig(workspaceId);
  const disconnect = useDisconnectIntegration(workspaceId);

  const [sharedSecret, setSharedSecret] = useState('');
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const isConnected = status?.segment?.connected ?? false;
  const apiUrl = import.meta.env.VITE_API_URL || '';
  const webhookUrl = `${apiUrl}/webhooks/segment/${workspaceId}`;

  const handleSave = async () => {
    try {
      await saveSegment.mutateAsync({ shared_secret: sharedSecret });
      setSharedSecret('');
    } catch {
      // error handled by mutation state
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect.mutateAsync('segment');
      setShowDisconnectConfirm(false);
    } catch {
      // error handled by mutation state
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="card">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Segment</h2>
            <p className="text-sm text-gray-500">Customer data platform</p>
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
          <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Segment</h2>
            <p className="text-sm text-gray-500">Customer data platform</p>
          </div>
        </div>
        {isConnected && (
          <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-sm">
            <Check className="w-4 h-4" />
            Connected
          </div>
        )}
      </div>

      {/* Webhook URL - always shown */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Webhook URL
        </label>
        <div className="flex items-center gap-2">
          <input
            type="text"
            className="input font-mono text-xs flex-1 bg-gray-50"
            value={webhookUrl}
            readOnly
          />
          <button
            onClick={handleCopy}
            className="btn btn-secondary inline-flex items-center gap-1 flex-shrink-0"
          >
            {copied ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Add this URL as a webhook destination in your Segment workspace
        </p>
      </div>

      {isConnected ? (
        <>
          <div className="p-4 bg-gray-50 rounded-lg mb-4">
            <p className="text-sm text-gray-700">
              Segment is configured with a shared secret for webhook signature verification.
              Events will be synced to your contacts and can trigger workflows.
            </p>
          </div>

          <div className="flex items-center justify-between pt-4 border-t">
            <p className="text-sm text-gray-500">Segment integration active</p>
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
                Shared Secret
              </label>
              <input
                type="password"
                className="input font-mono text-sm"
                value={sharedSecret}
                onChange={(e) => setSharedSecret(e.target.value)}
                placeholder="Enter your Segment shared secret"
              />
              <p className="mt-1 text-xs text-gray-500">
                Found in Segment &gt; Destinations &gt; Webhook &gt; Settings
              </p>
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={handleSave}
              disabled={!sharedSecret || saveSegment.isPending}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              {saveSegment.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {saveSegment.isPending ? 'Saving...' : 'Save & Connect'}
            </button>
          </div>

          {saveSegment.isError && (
            <p className="text-sm text-red-600 mt-2">Failed to save configuration.</p>
          )}
        </>
      )}
    </div>
  );
}
