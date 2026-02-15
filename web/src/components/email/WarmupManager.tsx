import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, Check, AlertCircle, Globe, Plus, ChevronRight, ChevronDown, Mail, Send,
  Pause, Play, Trash2, AlertTriangle, TrendingUp, X, Eye, RefreshCw, SlidersHorizontal, Shield,
  BookOpen, Users, Search, Clock, Sparkles,
} from 'lucide-react';
import {
  useCurrentWorkspace, useWarmups, useStartWarmup, usePauseWarmup, useResumeWarmup,
  useCancelWarmup, getWarmupStatusInfo, useUpdateSeedList, useSendWarmupTestEmail,
  useUpdateWarmupSettings, useWarmupLog, useDomainHealth, getHealthStatusInfo,
  useListDomains, usePreviewEmail, usePreviewSetupEmail, useSite,
} from '../../lib/hooks';
import type { WarmupDomain } from '../../lib/hooks/useEmailWarmup';
import { getApiErrorMessage } from '../../lib/api';
import { useContacts } from '../../lib/hooks/useContacts';

// Email provider detection for seed list coverage indicator
const EMAIL_PROVIDERS: { name: string; domains: string[]; color: string }[] = [
  { name: 'Gmail', domains: ['gmail.com', 'googlemail.com'], color: 'bg-red-100 text-red-700' },
  { name: 'Outlook', domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'], color: 'bg-blue-100 text-blue-700' },
  { name: 'Yahoo', domains: ['yahoo.com', 'ymail.com', 'yahoo.co.uk'], color: 'bg-violet-100 text-violet-700' },
  { name: 'iCloud', domains: ['icloud.com', 'me.com', 'mac.com'], color: 'bg-gray-100 text-gray-700' },
];

function getProviderCoverage(emails: string[]): { name: string; color: string; count: number }[] {
  const coverage: { name: string; color: string; count: number }[] = [];
  for (const provider of EMAIL_PROVIDERS) {
    const count = emails.filter(e => provider.domains.some(d => e.endsWith('@' + d))).length;
    if (count > 0) coverage.push({ name: provider.name, color: provider.color, count });
  }
  const knownCount = coverage.reduce((sum, p) => sum + p.count, 0);
  const otherCount = emails.length - knownCount;
  if (otherCount > 0) coverage.push({ name: 'Other', color: 'bg-gray-100 text-gray-600', count: otherCount });
  return coverage;
}

function parseBulkEmails(input: string, existing: string[]): string[] {
  const raw = input.split(/[\s,;\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
  const valid: string[] = [];
  const existingSet = new Set(existing);
  for (const email of raw) {
    if (email.includes('@') && email.includes('.') && !existingSet.has(email) && !valid.includes(email)) {
      valid.push(email);
    }
  }
  return valid;
}

// Timezone conversion helpers — backend stores UTC hours, UI shows local
function getTimezoneOffsetHours(timezone: string): number {
  const now = new Date();
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
  const tzStr = now.toLocaleString('en-US', { timeZone: timezone });
  return (new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 3600000;
}

function utcToLocal(utcHour: number, offsetHours: number): number {
  return ((utcHour + offsetHours) % 24 + 24) % 24;
}

function localToUtc(localHour: number, offsetHours: number): number {
  return ((localHour - offsetHours) % 24 + 24) % 24;
}

function buildHourOptions(timezone: string): { value: number; label: string }[] {
  const shortTz = timezone.split('/').pop()?.replace(/_/g, ' ') || timezone;
  return Array.from({ length: 24 }, (_, i) => ({
    value: i,
    label: `${i.toString().padStart(2, '0')}:00 ${shortTz}`,
  }));
}

function generatePreviewSchedule(target: number, days: number, start: number): number[] {
  if (target <= start) return Array(days).fill(target);
  const ratio = (target / start) ** (1.0 / (days - 1));
  const schedule: number[] = [];
  for (let d = 0; d < days; d++) {
    schedule.push(Math.min(Math.round(start * ratio ** d), target));
  }
  schedule[days - 1] = target;
  return schedule;
}

function SchedulePreview({ targetVolume, days, startVolume }: { targetVolume: number; days: number; startVolume: number }) {
  const schedule = generatePreviewSchedule(targetVolume, days, startVolume);
  // Show weekly milestones
  const weeks = Math.ceil(days / 7);
  const milestones: { week: number; day: number; volume: number }[] = [];
  milestones.push({ week: 0, day: 1, volume: schedule[0] });
  for (let w = 1; w <= weeks; w++) {
    const dayIdx = Math.min(w * 7 - 1, days - 1);
    milestones.push({ week: w, day: dayIdx + 1, volume: schedule[dayIdx] });
  }
  // Ensure the final day is included
  if (milestones[milestones.length - 1].day !== days) {
    milestones.push({ week: weeks, day: days, volume: schedule[days - 1] });
  }

  return (
    <div className="mt-2 p-3 bg-white border border-gray-200 rounded-lg">
      <p className="text-xs font-medium text-gray-600 mb-2">Schedule Preview</p>
      <div className="flex items-end gap-0.5 h-12">
        {schedule.map((vol, i) => (
          <div
            key={i}
            className="bg-primary-400 rounded-t-sm min-w-[2px] flex-1"
            style={{ height: `${Math.max(4, (vol / targetVolume) * 100)}%` }}
            title={`Day ${i + 1}: ${vol}/day`}
          />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-gray-400 mt-1">
        {milestones.filter((_, i) => i === 0 || i === milestones.length - 1 || milestones.length <= 5 || i % Math.ceil(milestones.length / 4) === 0).map((m) => (
          <span key={m.day}>Day {m.day}: {m.volume}/d</span>
        ))}
      </div>
    </div>
  );
}

function ContactImportPicker({
  workspaceId,
  existingEmails,
  maxEmails,
  onImport,
  onClose,
}: {
  workspaceId: string;
  existingEmails: string[];
  maxEmails: number;
  onImport: (emails: string[]) => void;
  onClose: () => void;
}) {
  const { data, isLoading } = useContacts(workspaceId, { limit: 100 });
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const existingSet = new Set(existingEmails.map(e => e.toLowerCase()));
  const contacts = (data?.contacts || []).filter(c => c.email && !existingSet.has(c.email.toLowerCase()));
  const filtered = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.email?.toLowerCase().includes(q) ||
      c.first_name?.toLowerCase().includes(q) ||
      c.last_name?.toLowerCase().includes(q)
    );
  });

  const remaining = maxEmails - existingEmails.length;
  const allFilteredSelected = filtered.length > 0 && filtered.every(c => selected.has(c.email!));

  const toggleAll = () => {
    if (allFilteredSelected) {
      const filteredEmails = new Set(filtered.map(c => c.email!));
      setSelected(new Set([...selected].filter(e => !filteredEmails.has(e))));
    } else {
      const next = new Set(selected);
      for (const c of filtered) {
        if (next.size < remaining) next.add(c.email!);
      }
      setSelected(next);
    }
  };

  const toggle = (email: string) => {
    const next = new Set(selected);
    if (next.has(email)) {
      next.delete(email);
    } else if (next.size < remaining) {
      next.add(email);
    }
    setSelected(next);
  };

  return (
    <div className="mt-2 border border-gray-200 rounded-lg bg-white shadow-sm">
      <div className="p-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700">Import from Contacts</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            className="input text-sm pl-8"
            placeholder="Search contacts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
          <span className="text-sm text-gray-500 ml-2">Loading contacts...</span>
        </div>
      ) : contacts.length === 0 ? (
        <div className="p-4 text-center text-sm text-gray-500">
          No contacts with email addresses found, or all are already in the seed list.
        </div>
      ) : (
        <>
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleAll}
                className="rounded border-gray-300"
              />
              Select all{search ? ' (filtered)' : ''}
            </label>
            <span className="text-xs text-gray-400">
              {selected.size} selected ({Math.max(remaining - selected.size, 0)} remaining capacity)
            </span>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.email!)}
                  onChange={() => toggle(c.email!)}
                  disabled={!selected.has(c.email!) && selected.size >= remaining}
                  className="rounded border-gray-300"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 truncate">{c.email}</p>
                  {(c.first_name || c.last_name) && (
                    <p className="text-xs text-gray-500 truncate">
                      {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                    </p>
                  )}
                </div>
              </label>
            ))}
            {filtered.length === 0 && search && (
              <p className="p-3 text-xs text-gray-500 text-center">No contacts match "{search}"</p>
            )}
          </div>
        </>
      )}

      <div className="p-3 border-t border-gray-100 flex items-center justify-end gap-2">
        <button onClick={onClose} className="btn btn-secondary btn-sm">Cancel</button>
        <button
          onClick={() => {
            onImport([...selected]);
            onClose();
          }}
          disabled={selected.size === 0}
          className="btn btn-primary btn-sm inline-flex items-center gap-1"
        >
          <Users className="w-3.5 h-3.5" />
          Import {selected.size > 0 ? `(${selected.size})` : ''}
        </button>
      </div>
    </div>
  );
}

export default function WarmupManager({
  workspaceId,
  siteId,
  onNavigateToDomains,
}: {
  workspaceId: string | undefined;
  siteId?: string;
  onNavigateToDomains?: () => void;
}) {
  const { workspace } = useCurrentWorkspace();
  const timezone = workspace?.settings?.timezone || 'America/New_York';
  const tzOffset = getTimezoneOffsetHours(timezone);
  const hourOptions = buildHourOptions(timezone);

  const { data: warmupsData, isLoading } = useWarmups(workspaceId, siteId);
  const startWarmup = useStartWarmup(workspaceId || '');
  const pauseWarmup = usePauseWarmup(workspaceId || '');
  const resumeWarmup = useResumeWarmup(workspaceId || '');
  const cancelWarmup = useCancelWarmup(workspaceId || '');

  const { data: savedDomainsData } = useListDomains(workspaceId);
  const { data: siteData } = useSite(workspaceId, siteId);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [sendWindowStart, setSendWindowStart] = useState(9);
  const [sendWindowEnd, setSendWindowEnd] = useState(19);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [initSeedInput, setInitSeedInput] = useState('');
  const [initSeedList, setInitSeedList] = useState<string[]>([]);
  const [initAutoWarmup, setInitAutoWarmup] = useState(false);
  const [showInitContactPicker, setShowInitContactPicker] = useState(false);
  const [startedSuccess, setStartedSuccess] = useState(false);
  const [initMaxBounce, setInitMaxBounce] = useState(5.0);
  const [initMaxComplaint, setInitMaxComplaint] = useState(0.1);
  const [initTargetVolume, setInitTargetVolume] = useState(500);
  const [initWarmupDays, setInitWarmupDays] = useState(42);
  const [initStartVolume, setInitStartVolume] = useState(10);
  const [initTones, setInitTones] = useState<string[]>([]);
  const [initContentTypes, setInitContentTypes] = useState<string[]>([]);
  const [initEmailLength, setInitEmailLength] = useState('medium');
  const [setupPreview, setSetupPreview] = useState<{ subject: string; body_html: string; content_type: string } | null>(null);
  const previewSetupEmail = usePreviewSetupEmail(workspaceId || '');

  const warmups = warmupsData?.items || [];

  // Only show verified domains that aren't already warming up
  // When scoped to a site, further filter to only that site's domain
  const warmupDomainSet = new Set(warmups.map(w => w.domain));
  const verifiedDomains = (savedDomainsData?.items || []).filter(
    d => d.ready && !warmupDomainSet.has(d.domain)
  );

  // Auto-select: prefer site's primary domain, then fall back to single-domain auto-select
  const sitePrimaryDomain = (siteData?.settings?.primary_domain as string) || '';
  useEffect(() => {
    if (newDomain) return;
    if (sitePrimaryDomain && verifiedDomains.some(d => d.domain === sitePrimaryDomain)) {
      setNewDomain(sitePrimaryDomain);
    } else if (verifiedDomains.length === 1) {
      setNewDomain(verifiedDomains[0].domain);
    }
  }, [verifiedDomains.length, sitePrimaryDomain]);

  // Pull from/reply-to from site settings (set in Sender Identity above)
  const siteFromName = (siteData?.settings?.from_name as string) || '';
  const siteReplyTo = (siteData?.settings?.reply_to as string) || '';

  const handleStartWarmup = async () => {
    if (!newDomain.trim()) return;
    try {
      await startWarmup.mutateAsync({
        domain: newDomain.trim().toLowerCase(),
        send_window_start: localToUtc(sendWindowStart, tzOffset),
        send_window_end: localToUtc(sendWindowEnd, tzOffset),
        seed_list: initSeedList.length > 0 ? initSeedList : undefined,
        auto_warmup_enabled: initAutoWarmup,
        from_name: siteFromName || undefined,
        max_bounce_rate: initMaxBounce,
        max_complaint_rate: initMaxComplaint,
        reply_to: siteReplyTo || undefined,
        target_daily_volume: initTargetVolume,
        warmup_days: initWarmupDays,
        start_volume: initStartVolume,
        site_id: siteId || undefined,
        preferred_tones: initTones.length > 0 ? initTones.map(t => t.toLowerCase()) : undefined,
        preferred_content_types: initContentTypes.length > 0 ? initContentTypes.map(ct => CONTENT_TYPE_KEY_MAP[ct] || ct.toLowerCase()) : undefined,
        email_length: initEmailLength,
      });
      setNewDomain('');
      setInitSeedList([]);
      setInitAutoWarmup(false);
      setInitMaxBounce(5.0);
      setInitMaxComplaint(0.1);
      setInitTargetVolume(500);
      setInitWarmupDays(42);
      setInitStartVolume(10);
      setInitTones([]);
      setInitContentTypes([]);
      setInitEmailLength('medium');
      setSetupPreview(null);
      setShowAddForm(false);
      setStartedSuccess(true);
      setTimeout(() => setStartedSuccess(false), 3000);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleCancel = async (domain: string) => {
    try {
      await cancelWarmup.mutateAsync(domain);
      setConfirmCancel(null);
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-900">Domain Warm-up</h2>
          <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full font-medium">Pro</span>
        </div>
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="btn btn-primary btn-sm inline-flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Start Warm-up
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Build sending reputation by gradually ramping up email volume on new domains.{' '}
        {onNavigateToDomains ? (
          <button onClick={onNavigateToDomains} className="text-primary-600 hover:text-primary-700">
            Set up sending domains
          </button>
        ) : (
          <span>Set up sending domains</span>
        )}{' '}
        first if you haven't already.
      </p>

      {/* Add domain form */}
      {showAddForm && (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
          {verifiedDomains.length > 0 ? (
            <select
              className="input"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
            >
              <option value="">Select a verified domain...</option>
              {verifiedDomains.map((d) => (
                <option key={d.domain} value={d.domain}>{d.domain}</option>
              ))}
            </select>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                No verified domains available.{' '}
                {onNavigateToDomains ? (
                  <button onClick={onNavigateToDomains} className="font-medium underline">Set up a sending domain</button>
                ) : (
                  <span className="font-medium">Set up a sending domain</span>
                )}{' '}
                in the Domains tab first.
              </p>
            </div>
          )}

          {/* Send window */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Send window start</label>
              <select
                className="input text-sm"
                value={sendWindowStart}
                onChange={(e) => setSendWindowStart(Number(e.target.value))}
              >
                {hourOptions.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Send window end</label>
              <select
                className="input text-sm"
                value={sendWindowEnd}
                onChange={(e) => setSendWindowEnd(Number(e.target.value))}
              >
                {hourOptions.map((h) => (
                  <option key={h.value} value={h.value}>{h.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Ramp-up settings */}
          <div className="mt-3 grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Target Daily Volume</label>
              <select
                className="input text-sm"
                value={initTargetVolume}
                onChange={(e) => setInitTargetVolume(Number(e.target.value))}
              >
                <option value={50}>50/day</option>
                <option value={100}>100/day</option>
                <option value={250}>250/day</option>
                <option value={500}>500/day</option>
                <option value={1000}>1,000/day</option>
                <option value={5000}>5,000/day</option>
                <option value={10000}>10,000/day</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Ramp-up Duration</label>
              <select
                className="input text-sm"
                value={initWarmupDays}
                onChange={(e) => setInitWarmupDays(Number(e.target.value))}
              >
                <option value={7}>1 week</option>
                <option value={14}>2 weeks</option>
                <option value={21}>3 weeks</option>
                <option value={28}>4 weeks</option>
                <option value={42}>6 weeks</option>
                <option value={60}>~2 months</option>
                <option value={90}>3 months</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Volume</label>
              <select
                className="input text-sm"
                value={initStartVolume}
                onChange={(e) => setInitStartVolume(Number(e.target.value))}
              >
                <option value={5}>5/day</option>
                <option value={10}>10/day</option>
                <option value={25}>25/day</option>
                <option value={50}>50/day</option>
                <option value={100}>100/day</option>
              </select>
            </div>
          </div>
          {/* Schedule preview */}
          <SchedulePreview targetVolume={initTargetVolume} days={initWarmupDays} startVolume={initStartVolume} />

          {/* Email tone & style */}
          {newDomain && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-3">
                <BookOpen className="w-4 h-4 text-violet-600" />
                <label className="text-xs font-medium text-gray-700">Email Tone & Style</label>
              </div>

              <div className="mb-3">
                <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Tone</label>
                <div className="flex flex-wrap gap-1.5">
                  {TONE_OPTIONS.map(tone => (
                    <button
                      key={tone}
                      onClick={() => setInitTones(prev => prev.includes(tone) ? prev.filter(t => t !== tone) : [...prev, tone])}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        initTones.includes(tone)
                          ? 'bg-violet-100 border-violet-300 text-violet-700 font-medium'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {tone}
                    </button>
                  ))}
                </div>
                {initTones.length === 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">No preference — AI will vary randomly</p>
                )}
              </div>

              <div className="mb-3">
                <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Content Types</label>
                <div className="flex flex-wrap gap-1.5">
                  {CONTENT_TYPE_OPTIONS.map(ct => (
                    <button
                      key={ct}
                      onClick={() => setInitContentTypes(prev => prev.includes(ct) ? prev.filter(c => c !== ct) : [...prev, ct])}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        initContentTypes.includes(ct)
                          ? 'bg-blue-100 border-blue-300 text-blue-700 font-medium'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {ct}
                    </button>
                  ))}
                </div>
                {initContentTypes.length === 0 && (
                  <p className="text-[11px] text-gray-400 mt-1">No preference — AI will vary randomly</p>
                )}
              </div>

              <div className="mb-3">
                <label className="block text-[11px] font-medium text-gray-500 mb-1.5">Email Length</label>
                <div className="flex gap-2">
                  {(['short', 'medium', 'long'] as const).map(len => (
                    <button
                      key={len}
                      onClick={() => setInitEmailLength(len)}
                      className={`text-xs px-4 py-1.5 rounded-md border transition-colors ${
                        initEmailLength === len
                          ? 'bg-gray-800 border-gray-800 text-white font-medium'
                          : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {len.charAt(0).toUpperCase() + len.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Preview button */}
              <button
                onClick={async () => {
                  try {
                    const toneKeys = initTones.map(t => t.toLowerCase());
                    const ctKeys = initContentTypes.map(ct => CONTENT_TYPE_KEY_MAP[ct] || ct.toLowerCase());
                    const result = await previewSetupEmail.mutateAsync({
                      domain: newDomain,
                      site_id: siteId,
                      preferred_tones: toneKeys.length > 0 ? toneKeys : undefined,
                      preferred_content_types: ctKeys.length > 0 ? ctKeys : undefined,
                      email_length: initEmailLength,
                    });
                    setSetupPreview(result);
                  } catch {
                    // Error handled by mutation state
                  }
                }}
                disabled={previewSetupEmail.isPending}
                className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
              >
                {previewSetupEmail.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Preview Email
              </button>

              {/* Preview card */}
              {setupPreview && (
                <div className="mt-3 border border-gray-200 rounded-lg bg-white overflow-hidden">
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="text-sm font-medium text-gray-800 truncate">{setupPreview.subject}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                        {CONTENT_TYPE_LABEL_MAP[setupPreview.content_type] || setupPreview.content_type}
                      </span>
                      <button
                        onClick={async () => {
                          try {
                            const toneKeys = initTones.map(t => t.toLowerCase());
                            const ctKeys = initContentTypes.map(ct => CONTENT_TYPE_KEY_MAP[ct] || ct.toLowerCase());
                            const result = await previewSetupEmail.mutateAsync({
                              domain: newDomain,
                              site_id: siteId,
                              preferred_tones: toneKeys.length > 0 ? toneKeys : undefined,
                              preferred_content_types: ctKeys.length > 0 ? ctKeys : undefined,
                              email_length: initEmailLength,
                            });
                            setSetupPreview(result);
                          } catch { /* */ }
                        }}
                        disabled={previewSetupEmail.isPending}
                        className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
                      >
                        <RefreshCw className={`w-3 h-3 ${previewSetupEmail.isPending ? 'animate-spin' : ''}`} />
                        Regenerate
                      </button>
                    </div>
                  </div>
                  <div
                    className="p-3 max-h-64 overflow-y-auto text-sm text-gray-700 prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: setupPreview.body_html }}
                  />
                </div>
              )}

              {previewSetupEmail.isError && (
                <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Failed to generate preview
                </p>
              )}
            </div>
          )}

          {/* Thresholds */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max bounce rate (%)</label>
              <input
                type="number"
                className="input text-sm"
                step="0.1"
                min="0.1"
                max="50"
                value={initMaxBounce}
                onChange={(e) => setInitMaxBounce(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Max complaint rate (%)</label>
              <input
                type="number"
                className="input text-sm"
                step="0.01"
                min="0.01"
                max="5"
                value={initMaxComplaint}
                onChange={(e) => setInitMaxComplaint(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Optional seed list */}
          <div className="mt-3 pt-3 border-t border-gray-200">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-600">Seed List (optional)</label>
              {initSeedList.length > 0 && (
                <span className="text-xs text-gray-400">{initSeedList.length}/50</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-2">
              Add email addresses you own across different providers (Gmail, Outlook, Yahoo). Open and reply to warmup emails to build positive engagement signals.
            </p>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                className="input flex-1 text-sm"
                placeholder="team@gmail.com, founder@outlook.com, hello@yahoo.com"
                value={initSeedInput}
                onChange={(e) => setInitSeedInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const newEmails = parseBulkEmails(initSeedInput, initSeedList);
                    if (newEmails.length > 0) {
                      setInitSeedList([...initSeedList, ...newEmails].slice(0, 50));
                      setInitSeedInput('');
                    }
                  }
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData('text');
                  if (pasted.includes(',') || pasted.includes('\n') || pasted.includes(' ')) {
                    e.preventDefault();
                    const newEmails = parseBulkEmails(pasted, initSeedList);
                    if (newEmails.length > 0) {
                      setInitSeedList([...initSeedList, ...newEmails].slice(0, 50));
                      setInitSeedInput('');
                    }
                  }
                }}
              />
              <button
                onClick={() => {
                  const newEmails = parseBulkEmails(initSeedInput, initSeedList);
                  if (newEmails.length > 0) {
                    setInitSeedList([...initSeedList, ...newEmails].slice(0, 50));
                    setInitSeedInput('');
                  }
                }}
                disabled={!initSeedInput.trim() || initSeedList.length >= 50}
                className="btn btn-secondary btn-sm"
              >
                Add
              </button>
              <button
                onClick={() => setShowInitContactPicker(!showInitContactPicker)}
                disabled={initSeedList.length >= 50}
                className="btn btn-secondary btn-sm inline-flex items-center gap-1"
              >
                <Users className="w-3.5 h-3.5" />
                Import from Contacts
              </button>
            </div>
            {showInitContactPicker && workspaceId && (
              <ContactImportPicker
                workspaceId={workspaceId}
                existingEmails={initSeedList}
                maxEmails={50}
                onImport={(emails) => setInitSeedList([...initSeedList, ...emails].slice(0, 50))}
                onClose={() => setShowInitContactPicker(false)}
              />
            )}
            {initSeedList.length > 0 && (
              <>
                {/* Provider coverage */}
                <div className="flex items-center gap-1.5 mb-2">
                  {getProviderCoverage(initSeedList).map((p) => (
                    <span key={p.name} className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.color}`}>
                      {p.name} ({p.count})
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {initSeedList.map((email) => (
                    <span key={email} className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-full px-2.5 py-1">
                      {email}
                      <button onClick={() => setInitSeedList(initSeedList.filter(e => e !== email))} className="text-gray-400 hover:text-red-500">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={initAutoWarmup}
                      onChange={(e) => setInitAutoWarmup(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    Enable auto-warmup (AI generates and sends emails on schedule)
                  </label>
                  <button
                    onClick={() => setInitSeedList([])}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    Clear all
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleStartWarmup}
              disabled={!newDomain.trim() || startWarmup.isPending}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              {startWarmup.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Start Warm-up
            </button>
            <button
              onClick={() => { setShowAddForm(false); setNewDomain(''); setInitSeedList([]); setInitAutoWarmup(false); setInitMaxBounce(5.0); setInitMaxComplaint(0.1); setInitTargetVolume(500); setInitWarmupDays(42); setInitStartVolume(10); setInitTones([]); setInitContentTypes([]); setInitEmailLength('medium'); setSetupPreview(null); }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
          {startWarmup.isError && (
            <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {getApiErrorMessage(startWarmup.error, 'Failed to start warm-up')}
            </p>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Emails from this domain will be gradually ramped up over 6 weeks. Default schedule starts at 10/day, customizable in Settings.
          </p>
        </div>
      )}

      {/* Success banner */}
      {startedSuccess && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg mb-4 text-sm">
          <Check className="w-4 h-4 text-green-600" />
          <span className="text-green-700 font-medium">Warm-up started successfully!</span>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-8 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading warm-up domains...
        </div>
      )}

      {/* Empty state */}
      {!isLoading && warmups.length === 0 && !showAddForm && (
        <div className="p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-center">
          <TrendingUp className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="font-medium text-gray-700">No domains warming up</p>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
            Domain warm-up gradually increases your sending volume over 6 weeks, building a positive
            reputation with email providers so your messages land in the inbox instead of spam.
          </p>
        </div>
      )}

      {/* Warmup list */}
      {warmups.length > 0 && (
        <div className="space-y-3">
          {warmups.map((warmup) => (
            <WarmupDomainCard
              key={warmup.domain}
              warmup={warmup}
              workspaceId={workspaceId || ''}
              onPause={(d) => pauseWarmup.mutate(d)}
              onResume={(d) => resumeWarmup.mutate(d)}
              onCancel={(d) => confirmCancel === d ? handleCancel(d) : setConfirmCancel(d)}
              confirmingCancel={confirmCancel === warmup.domain}
              isPausing={pauseWarmup.isPending}
              isResuming={resumeWarmup.isPending}
              isCancelling={cancelWarmup.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const TONE_OPTIONS = ['Professional', 'Friendly', 'Enthusiastic', 'Thoughtful', 'Casual'];
const CONTENT_TYPE_OPTIONS = [
  'Newsletter', 'Product Update', 'Team News', 'Industry Insights',
  'Tips & How-to', 'Milestones', 'Event Invite', 'Weekly Digest',
];
// Map display labels to backend keys
const CONTENT_TYPE_KEY_MAP: Record<string, string> = {
  'Newsletter': 'newsletter',
  'Product Update': 'product_update',
  'Team News': 'team_announcement',
  'Industry Insights': 'industry_insight',
  'Tips & How-to': 'customer_tip',
  'Milestones': 'company_milestone',
  'Event Invite': 'event_invitation',
  'Weekly Digest': 'weekly_digest',
};
const CONTENT_TYPE_LABEL_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(CONTENT_TYPE_KEY_MAP).map(([label, key]) => [key, label])
);

function ContentStylePanel({
  warmup,
  workspaceId,
}: {
  warmup: WarmupDomain;
  workspaceId: string;
}) {
  const updateSettings = useUpdateWarmupSettings(workspaceId);
  const previewEmail = usePreviewEmail(workspaceId);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Convert stored keys to display labels for initial state
  const [selectedTones, setSelectedTones] = useState<string[]>(
    (warmup.preferred_tones || []).map(t => t.charAt(0).toUpperCase() + t.slice(1))
  );
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>(
    (warmup.preferred_content_types || []).map(k => CONTENT_TYPE_LABEL_MAP[k] || k)
  );
  const [emailLength, setEmailLength] = useState(warmup.email_length || 'medium');
  const [preview, setPreview] = useState<{
    subject: string;
    body_html: string;
    content_type: string;
  } | null>(null);

  const toggleTone = (tone: string) => {
    setSelectedTones(prev =>
      prev.includes(tone) ? prev.filter(t => t !== tone) : [...prev, tone]
    );
  };

  const toggleContentType = (ct: string) => {
    setSelectedContentTypes(prev =>
      prev.includes(ct) ? prev.filter(c => c !== ct) : [...prev, ct]
    );
  };

  const toneKeys = selectedTones.map(t => t.toLowerCase());
  const contentTypeKeys = selectedContentTypes.map(ct => CONTENT_TYPE_KEY_MAP[ct] || ct.toLowerCase());

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        domain: warmup.domain,
        preferred_tones: toneKeys,
        preferred_content_types: contentTypeKeys,
        email_length: emailLength,
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch {
      // Error handled by mutation state
    }
  };

  const handlePreview = async () => {
    try {
      const result = await previewEmail.mutateAsync({
        domain: warmup.domain,
        preferred_tones: toneKeys.length > 0 ? toneKeys : undefined,
        preferred_content_types: contentTypeKeys.length > 0 ? contentTypeKeys : undefined,
        email_length: emailLength,
      });
      setPreview(result);
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="flex items-center gap-3 mb-3">
        <BookOpen className="w-5 h-5 text-violet-600" />
        <h4 className="text-sm font-medium text-gray-700">Email Tone & Style</h4>
      </div>

      {/* Tone multi-select */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-2">Tone</label>
        <div className="flex flex-wrap gap-1.5">
          {TONE_OPTIONS.map(tone => (
            <button
              key={tone}
              onClick={() => toggleTone(tone)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                selectedTones.includes(tone)
                  ? 'bg-violet-100 border-violet-300 text-violet-700 font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {tone}
            </button>
          ))}
        </div>
        {selectedTones.length === 0 && (
          <p className="text-xs text-gray-400 mt-1">No preference — AI will vary randomly</p>
        )}
      </div>

      {/* Content type multi-select */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-2">Content Types</label>
        <div className="flex flex-wrap gap-1.5">
          {CONTENT_TYPE_OPTIONS.map(ct => (
            <button
              key={ct}
              onClick={() => toggleContentType(ct)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                selectedContentTypes.includes(ct)
                  ? 'bg-blue-100 border-blue-300 text-blue-700 font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {ct}
            </button>
          ))}
        </div>
        {selectedContentTypes.length === 0 && (
          <p className="text-xs text-gray-400 mt-1">No preference — AI will vary randomly</p>
        )}
      </div>

      {/* Email length */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-600 mb-2">Email Length</label>
        <div className="flex gap-2">
          {(['short', 'medium', 'long'] as const).map(len => (
            <button
              key={len}
              onClick={() => setEmailLength(len)}
              className={`text-xs px-4 py-1.5 rounded-md border transition-colors ${
                emailLength === len
                  ? 'bg-gray-800 border-gray-800 text-white font-medium'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {len.charAt(0).toUpperCase() + len.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={handleSave}
          disabled={updateSettings.isPending}
          className="btn btn-primary btn-sm inline-flex items-center gap-1"
        >
          {updateSettings.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
          Save Preferences
        </button>
        <button
          onClick={handlePreview}
          disabled={previewEmail.isPending}
          className="btn btn-secondary btn-sm inline-flex items-center gap-1"
        >
          {previewEmail.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Preview Email
        </button>
        {settingsSaved && (
          <span className="text-xs text-green-600 flex items-center gap-1">
            <Check className="w-3 h-3" /> Saved
          </span>
        )}
        {updateSettings.isError && (
          <span className="text-xs text-red-600">Failed to save</span>
        )}
      </div>

      {/* Preview card */}
      {preview && (
        <div className="border border-gray-200 rounded-lg bg-white overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Mail className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <span className="text-sm font-medium text-gray-800 truncate">{preview.subject}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                {CONTENT_TYPE_LABEL_MAP[preview.content_type] || preview.content_type}
              </span>
              <button
                onClick={handlePreview}
                disabled={previewEmail.isPending}
                className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${previewEmail.isPending ? 'animate-spin' : ''}`} />
                Regenerate
              </button>
            </div>
          </div>
          <div
            className="p-3 max-h-64 overflow-y-auto text-sm text-gray-700 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: preview.body_html }}
          />
        </div>
      )}

      {previewEmail.isError && (
        <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> Failed to generate preview
        </p>
      )}

      {/* KB link */}
      <div className="mt-3 pt-3 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Warmup emails also reference your knowledge base content.{' '}
          <Link to="/sites" className="text-primary-600 hover:text-primary-700">
            Manage AI & Knowledge Base
          </Link>
        </p>
      </div>
    </div>
  );
}

function WarmupDomainCard({
  warmup,
  workspaceId,
  onPause,
  onResume,
  onCancel,
  confirmingCancel,
}: {
  warmup: WarmupDomain;
  workspaceId: string;
  onPause: (domain: string) => void;
  onResume: (domain: string) => void;
  onCancel: (domain: string) => void;
  confirmingCancel: boolean;
  isPausing: boolean;
  isResuming: boolean;
  isCancelling: boolean;
}) {
  const { workspace } = useCurrentWorkspace();
  const timezone = workspace?.settings?.timezone || 'America/New_York';
  const tzOffset = getTimezoneOffsetHours(timezone);
  const hourOptions = buildHourOptions(timezone);

  const statusInfo = getWarmupStatusInfo(warmup.status);
  const progress = warmup.schedule_length > 0
    ? Math.round((warmup.warmup_day / warmup.schedule_length) * 100)
    : 0;

  const [isExpanded, setIsExpanded] = useState(false);
  const [activePanel, setActivePanel] = useState<'health' | 'seedlist' | 'log' | 'settings' | 'content' | null>(null);
  const [seedInput, setSeedInput] = useState('');
  const [editSeedList, setEditSeedList] = useState<string[]>(warmup.seed_list || []);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [editAutoWarmup, setEditAutoWarmup] = useState(warmup.auto_warmup_enabled);
  const [seedListSaved, setSeedListSaved] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Settings panel state — convert stored UTC hours to local for editing
  const [editSendWindowStart, setEditSendWindowStart] = useState(utcToLocal(warmup.send_window_start, tzOffset));
  const [editSendWindowEnd, setEditSendWindowEnd] = useState(utcToLocal(warmup.send_window_end, tzOffset));
  const [editMaxBounce, setEditMaxBounce] = useState(warmup.max_bounce_rate);
  const [editMaxComplaint, setEditMaxComplaint] = useState(warmup.max_complaint_rate);
  const [editRemainingSchedule, setEditRemainingSchedule] = useState(
    warmup.schedule?.slice(warmup.warmup_day).join(', ') || ''
  );

  const updateSeedList = useUpdateSeedList(workspaceId);
  const updateSettings = useUpdateWarmupSettings(workspaceId);
  const sendTestEmail = useSendWarmupTestEmail(workspaceId);
  const [testEmailSent, setTestEmailSent] = useState(false);
  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useDomainHealth(
    workspaceId,
    warmup.domain,
    activePanel === 'health',
  );
  const { data: logData, isLoading: logLoading } = useWarmupLog(
    activePanel === 'log' ? workspaceId : undefined,
    activePanel === 'log' ? warmup.domain : undefined,
  );

  const handleRemoveSeedEmail = (email: string) => {
    setEditSeedList(editSeedList.filter((e) => e !== email));
  };

  const handleSaveSeedList = async () => {
    try {
      await updateSeedList.mutateAsync({
        domain: warmup.domain,
        seed_list: editSeedList,
        auto_warmup_enabled: editAutoWarmup,
      });
      setSeedListSaved(true);
      setTimeout(() => setSeedListSaved(false), 2000);
    } catch {
      // Error handled by mutation state
    }
  };

  const handleSaveSettings = async () => {
    try {
      const scheduleValues = editRemainingSchedule
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n > 0);

      await updateSettings.mutateAsync({
        domain: warmup.domain,
        send_window_start: localToUtc(editSendWindowStart, tzOffset),
        send_window_end: localToUtc(editSendWindowEnd, tzOffset),
        max_bounce_rate: editMaxBounce,
        max_complaint_rate: editMaxComplaint,
        schedule: scheduleValues.length > 0 ? scheduleValues : undefined,
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    } catch {
      // Error handled by mutation state
    }
  };

  const togglePanel = (panel: typeof activePanel) => {
    setActivePanel(activePanel === panel ? null : panel);
  };

  const todayProgress = warmup.today ? Math.round((warmup.today.send_count / Math.max(warmup.today.daily_limit, 1)) * 100) : 0;

  return (
    <div className="border border-gray-200 rounded-lg">
      {/* Collapsed header row - always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-50 rounded-lg transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Globe className="w-5 h-5 text-gray-400 shrink-0" />
          <span className="font-medium text-gray-900 truncate">{warmup.domain}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${statusInfo.color} ${statusInfo.bgColor}`}>
            {statusInfo.label}
          </span>
          {warmup.auto_warmup_enabled && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium text-emerald-700 bg-emerald-100 shrink-0">
              Auto
            </span>
          )}
          {warmup.reply_to && warmup.reply_to_verified && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium text-green-700 bg-green-100 shrink-0" title={`Reply-to: ${warmup.reply_to}`}>
              Reply-To
            </span>
          )}
          {(warmup.status === 'active' || warmup.status === 'paused') && (
            <span className="text-xs text-gray-500 shrink-0">Day {warmup.warmup_day + 1}/{warmup.schedule_length}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {warmup.status === 'active' && (
            <span
              onClick={(e) => { e.stopPropagation(); onPause(warmup.domain); }}
              className="p-1.5 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors cursor-pointer"
              title="Pause warm-up"
            >
              <Pause className="w-4 h-4" />
            </span>
          )}
          {warmup.status === 'paused' && (
            <span
              onClick={(e) => { e.stopPropagation(); onResume(warmup.domain); }}
              className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded transition-colors cursor-pointer"
              title="Resume warm-up"
            >
              <Play className="w-4 h-4" />
            </span>
          )}
          {(warmup.status === 'active' || warmup.status === 'paused') && (
            <span
              onClick={(e) => { e.stopPropagation(); onCancel(warmup.domain); }}
              className={`p-1.5 rounded transition-colors cursor-pointer ${
                confirmingCancel
                  ? 'text-red-600 bg-red-50'
                  : 'text-gray-500 hover:text-red-600 hover:bg-red-50'
              }`}
              title={confirmingCancel ? 'Click again to confirm' : 'Cancel warm-up'}
            >
              <Trash2 className="w-4 h-4" />
            </span>
          )}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400 ml-1" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400 ml-1" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-100">
          {/* Auto-pause alert */}
          {warmup.status === 'paused' && warmup.pause_reason && warmup.pause_reason !== 'manual' && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg mt-3 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800">Auto-paused</p>
                <p className="text-amber-700">{warmup.pause_reason}</p>
              </div>
            </div>
          )}

          {/* Low engagement warning */}
          {warmup.low_engagement_warning && warmup.status === 'active' && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg mt-3 text-sm">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-blue-800">Low engagement detected</p>
                <p className="text-blue-700">
                  Open rate is below 5% ({warmup.open_rate.toFixed(1)}%). Consider reviewing your email content, subject lines, and sending reputation.
                </p>
              </div>
            </div>
          )}

          {/* Progress bar */}
          {(warmup.status === 'active' || warmup.status === 'paused') && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                <span>Day {warmup.warmup_day + 1} of {warmup.schedule_length}</span>
                <span>{warmup.daily_limit === -1 ? 'Unlimited' : `${warmup.daily_limit.toLocaleString()}/day limit`}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    warmup.status === 'paused' ? 'bg-amber-400' : 'bg-primary-500'
                  }`}
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Today's Progress */}
          {warmup.today && (warmup.status === 'active' || warmup.status === 'paused') && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-blue-800">Today's Progress</span>
                <span className="text-blue-600">{warmup.today.send_count} / {warmup.today.daily_limit}</span>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.min(todayProgress, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Completed state */}
          {warmup.status === 'completed' && (
            <div className="flex items-center gap-2 text-sm text-green-600 mt-3">
              <Check className="w-4 h-4" />
              <span>Warm-up complete - no sending limits enforced</span>
            </div>
          )}

          {/* Engagement stats */}
          <div className="space-y-2 mt-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-500">Sent</p>
                <p className="text-sm font-semibold text-gray-900">{warmup.total_sent.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-500">Delivered</p>
                <p className="text-sm font-semibold text-gray-900">{warmup.total_delivered.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-500">Opens</p>
                <p className="text-sm font-semibold text-gray-900">
                  {warmup.total_opens.toLocaleString()}
                  {warmup.total_delivered > 0 && (
                    <span className="text-xs text-gray-500 font-normal ml-1">({warmup.open_rate.toFixed(1)}%)</span>
                  )}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-500">Bounces</p>
                <p className={`text-sm font-semibold ${warmup.bounce_rate > warmup.max_bounce_rate ? 'text-red-600' : 'text-gray-900'}`}>
                  {warmup.total_bounced.toLocaleString()}
                  <span className="text-xs font-normal ml-1">({warmup.bounce_rate.toFixed(2)}%)</span>
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-xs text-gray-500">Complaints</p>
                <p className={`text-sm font-semibold ${warmup.complaint_rate > warmup.max_complaint_rate ? 'text-red-600' : 'text-gray-900'}`}>
                  {warmup.total_complaints.toLocaleString()}
                  <span className="text-xs font-normal ml-1">({warmup.complaint_rate.toFixed(3)}%)</span>
                </p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          {(warmup.status === 'active' || warmup.status === 'paused') && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => togglePanel('health')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 ${
                  activePanel === 'health' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Shield className="w-3 h-3" />
                Health
              </button>
              <button
                onClick={() => togglePanel('seedlist')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors ${
                  activePanel === 'seedlist' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Seed List ({warmup.seed_list?.length || 0})
              </button>
              <button
                onClick={() => togglePanel('settings')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 ${
                  activePanel === 'settings' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <SlidersHorizontal className="w-3 h-3" />
                Settings
              </button>
              <button
                onClick={() => togglePanel('content')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 ${
                  activePanel === 'content' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <BookOpen className="w-3 h-3" />
                Content
              </button>
              <button
                onClick={() => togglePanel('log')}
                className={`text-xs px-3 py-1.5 rounded-md transition-colors inline-flex items-center gap-1 ${
                  activePanel === 'log' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                <Eye className="w-3 h-3" />
                View Log
              </button>
            </div>
          )}

          {/* Health Panel */}
          {activePanel === 'health' && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              {healthLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                  <span className="text-sm text-gray-500 ml-2">Running health checks...</span>
                </div>
              ) : healthData ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`text-lg font-bold px-3 py-1 rounded-lg ${getHealthStatusInfo(healthData.status).bgColor} ${getHealthStatusInfo(healthData.status).color}`}>
                        {healthData.score}/100
                      </div>
                      <span className={`text-sm font-medium ${getHealthStatusInfo(healthData.status).color}`}>
                        {getHealthStatusInfo(healthData.status).label}
                      </span>
                    </div>
                    <button onClick={() => refetchHealth()} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                      <RefreshCw className="w-3 h-3" />
                      Refresh
                    </button>
                  </div>

                  {/* MX warning */}
                  {!healthData.mx_valid && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-red-800">No MX records found</p>
                          <p className="text-xs text-red-600 mt-0.5">
                            This domain cannot receive replies. Bounced replies hurt your sender reputation and can trigger blacklisting. Add MX records pointing to your mail provider.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Authentication</h5>
                    <div className="space-y-1.5">
                      {[
                        { valid: healthData.spf_valid, label: 'SPF', key: 'spf', max: 15 },
                        { valid: healthData.dkim_enabled, label: 'DKIM', key: 'dkim', max: 15 },
                        { valid: healthData.dmarc_valid, label: `DMARC${healthData.dmarc_policy ? ` (${healthData.dmarc_policy})` : ''}`, key: 'dmarc', max: 15, extra: 'dmarc_enforce' },
                      ].map(({ valid, label, key, max, extra }) => (
                        <div key={key} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            {valid ? <Check className="w-3.5 h-3.5 text-green-600" /> : <X className="w-3.5 h-3.5 text-red-500" />}
                            <span className="text-gray-700">{label}</span>
                          </div>
                          <span className="text-xs text-gray-500">+{(healthData.score_breakdown?.[key] || 0) + (extra ? (healthData.score_breakdown?.[extra] || 0) : 0)}/{max}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Infrastructure</h5>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {healthData.mx_valid ? <Check className="w-3.5 h-3.5 text-green-600" /> : <X className="w-3.5 h-3.5 text-red-500" />}
                        <span className="text-gray-700">
                          {healthData.mx_valid
                            ? `MX records (${healthData.mx_hosts?.join(', ') || 'found'})`
                            : 'MX records missing — replies will bounce'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">+{healthData.score_breakdown?.mx || 0}/10</span>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Blacklist</h5>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {!healthData.blacklisted ? <Check className="w-3.5 h-3.5 text-green-600" /> : <X className="w-3.5 h-3.5 text-red-500" />}
                        <span className="text-gray-700">
                          {healthData.blacklisted ? `Listed on ${healthData.blacklist_listings.length} blacklist(s)` : 'Not blacklisted'}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">+{healthData.score_breakdown?.blacklist || 0}/10</span>
                    </div>
                    {healthData.blacklisted && healthData.blacklist_listings.length > 0 && (
                      <div className="mt-1 ml-6 text-xs text-red-600">{healthData.blacklist_listings.join(', ')}</div>
                    )}
                  </div>

                  <div>
                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Reputation</h5>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">Bounce rate: {healthData.bounce_rate.toFixed(2)}%</span>
                        <span className="text-xs text-gray-500">+{healthData.score_breakdown?.bounce || 0}/15</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">Complaint rate: {healthData.complaint_rate.toFixed(3)}%</span>
                        <span className="text-xs text-gray-500">+{healthData.score_breakdown?.complaint || 0}/10</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Engagement</h5>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">Open rate: {healthData.open_rate.toFixed(1)}%</span>
                      <span className="text-xs text-gray-500">+{healthData.score_breakdown?.open_rate || 0}/10</span>
                    </div>
                  </div>

                  {healthData.errors.length > 0 && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                      <p className="font-medium mb-1">Partial results (some checks failed):</p>
                      {healthData.errors.map((err, i) => <p key={i}>{err}</p>)}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-200">
                    <span>
                      {healthData.cached ? 'Cached' : 'Fresh'} &middot; {healthData.checked_at ? new Date(healthData.checked_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-500 py-2">Failed to load health data</p>
              )}
            </div>
          )}

          {/* Seed List Panel */}
          {activePanel === 'seedlist' && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-700">Seed List</h4>
                <span className="text-xs text-gray-400">{editSeedList.length}/50 emails</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Add email addresses you own across different providers (Gmail, Outlook, Yahoo). Open and reply to warmup emails to build positive engagement signals.
              </p>

              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  className="input flex-1 text-sm"
                  placeholder="Paste or type emails — comma, space, or newline separated"
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const newEmails = parseBulkEmails(seedInput, editSeedList);
                      if (newEmails.length > 0) {
                        setEditSeedList([...editSeedList, ...newEmails].slice(0, 50));
                        setSeedInput('');
                      }
                    }
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    if (pasted.includes(',') || pasted.includes('\n') || pasted.includes(' ')) {
                      e.preventDefault();
                      const newEmails = parseBulkEmails(pasted, editSeedList);
                      if (newEmails.length > 0) {
                        setEditSeedList([...editSeedList, ...newEmails].slice(0, 50));
                        setSeedInput('');
                      }
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const newEmails = parseBulkEmails(seedInput, editSeedList);
                    if (newEmails.length > 0) {
                      setEditSeedList([...editSeedList, ...newEmails].slice(0, 50));
                      setSeedInput('');
                    }
                  }}
                  disabled={!seedInput.trim() || editSeedList.length >= 50}
                  className="btn btn-secondary btn-sm"
                >
                  Add
                </button>
                <button
                  onClick={() => setShowContactPicker(!showContactPicker)}
                  disabled={editSeedList.length >= 50}
                  className="btn btn-secondary btn-sm inline-flex items-center gap-1"
                >
                  <Users className="w-3.5 h-3.5" />
                  Import from Contacts
                </button>
              </div>
              {showContactPicker && (
                <ContactImportPicker
                  workspaceId={workspaceId}
                  existingEmails={editSeedList}
                  maxEmails={50}
                  onImport={(emails) => setEditSeedList([...editSeedList, ...emails].slice(0, 50))}
                  onClose={() => setShowContactPicker(false)}
                />
              )}

              {editSeedList.length > 0 && (
                <>
                  {/* Provider coverage */}
                  <div className="flex items-center gap-1.5 mb-2">
                    {getProviderCoverage(editSeedList).map((p) => (
                      <span key={p.name} className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.color}`}>
                        {p.name} ({p.count})
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {editSeedList.map((email) => (
                      <span key={email} className="inline-flex items-center gap-1 text-xs bg-white border border-gray-200 rounded-full px-2.5 py-1">
                        {email}
                        <button onClick={() => handleRemoveSeedEmail(email)} className="text-gray-400 hover:text-red-500">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={() => setEditSeedList([])}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      Clear all
                    </button>
                  </div>

                  {/* Missing provider hints */}
                  {(() => {
                    const covered = getProviderCoverage(editSeedList).map(p => p.name);
                    const missing = EMAIL_PROVIDERS.filter(p => !covered.includes(p.name));
                    if (missing.length === 0 || editSeedList.length === 0) return null;
                    return (
                      <p className="text-xs text-amber-600 mb-2">
                        Tip: Add addresses from {missing.map(m => m.name).join(', ')} for better provider coverage
                      </p>
                    );
                  })()}
                </>
              )}

              {editSeedList.length === 0 && (
                <p className="text-xs text-gray-400 mb-3 italic">No seed emails yet. Add your team inboxes and aliases above.</p>
              )}

              <div className="flex items-center justify-between py-2 border-t border-gray-200">
                <div>
                  <p className="text-sm font-medium text-gray-700">Auto-warmup</p>
                  <p className="text-xs text-gray-500">AI generates and sends warmup emails on schedule</p>
                </div>
                <button
                  onClick={() => setEditAutoWarmup(!editAutoWarmup)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    editAutoWarmup ? 'bg-primary-600' : 'bg-gray-200'
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    editAutoWarmup ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>


              {/* Send Test Email */}
              {editSeedList.length > 0 && (
                <div className="flex items-center justify-between py-2 border-t border-gray-200">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Send Test Email</p>
                    <p className="text-xs text-gray-500">
                      Send an AI-generated warmup email to {editSeedList[0]}
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await sendTestEmail.mutateAsync({ domain: warmup.domain, recipient: editSeedList[0] });
                        setTestEmailSent(true);
                        setTimeout(() => setTestEmailSent(false), 3000);
                      } catch {
                        // Error handled by mutation state
                      }
                    }}
                    disabled={sendTestEmail.isPending}
                    className="btn btn-secondary btn-sm inline-flex items-center gap-1"
                  >
                    {sendTestEmail.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                    Send Test
                  </button>
                </div>
              )}
              {testEmailSent && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Test email sent! Check your inbox.
                </p>
              )}
              {sendTestEmail.isError && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {getApiErrorMessage(sendTestEmail.error, 'Failed to send test email')}
                </p>
              )}

              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={handleSaveSeedList}
                  disabled={updateSeedList.isPending || editSeedList.length === 0}
                  className="btn btn-primary btn-sm inline-flex items-center gap-1"
                >
                  {updateSeedList.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save
                </button>
                {seedListSaved && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Settings Panel */}
          {activePanel === 'settings' && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Warmup Settings</h4>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Send window start</label>
                  <select
                    className="input text-sm"
                    value={editSendWindowStart}
                    onChange={(e) => setEditSendWindowStart(Number(e.target.value))}
                  >
                    {hourOptions.map((h) => (
                      <option key={h.value} value={h.value}>{h.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Send window end</label>
                  <select
                    className="input text-sm"
                    value={editSendWindowEnd}
                    onChange={(e) => setEditSendWindowEnd(Number(e.target.value))}
                  >
                    {hourOptions.map((h) => (
                      <option key={h.value} value={h.value}>{h.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Max bounce rate (%)</label>
                  <input
                    type="number"
                    className="input text-sm"
                    step="0.1"
                    min="0.1"
                    max="50"
                    value={editMaxBounce}
                    onChange={(e) => setEditMaxBounce(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Max complaint rate (%)</label>
                  <input
                    type="number"
                    className="input text-sm"
                    step="0.01"
                    min="0.01"
                    max="5"
                    value={editMaxComplaint}
                    onChange={(e) => setEditMaxComplaint(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Remaining schedule (comma-separated daily limits)
                </label>
                <textarea
                  className="input text-sm font-mono"
                  rows={2}
                  placeholder="100, 200, 300, 500, ..."
                  value={editRemainingSchedule}
                  onChange={(e) => setEditRemainingSchedule(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">
                  {warmup.schedule_length - warmup.warmup_day} days remaining in current schedule
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveSettings}
                  disabled={updateSettings.isPending}
                  className="btn btn-primary btn-sm inline-flex items-center gap-1"
                >
                  {updateSettings.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                  Save Settings
                </button>
                {settingsSaved && (
                  <span className="text-xs text-green-600 flex items-center gap-1">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
                {updateSettings.isError && (
                  <span className="text-xs text-red-600">Failed to save</span>
                )}
              </div>
            </div>
          )}

          {/* Content / Tone & Style Panel */}
          {activePanel === 'content' && (
            <ContentStylePanel warmup={warmup} workspaceId={workspaceId} />
          )}

          {/* Warmup Log Panel */}
          {activePanel === 'log' && (
            <div className="mt-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Warmup Email Log</h4>

              {/* Diagnostics */}
              {logData && (
                <div className="mb-3 p-2.5 bg-white rounded-lg border border-gray-200 text-xs text-gray-600 space-y-1">
                  <div className="flex items-center justify-between">
                    <span>Auto-warmup</span>
                    <span className={`font-medium ${logData.warmup?.auto_warmup_enabled ? 'text-green-600' : 'text-gray-400'}`}>
                      {logData.warmup?.auto_warmup_enabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Seed list</span>
                    <span className="font-medium">{logData.warmup?.seed_list_count ?? warmup.seed_list?.length ?? 0} emails</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> Send window</span>
                    <span className="font-medium">
                      {logData.warmup
                        ? `${utcToLocal(logData.warmup.send_window_start, tzOffset).toString().padStart(2, '0')}:00–${utcToLocal(logData.warmup.send_window_end, tzOffset).toString().padStart(2, '0')}:00`
                        : `${utcToLocal(warmup.send_window_start, tzOffset).toString().padStart(2, '0')}:00–${utcToLocal(warmup.send_window_end, tzOffset).toString().padStart(2, '0')}:00`}
                      <span className="text-gray-400 ml-1">(now: {new Date().getHours().toString().padStart(2, '0')}:00)</span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Today</span>
                    <span className="font-medium">
                      {logData.today?.send_count ?? 0}/{logData.today?.daily_limit ?? warmup.daily_limit} sent
                    </span>
                  </div>
                  {healthData && (
                    <div className="flex items-center justify-between">
                      <span>SES domain</span>
                      <span className={`font-medium ${healthData.dkim_enabled ? 'text-green-600' : 'text-amber-600'}`}>
                        {healthData.dkim_enabled ? 'Verified' : 'Not verified'}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {logLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                </div>
              ) : logData?.items && logData.items.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {logData.items.map((entry, i) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0 text-xs">
                      <Mail className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-800 truncate">{entry.subject}</p>
                        <p className="text-gray-500">
                          To: {entry.recipient}
                          {entry.from_email && <> &middot; From: {entry.from_email}</>}
                          {entry.sent_at && <> &middot; {new Date(entry.sent_at).toLocaleString()}</>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500 py-2">No warmup emails sent yet</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
