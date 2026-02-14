import { useState } from 'react';
import {
  useDomains,
  useCreateDomain,
  useDeleteDomain,
  getDomainStatusInfo,
  type Domain,
} from '../../lib/hooks/useDomains';
import { Copy, Check, Globe, Trash2, RefreshCw, AlertCircle, Loader2 } from 'lucide-react';

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export function DnsRecord({ type, name, value }: { type: string; name: string; value: string }) {
  return (
    <div className="grid grid-cols-[48px_1fr_1fr_28px] gap-1.5 items-center text-xs font-mono bg-gray-50 rounded px-2.5 py-1.5">
      <span className="text-gray-500">{type}</span>
      <span className="text-gray-900 truncate" title={name}>{name}</span>
      <span className="text-gray-900 truncate" title={value}>{value}</span>
      <CopyButton value={value} />
    </div>
  );
}

/** Clean a raw domain input: strip protocol, www, trailing slashes/paths. */
export function cleanDomainInput(raw: string): string {
  let v = raw.trim().toLowerCase();
  v = v.replace(/^https?:\/\//, '');
  v = v.replace(/^www\./, '');
  v = v.replace(/[/:?#].*$/, '');
  v = v.replace(/[^a-z0-9.-]/g, '');
  return v;
}

/** Check if a cleaned domain string looks valid (has at least one dot, no leading/trailing hyphens). */
export function isDomainValid(domain: string): boolean {
  if (!domain || domain.length < 4) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain);
}

export function DomainStatus({
  domain,
  subdomain,
  onDelete,
}: {
  domain: Domain;
  subdomain: string;
  onDelete: (domain: string) => void;
}) {
  const statusInfo = getDomainStatusInfo(domain.status);

  return (
    <div className="space-y-2">
      {/* Domain header with status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-gray-900">{domain.domain}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusInfo.bgColor} ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>
        <button
          onClick={() => onDelete(domain.domain)}
          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
          title="Remove domain"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Step 1: Pending validation — show ACM CNAME */}
      {(domain.status === 'pending_validation' || domain.status === 'validating') &&
        domain.validation_record_name &&
        domain.validation_record_value && (
          <div className="space-y-1.5">
            <p className="text-xs text-gray-600">
              <span className="font-semibold">Step 1:</span> Add this CNAME to verify your SSL certificate:
            </p>
            <DnsRecord
              type="CNAME"
              name={domain.validation_record_name}
              value={domain.validation_record_value}
            />
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <RefreshCw className="w-3 h-3" />
              Auto-checking every 10s...
            </p>
          </div>
        )}

      {/* Provisioning */}
      {domain.status === 'provisioning' && (
        <div className="flex items-center gap-1.5 text-xs text-indigo-600">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Setting up CDN... This can take 10-15 min.
        </div>
      )}

      {/* Step 2: Active — show CNAME target */}
      {domain.status === 'active' && domain.cname_target && (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-600">
            <span className="font-semibold">Step 2:</span> Point your domain to our servers:
          </p>
          <DnsRecord type="CNAME" name={domain.domain} value={domain.cname_target} />
          {subdomain && (
            <p className="text-xs text-green-700 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              Live at{' '}
              <a
                href={`https://${subdomain}.${domain.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium hover:underline"
              >
                {subdomain}.{domain.domain}
              </a>
            </p>
          )}
        </div>
      )}

      {/* Failed */}
      {domain.status === 'failed' && (
        <div className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3.5 h-3.5" />
          {domain.status_message || 'Provisioning failed'}
        </div>
      )}

      {/* Status message */}
      {domain.status_message && domain.status !== 'failed' && domain.status !== 'active' && (
        <p className="text-xs text-gray-500">{domain.status_message}</p>
      )}
    </div>
  );
}

export default function CustomDomainSection({
  workspaceId,
  siteId,
  subdomain = '',
}: {
  workspaceId: string;
  siteId: string;
  subdomain?: string;
}) {
  const [domainInput, setDomainInput] = useState('');
  const { data: domainsData, isLoading } = useDomains(workspaceId);
  const createDomain = useCreateDomain(workspaceId);
  const deleteDomain = useDeleteDomain(workspaceId);

  // Find domain for this site
  const siteDomain = domainsData?.items.find((d) => d.site_id === siteId);

  const cleaned = cleanDomainInput(domainInput);
  const valid = isDomainValid(cleaned);
  const showCleaned = cleaned && cleaned !== domainInput.trim().toLowerCase();

  const handleConnect = () => {
    if (!cleaned || !valid) return;
    createDomain.mutate({ domain: cleaned, site_id: siteId });
    setDomainInput('');
  };

  const handleDelete = (domain: string) => {
    if (confirm(`Remove ${domain}? This will delete the SSL certificate and CDN distribution.`)) {
      deleteDomain.mutate(domain);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading domain status...
      </div>
    );
  }

  // No domain configured — show input
  if (!siteDomain) {
    return (
      <div>
        <p className="text-xs text-gray-500 mb-1.5">
          e.g. <span className="font-medium text-gray-700">landing.yourcompany.com</span> or <span className="font-medium text-gray-700">yourcompany.com</span>. You'll need DNS access.
        </p>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            onBlur={() => { if (domainInput) setDomainInput(cleaned); }}
            placeholder="yourcompany.com"
            className={`flex-1 px-2.5 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
              domainInput && !valid ? 'border-red-300' : 'border-gray-300'
            }`}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          />
          <button
            onClick={handleConnect}
            disabled={!valid || createDomain.isPending}
            className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-1"
          >
            {createDomain.isPending ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Connecting...</>
            ) : (
              <><Globe className="w-3 h-3" /> Connect</>
            )}
          </button>
        </div>
        {showCleaned && valid && (
          <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
            <Check className="w-3 h-3" /> Will connect as <span className="font-medium">{cleaned}</span>
          </p>
        )}
        {domainInput && !valid && (
          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            Enter a valid domain &mdash; no https:// or paths
          </p>
        )}
        {createDomain.isError && (
          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {(createDomain.error as any)?.response?.data?.message || 'Failed to connect domain'}
          </p>
        )}
      </div>
    );
  }

  // Domain exists — show status
  return <DomainStatus domain={siteDomain} subdomain={subdomain} onDelete={handleDelete} />;
}
