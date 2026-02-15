import { useState, useEffect } from 'react';
import {
  Loader2, Check, AlertCircle,
} from 'lucide-react';
import {
  useCurrentWorkspace, useUpdateWorkspace,
  useSite, useUpdateSite,
  useVerifiedEmails,
} from '../../lib/hooks';

export default function EmailIdentity({
  workspaceId,
  siteId,
}: {
  workspaceId: string | undefined;
  siteId?: string;
}) {
  const { workspace } = useCurrentWorkspace();
  const updateWorkspace = useUpdateWorkspace(workspaceId || '');

  // Site-scoped mode: read/write site.settings instead of workspace
  const { data: site } = useSite(siteId ? workspaceId : undefined, siteId);
  const updateSite = useUpdateSite(workspaceId || '', siteId || '');

  // Verified emails from the central registry
  const { data: verifiedData, isLoading: isLoadingEmails } = useVerifiedEmails(workspaceId);
  const verifiedEmails = (verifiedData?.items || []).filter(e => e.verified);

  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [useReplyToDifferent, setUseReplyToDifferent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (siteId && site) {
      const s = site.settings || {};
      setFromName((s.from_name as string) || '');
      setFromEmail((s.from_email as string) || '');

      const savedReplyTo = (s.reply_to as string) || '';
      const savedFrom = (s.from_email as string) || '';
      setReplyTo(savedReplyTo);
      setUseReplyToDifferent(!!(savedReplyTo && savedReplyTo !== savedFrom));
    } else if (!siteId && workspace) {
      setFromName(workspace.settings?.from_name || '');
      setFromEmail(workspace.from_email || '');

      const savedReplyTo = workspace.settings?.reply_to || '';
      setReplyTo(savedReplyTo);
      setUseReplyToDifferent(!!(savedReplyTo && savedReplyTo !== (workspace.from_email || '')));
    }
  }, [siteId, site, workspace]);

  const effectiveReplyTo = useReplyToDifferent ? replyTo : fromEmail;

  const handleSave = async () => {
    setSaving(true);
    try {
      if (siteId) {
        const newSettings: Record<string, unknown> = {
          ...(site?.settings || {}),
          from_name: fromName,
          from_email: fromEmail,
          reply_to: effectiveReplyTo,
        };
        await updateSite.mutateAsync({ settings: newSettings });
      } else {
        await updateWorkspace.mutateAsync({
          from_email: fromEmail || undefined,
          settings: {
            ...workspace?.settings,
            from_name: fromName,
            reply_to: effectiveReplyTo,
          },
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error handled by mutation state
    }
    setSaving(false);
  };

  const noVerifiedEmails = !isLoadingEmails && verifiedEmails.length === 0;

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Sender Identity</h2>
      <p className="text-sm text-gray-500 mb-4">Configure default sender information for outbound emails</p>

      <div className="space-y-4">
        {/* From Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
          <input
            type="text"
            className="input"
            placeholder="Your Company"
            value={fromName}
            onChange={(e) => setFromName(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">The display name recipients will see</p>
        </div>

        {/* From Email — dropdown of verified emails */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
          {isLoadingEmails ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading verified emails...
            </div>
          ) : noVerifiedEmails ? (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                No verified emails. Add one in{' '}
                <a href="/settings?section=domains" className="font-medium underline">
                  Settings &gt; Email Infrastructure &gt; Verified Emails
                </a>.
              </p>
            </div>
          ) : (
            <>
              <select
                className="input"
                value={fromEmail}
                onChange={(e) => setFromEmail(e.target.value)}
              >
                <option value="">Select a verified email...</option>
                {verifiedEmails.map((e) => (
                  <option key={e.email} value={e.email}>{e.email}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Only verified emails are shown</p>
            </>
          )}
        </div>

        {/* Reply-To Toggle + Dropdown */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reply-To Email</label>

          <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useReplyToDifferent}
              onChange={(e) => setUseReplyToDifferent(e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-gray-600">Use a different reply-to address</span>
          </label>

          {!useReplyToDifferent ? (
            <p className="text-xs text-gray-500">
              Replies will go to your from address{fromEmail ? ` (${fromEmail})` : ''}
            </p>
          ) : noVerifiedEmails ? (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-sm text-amber-800">
                No verified emails available for reply-to.
              </p>
            </div>
          ) : (
            <>
              <select
                className="input"
                value={replyTo}
                onChange={(e) => setReplyTo(e.target.value)}
              >
                <option value="">Select a verified email...</option>
                {verifiedEmails.map((e) => (
                  <option key={e.email} value={e.email}>{e.email}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Only verified emails are shown</p>
            </>
          )}
        </div>

        {/* Save */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Changes
          </button>
          {saved && (
            <span className="text-sm text-green-600 flex items-center gap-1">
              <Check className="w-4 h-4" /> Saved
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
