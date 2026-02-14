import { useState, useEffect } from 'react';
import {
  Loader2, Check, AlertTriangle, Mail,
} from 'lucide-react';
import {
  useCurrentWorkspace, useUpdateWorkspace,
  useSite, useUpdateSite,
  useListDomains, useVerifySender, useCheckSender,
} from '../../lib/hooks';
import { getApiErrorMessage } from '../../lib/api';

export default function EmailIdentity({
  workspaceId,
  siteId,
  primaryDomain,
  onNavigateToDomains,
}: {
  workspaceId: string | undefined;
  siteId?: string;
  primaryDomain?: string;
  onNavigateToDomains?: () => void;
}) {
  const { workspace } = useCurrentWorkspace();
  const updateWorkspace = useUpdateWorkspace(workspaceId || '');

  // Site-scoped mode: read/write site.settings instead of workspace
  const { data: site } = useSite(siteId ? workspaceId : undefined, siteId);
  const updateSite = useUpdateSite(workspaceId || '', siteId || '');

  const [fromName, setFromName] = useState('');
  // In site mode with primaryDomain, this stores just the local part (before @)
  // Otherwise it stores the full email address
  const [fromLocal, setFromLocal] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [replyToLocal, setReplyToLocal] = useState('');
  const [useReplyToDifferent, setUseReplyToDifferent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Whether we're in split-input mode (site + primary domain selected)
  const useSplitInput = !!(siteId && primaryDomain);

  // Full from email address (computed)
  const fromEmail = useSplitInput
    ? (fromLocal ? `${fromLocal}@${primaryDomain}` : '')
    : fromLocal; // in non-split mode, fromLocal holds the full address

  // Full reply-to email address (computed)
  const replyToEmail = useReplyToDifferent
    ? (useSplitInput ? (replyToLocal ? `${replyToLocal}@${primaryDomain}` : '') : replyTo)
    : fromEmail;

  // Domain-level verification for from email
  const { data: savedDomainsData } = useListDomains(workspaceId);
  const savedDomains = savedDomainsData?.items || [];

  // Reply-to verification state
  const [replyVerificationStatus, setReplyVerificationStatus] = useState<'idle' | 'sent' | 'verified'>('idle');
  const [lastVerifiedReply, setLastVerifiedReply] = useState('');

  const verifySender = useVerifySender(workspaceId || '');
  const checkSender = useCheckSender(workspaceId || '');

  useEffect(() => {
    if (siteId && site) {
      // Site-scoped: read from site.settings
      const s = site.settings || {};
      setFromName((s.from_name as string) || '');

      const savedEmail = (s.from_email as string) || '';
      if (primaryDomain && savedEmail.endsWith(`@${primaryDomain}`)) {
        setFromLocal(savedEmail.split('@')[0] || '');
      } else if (primaryDomain && savedEmail.includes('@')) {
        setFromLocal(savedEmail.split('@')[0] || '');
      } else {
        setFromLocal(savedEmail);
      }

      const savedReplyTo = (s.reply_to as string) || '';
      setReplyTo(savedReplyTo);

      // Determine if reply-to differs from from-email
      const isDifferent = savedReplyTo && savedReplyTo !== savedEmail;
      setUseReplyToDifferent(!!isDifferent);

      if (isDifferent && primaryDomain && savedReplyTo.endsWith(`@${primaryDomain}`)) {
        setReplyToLocal(savedReplyTo.split('@')[0] || '');
      } else if (isDifferent && primaryDomain && savedReplyTo.includes('@')) {
        setReplyToLocal(savedReplyTo.split('@')[0] || '');
      } else if (isDifferent) {
        setReplyToLocal(savedReplyTo);
        setReplyTo(savedReplyTo);
      }

      if (savedReplyTo) {
        setLastVerifiedReply(savedReplyTo);
        setReplyVerificationStatus('verified');
      }
    } else if (!siteId && workspace) {
      // Workspace-level fallback (Settings page)
      setFromName(workspace.settings?.from_name || '');
      setFromLocal(workspace.from_email || '');

      const savedReplyTo = workspace.settings?.reply_to || '';
      setReplyTo(savedReplyTo);

      const isDifferent = savedReplyTo && savedReplyTo !== (workspace.from_email || '');
      setUseReplyToDifferent(!!isDifferent);

      if (savedReplyTo) {
        setLastVerifiedReply(savedReplyTo);
        setReplyVerificationStatus('verified');
      }
    }
  }, [siteId, site, workspace, primaryDomain]);

  // Check if the from email's domain is verified
  const fromEmailDomain = fromEmail.includes('@') ? fromEmail.split('@')[1]?.toLowerCase() : '';
  const fromDomainVerified = fromEmailDomain
    ? savedDomains.some(d => d.domain === fromEmailDomain && d.ready)
    : false;

  // Check if reply-to needs separate verification
  // If reply-to uses the same domain as from-email (which is verified for sending), no extra verification needed
  const replyToEmailDomain = replyToEmail.includes('@') ? replyToEmail.split('@')[1]?.toLowerCase() : '';
  const replyToNeedsVerification = useReplyToDifferent && replyToEmailDomain && replyToEmailDomain !== fromEmailDomain;

  // Reset reply verification state when reply-to changes
  useEffect(() => {
    if (!useReplyToDifferent) return;
    if (replyToEmail && replyToEmail !== lastVerifiedReply) {
      setReplyVerificationStatus('idle');
    } else if (replyToEmail && replyToEmail === lastVerifiedReply) {
      setReplyVerificationStatus('verified');
    }
  }, [replyToEmail, lastVerifiedReply, useReplyToDifferent]);

  const handleVerifyReplyTo = async () => {
    if (!replyToEmail || !replyToEmail.includes('@')) return;
    try {
      await verifySender.mutateAsync({ email: replyToEmail });
      setReplyVerificationStatus('sent');
    } catch {
      // Error handled by mutation state
    }
  };

  const handleCheckReplyVerification = async () => {
    if (!replyToEmail) return;
    try {
      const result = await checkSender.mutateAsync({ email: replyToEmail });
      if (result.verified) {
        setReplyVerificationStatus('verified');
        setLastVerifiedReply(replyToEmail);
      }
    } catch {
      // Error handled by mutation state
    }
  };

  // From email can be saved if domain is verified or email is unchanged
  const currentFromEmail = siteId
    ? ((site?.settings?.from_email as string) || '')
    : (workspace?.from_email || '');
  const fromEmailChanged = fromEmail !== currentFromEmail;
  // In split-input mode the domain is always the verified primary, so always saveable
  const canSaveFromEmail = useSplitInput || !fromEmailChanged || fromDomainVerified;

  const handleSave = async () => {
    setSaving(true);
    try {
      const effectiveReplyTo = useReplyToDifferent ? replyToEmail : fromEmail;

      if (siteId) {
        // Site-scoped: save to site.settings
        const newSettings: Record<string, unknown> = {
          ...(site?.settings || {}),
          from_name: fromName,
          reply_to: effectiveReplyTo,
        };
        if (canSaveFromEmail && fromEmail) {
          newSettings.from_email = fromEmail;
        }
        await updateSite.mutateAsync({ settings: newSettings });
      } else {
        // Workspace-level fallback
        const payload: Record<string, unknown> = {
          settings: { ...workspace?.settings, from_name: fromName, reply_to: effectiveReplyTo },
        };
        if (canSaveFromEmail && fromEmail) {
          payload.from_email = fromEmail;
        }
        await updateWorkspace.mutateAsync(payload);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // Error handled by mutation state
    }
    setSaving(false);
  };

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

        {/* From Email */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
          {useSplitInput ? (
            /* Site mode with primary domain: local-part + @domain */
            <>
              <div className="flex items-center gap-0">
                <input
                  type="text"
                  className="input rounded-r-none border-r-0 flex-1"
                  placeholder="hello"
                  value={fromLocal}
                  onChange={(e) => setFromLocal(e.target.value.replace(/@/g, ''))}
                />
                <span className="inline-flex items-center px-3 py-2 border border-gray-300 bg-gray-50 text-sm text-gray-500 rounded-r-lg shrink-0">
                  @{primaryDomain}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Sending from your primary domain <strong>{primaryDomain}</strong>
              </p>
            </>
          ) : (
            /* Workspace mode or site without primary domain: full email input */
            <>
              <div className="flex gap-2">
                <input
                  type="email"
                  className="input flex-1"
                  placeholder="hello@yourcompany.com"
                  value={fromLocal}
                  onChange={(e) => setFromLocal(e.target.value)}
                />
                {fromEmail && fromEmailDomain && fromDomainVerified && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg shrink-0">
                    <Check className="w-4 h-4" />
                    Verified
                  </span>
                )}
              </div>

              {/* Domain not verified warning */}
              {fromEmail && fromEmailDomain && !fromDomainVerified && (
                <div className="mt-2 flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p>
                      Domain <strong>{fromEmailDomain}</strong> is not verified.{' '}
                      {onNavigateToDomains ? (
                        <button onClick={onNavigateToDomains} className="font-medium underline">
                          Verify your domain in the Domains tab
                        </button>
                      ) : (
                        <span>Verify your domain in the Domains tab</span>
                      )}{' '}
                      first.
                    </p>
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500 mt-1">
                {siteId && !primaryDomain
                  ? 'Select a primary domain above first'
                  : 'Must be on a domain verified in the Domains tab'}
              </p>
            </>
          )}
        </div>

        {/* Reply-To Toggle + Input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">Reply-To Email</label>
          </div>

          {/* Toggle */}
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
          ) : (
            <>
              {useSplitInput ? (
                /* Split input: local-part + @primaryDomain */
                <>
                  <div className="flex items-center gap-0">
                    <input
                      type="text"
                      className="input rounded-r-none border-r-0 flex-1"
                      placeholder="support"
                      value={replyToLocal}
                      onChange={(e) => setReplyToLocal(e.target.value.replace(/@/g, ''))}
                    />
                    <span className="inline-flex items-center px-3 py-2 border border-gray-300 bg-gray-50 text-sm text-gray-500 rounded-r-lg shrink-0">
                      @{primaryDomain}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Uses your primary domain — no extra verification needed
                  </p>
                </>
              ) : (
                /* Full email input */
                <>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      className="input flex-1"
                      placeholder="support@yourcompany.com"
                      value={replyTo}
                      onChange={(e) => setReplyTo(e.target.value)}
                    />
                    {replyToNeedsVerification && replyToEmail && replyToEmail.includes('@') && replyVerificationStatus === 'idle' && (
                      <button
                        onClick={handleVerifyReplyTo}
                        disabled={verifySender.isPending}
                        className="btn btn-secondary inline-flex items-center gap-1.5 shrink-0"
                      >
                        {verifySender.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                        Verify Address
                      </button>
                    )}
                    {replyVerificationStatus === 'verified' && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg shrink-0">
                        <Check className="w-4 h-4" />
                        Verified
                      </span>
                    )}
                  </div>

                  {/* Reply-to verification sent — instructions */}
                  {replyVerificationStatus === 'sent' && (
                    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-700 mb-2">
                        Verification email sent to <strong>{replyToEmail}</strong>. Check your inbox for an email from AWS and click the verification link, then click below.
                      </p>
                      <button
                        onClick={handleCheckReplyVerification}
                        disabled={checkSender.isPending}
                        className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                      >
                        {checkSender.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Check Verification
                      </button>
                      {checkSender.isSuccess && !checkSender.data?.verified && (
                        <p className="text-xs text-amber-600 mt-2">
                          Not verified yet. Click the link in the email from AWS, then try again.
                        </p>
                      )}
                      {checkSender.isError && (
                        <p className="text-xs text-red-600 mt-2">
                          {getApiErrorMessage(checkSender.error, 'Failed to check verification status')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Verify error */}
                  {verifySender.isError && replyVerificationStatus === 'idle' && (
                    <p className="text-xs text-red-600 mt-1">
                      {getApiErrorMessage(verifySender.error, 'Failed to send verification email')}
                    </p>
                  )}

                  <p className="text-xs text-gray-500 mt-1">
                    {replyToNeedsVerification
                      ? 'Different domain than your from address — SES will send a verification link'
                      : 'Same domain as your from address — no extra verification needed'}
                  </p>
                </>
              )}
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
