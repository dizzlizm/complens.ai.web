import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useCurrentWorkspace, useSite, useListDomains, useUpdateSite, usePages, useUpdatePage, checkSubdomainAvailability } from '../lib/hooks';
import { Loader2, Settings2, Globe, Check, Clock, AlertTriangle, ArrowRight, Star, ExternalLink, AlertCircle } from 'lucide-react';
import EmailIdentity from '../components/email/EmailIdentity';
import WarmupManager from '../components/email/WarmupManager';
import CustomDomainSection from '../components/domains/CustomDomainSection';

// Subdomain suffix for page URLs
const SUBDOMAIN_SUFFIX = import.meta.env.VITE_SUBDOMAIN_SUFFIX
  || (import.meta.env.VITE_API_URL || '').replace(/^https?:\/\/api\./, '')
  || 'complens.ai';

export default function SiteSetup() {
  const navigate = useNavigate();
  const { siteId } = useParams<{ siteId: string }>();
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  if (isLoadingWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings2 className="w-7 h-7 text-primary-600" />
          Site Setup
        </h1>
        <p className="mt-1 text-gray-500">
          Configure domains, sender identity, and email campaigns for this site.
        </p>
      </div>

      <DomainStatusCard workspaceId={workspaceId} siteId={siteId} />

      {/* Subdomain */}
      {siteId && workspaceId && (
        <SubdomainSection workspaceId={workspaceId} siteId={siteId} />
      )}

      {/* Custom Domain */}
      {siteId && workspaceId && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Custom Domain</h2>
          <p className="text-sm text-gray-500 mb-4">
            Connect your own domain to serve pages from a branded URL
          </p>
          <CustomDomainSection workspaceId={workspaceId} siteId={siteId} />
        </div>
      )}

      <EmailIdentity
        workspaceId={workspaceId}
        siteId={siteId}
      />

      <WarmupManager
        workspaceId={workspaceId}
        siteId={siteId}
        onNavigateToDomains={() => navigate('/settings?section=domains')}
      />
    </div>
  );
}

function SubdomainSection({ workspaceId, siteId }: { workspaceId: string; siteId: string }) {
  const { data: pages } = usePages(workspaceId, siteId);
  const primaryPage = pages?.[0];
  const updatePage = useUpdatePage(workspaceId, primaryPage?.id || '');

  const currentSubdomain = primaryPage?.subdomain || '';
  const [subdomainInput, setSubdomainInput] = useState(currentSubdomain);
  const [subdomainStatus, setSubdomainStatus] = useState<{
    checking: boolean;
    available?: boolean;
    message?: string;
    url?: string;
  }>({ checking: false });

  // Sync local state when page data loads
  useEffect(() => {
    setSubdomainInput(currentSubdomain);
  }, [currentSubdomain]);

  // Check subdomain availability with debounce
  useEffect(() => {
    if (!subdomainInput || subdomainInput === currentSubdomain) {
      setSubdomainStatus({ checking: false });
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSubdomainStatus({ checking: true });
      try {
        const result = await checkSubdomainAvailability(workspaceId, subdomainInput, primaryPage?.id);
        setSubdomainStatus({
          checking: false,
          available: result.available,
          message: result.message,
          url: result.url,
        });
      } catch {
        setSubdomainStatus({ checking: false, message: 'Failed to check availability' });
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [subdomainInput, currentSubdomain, workspaceId, primaryPage?.id]);

  const handleSubdomainSave = async () => {
    if (subdomainStatus.available === false && subdomainInput !== currentSubdomain) return;
    if (!primaryPage) return;
    try {
      await updatePage.mutateAsync({ subdomain: subdomainInput });
    } catch {
      // error handled by mutation
    }
  };

  if (!primaryPage) {
    return null;
  }

  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-1">Free Subdomain</h2>
      <p className="text-sm text-gray-500 mb-4">
        Claim a free subdomain to make your page publicly accessible
      </p>
      <div className="flex gap-2">
        <div className="flex-1 flex items-center">
          <input
            type="text"
            value={subdomainInput}
            onChange={(e) => setSubdomainInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="mypage"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <span className="px-3 py-2 bg-gray-50 border border-l-0 border-gray-300 rounded-r-lg text-gray-500 text-sm whitespace-nowrap">
            .{SUBDOMAIN_SUFFIX}
          </span>
        </div>
        <button
          onClick={handleSubdomainSave}
          disabled={
            updatePage.isPending ||
            subdomainStatus.checking ||
            Boolean(subdomainInput && subdomainStatus.available === false && subdomainInput !== currentSubdomain)
          }
          className="btn btn-primary btn-sm"
        >
          {updatePage.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>

      {/* Status messages */}
      {subdomainStatus.checking && (
        <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Checking...
        </p>
      )}
      {!subdomainStatus.checking && subdomainStatus.available === true && subdomainInput && (
        <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
          <Check className="w-3 h-3" />
          Available! <span className="font-medium">{subdomainStatus.url}</span>
        </p>
      )}
      {!subdomainStatus.checking && subdomainStatus.available === false && (
        <p className="text-xs text-red-600 mt-2 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          {subdomainStatus.message}
        </p>
      )}
      {currentSubdomain && subdomainInput === currentSubdomain && (
        <p className="text-xs text-gray-500 mt-2">
          Live at{' '}
          <a
            href={`https://${currentSubdomain}.${SUBDOMAIN_SUFFIX}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:underline inline-flex items-center gap-1"
          >
            {currentSubdomain}.{SUBDOMAIN_SUFFIX}
            <ExternalLink className="w-3 h-3" />
          </a>
        </p>
      )}
    </div>
  );
}

function DomainStatusCard({ workspaceId, siteId }: { workspaceId: string | undefined; siteId?: string }) {
  const navigate = useNavigate();
  const { data: savedDomainsData, isLoading } = useListDomains(workspaceId);
  const { data: site } = useSite(siteId ? workspaceId : undefined, siteId);
  const updateSite = useUpdateSite(workspaceId || '', siteId || '');
  const savedDomains = savedDomainsData?.items || [];

  const primaryDomain = (site?.settings?.primary_domain as string) || '';

  const handleSetPrimary = async (domain: string) => {
    if (!siteId || !site) return;
    await updateSite.mutateAsync({
      settings: { ...(site.settings || {}), primary_domain: domain },
    });
  };

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sending Domain</h2>
          <p className="text-sm text-gray-500">
            {siteId ? 'Select the primary domain for this site' : 'Verified domains available for sending'}
          </p>
        </div>
        <button
          onClick={() => navigate('/settings?section=domains')}
          className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
        >
          Manage Domains
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {savedDomains.length === 0 ? (
        <div className="p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-center">
          <Globe className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="font-medium text-gray-700">No domains configured</p>
          <p className="text-sm text-gray-500 mt-1">
            Add a domain in Settings to start sending emails from your own address.
          </p>
          <button
            onClick={() => navigate('/settings?section=domains')}
            className="btn btn-primary btn-sm mt-3"
          >
            Set Up Domain
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {savedDomains.map((domain) => {
            const isPrimary = primaryDomain === domain.domain;
            return (
              <div
                key={domain.domain}
                className={`flex items-center justify-between p-3 border rounded-lg transition-colors ${
                  isPrimary
                    ? 'border-primary-300 bg-primary-50'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  {siteId ? (
                    <button
                      onClick={() => handleSetPrimary(domain.domain)}
                      disabled={!domain.ready || updateSite.isPending}
                      className="flex items-center justify-center w-5 h-5 shrink-0"
                      title={domain.ready ? 'Set as primary domain' : 'Domain must be verified first'}
                    >
                      {isPrimary ? (
                        <Star className="w-5 h-5 text-primary-600 fill-primary-600" />
                      ) : (
                        <Star className={`w-5 h-5 ${domain.ready ? 'text-gray-300 hover:text-primary-400' : 'text-gray-200'}`} />
                      )}
                    </button>
                  ) : (
                    <Globe className="w-5 h-5 text-gray-400" />
                  )}
                  <div>
                    <span className="font-medium text-gray-900">{domain.domain}</span>
                    {isPrimary && (
                      <span className="ml-2 text-xs text-primary-600 font-medium">Primary</span>
                    )}
                  </div>
                </div>
                {domain.ready ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                    <Check className="w-3 h-3" />
                    Verified
                  </span>
                ) : domain.verified ? (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                    <Clock className="w-3 h-3" />
                    DKIM Pending
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                    <AlertTriangle className="w-3 h-3" />
                    Pending
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
