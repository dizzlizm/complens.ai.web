import { useState, useEffect } from 'react';
import { checkSubdomainAvailability } from '../../lib/hooks/usePages';
import { useDomains, useCreateDomain, useDeleteDomain, getDomainStatusInfo } from '../../lib/hooks/useDomains';
import { useToast } from '../Toast';

// Extract subdomain suffix from API URL (e.g., "dev.complens.ai" from "https://api.dev.complens.ai")
const API_URL = import.meta.env.VITE_API_URL || 'https://api.dev.complens.ai';
const SUBDOMAIN_SUFFIX = API_URL.replace(/^https?:\/\/api\./, '');

export interface DomainTabProps {
  workspaceId: string;
  pageId: string;
  pageSlug: string;
  subdomain: string;
  onSaveSubdomain: (subdomain: string) => void;
  isSaving: boolean;
}

export default function DomainTab({
  workspaceId,
  pageId,
  pageSlug,
  subdomain,
  onSaveSubdomain,
  isSaving,
}: DomainTabProps) {
  const [newDomain, setNewDomain] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [subdomainInput, setSubdomainInput] = useState(subdomain);
  const [subdomainStatus, setSubdomainStatus] = useState<{
    checking: boolean;
    available?: boolean;
    message?: string;
    url?: string;
  }>({ checking: false });
  const toast = useToast();

  const { data: domainsData, isLoading } = useDomains(workspaceId);
  const createDomain = useCreateDomain(workspaceId);
  const deleteDomain = useDeleteDomain(workspaceId);

  // Sync local state with prop when page data changes (e.g., after save)
  useEffect(() => {
    setSubdomainInput(subdomain);
  }, [subdomain]);

  // Check subdomain availability with debounce
  useEffect(() => {
    if (!subdomainInput || subdomainInput === subdomain) {
      setSubdomainStatus({ checking: false });
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSubdomainStatus({ checking: true });
      try {
        const result = await checkSubdomainAvailability(workspaceId, subdomainInput, pageId);
        setSubdomainStatus({
          checking: false,
          available: result.available,
          message: result.message,
          url: result.url,
        });
      } catch (err) {
        setSubdomainStatus({ checking: false, message: 'Failed to check availability' });
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [subdomainInput, subdomain, workspaceId, pageId]);

  const handleSubdomainSave = () => {
    // Block only if we've explicitly checked and it's unavailable
    if (subdomainStatus.available === false && subdomainInput !== subdomain) {
      return;
    }
    // Call the save callback with the new subdomain value
    onSaveSubdomain(subdomainInput);
  };

  const allDomains = domainsData?.items || [];
  const limit = domainsData?.limit || 1;
  const used = domainsData?.used || 0;

  // Filter to only domains for THIS page
  const domainsForThisPage = allDomains.filter(d => d.page_id === pageId);
  // This page already has a domain?
  const thisPageHasDomain = domainsForThisPage.length > 0;
  // Can add if: this page doesn't have one yet AND workspace has room
  const canAddDomain = !thisPageHasDomain && used < limit;
  // At workspace limit but this page has no domain?
  const atLimitNeedUpgrade = !thisPageHasDomain && used >= limit;

  const handleSetupDomain = async () => {
    if (!newDomain.trim()) return;

    try {
      await createDomain.mutateAsync({
        domain: newDomain.toLowerCase().trim(),
        page_id: pageId,
      });
      setNewDomain('');
      setShowSetup(false);
      toast.success('Domain setup started. Check back for DNS instructions.');
    } catch (err) {
      console.error('Failed to setup domain:', err);
      toast.error('Failed to setup domain. Please check the format and try again.');
    }
  };

  const handleDeleteDomain = async (domain: string) => {
    if (!confirm(`Are you sure you want to remove ${domain}? This will delete the SSL certificate and CDN distribution.`)) {
      return;
    }
    try {
      await deleteDomain.mutateAsync(domain);
      toast.success('Domain removed successfully');
    } catch (err) {
      console.error('Failed to delete domain:', err);
      toast.error('Failed to remove domain. Please try again.');
    }
  };

  if (isLoading) {
    return <div className="animate-pulse h-32 bg-gray-100 rounded-lg" />;
  }

  return (
    <div className="space-y-6">
      {/* Subdomain Section - Free and Easy */}
      <div className="border border-gray-200 rounded-lg p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-green-100 rounded-lg">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h4 className="font-medium text-gray-900">Free Subdomain</h4>
            <p className="text-sm text-gray-600 mt-1">
              Get a short, memorable URL instantly. No DNS setup required.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 flex items-center">
            <input
              type="text"
              value={subdomainInput}
              onChange={(e) => setSubdomainInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="mypage"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <span className="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-500 text-sm">
              {`.${SUBDOMAIN_SUFFIX}`}
            </span>
          </div>
          <button
            onClick={handleSubdomainSave}
            disabled={
              isSaving ||
              subdomainStatus.checking ||
              // Only disable if we've explicitly checked and it's not available
              Boolean(subdomainInput && subdomainStatus.available === false && subdomainInput !== subdomain)
            }
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Status messages */}
        {subdomainStatus.checking && (
          <p className="text-sm text-gray-500 mt-2 flex items-center gap-2">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Checking availability...
          </p>
        )}
        {!subdomainStatus.checking && subdomainStatus.available === true && subdomainInput && (
          <p className="text-sm text-green-600 mt-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Available! Your page will be at: <span className="font-medium">{subdomainStatus.url}</span>
          </p>
        )}
        {!subdomainStatus.checking && subdomainStatus.available === false && (
          <p className="text-sm text-red-600 mt-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {subdomainStatus.message}
          </p>
        )}
        {subdomain && !subdomainInput && (
          <p className="text-sm text-gray-500 mt-2">
            Current subdomain will be removed when you save.
          </p>
        )}
        {subdomain && subdomainInput === subdomain && (
          <p className="text-sm text-gray-500 mt-2">
            Your page is live at:{' '}
            <a
              href={`https://${subdomain}.${SUBDOMAIN_SUFFIX}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              {`https://${subdomain}.${SUBDOMAIN_SUFFIX}`}
            </a>
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-3 bg-white text-gray-500">or use your own domain</span>
        </div>
      </div>

      {/* Custom Domain Section */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-indigo-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <div>
            <h4 className="font-medium text-gray-900">Custom Domain</h4>
            <p className="text-sm text-gray-600 mt-1">
              Connect your own domain to this landing page. We'll automatically provision an SSL certificate and CDN.
            </p>
          </div>
        </div>
      </div>

      {/* Show upgrade message if at workspace limit */}
      {atLimitNeedUpgrade && (
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-purple-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-gray-900">
                Custom domain limit reached
              </p>
              <p className="text-sm text-gray-600 mt-1">
                Your workspace has {used} of {limit} custom domain{limit !== 1 ? 's' : ''} in use.
                Upgrade your plan to connect more custom domains.
              </p>
              <button className="mt-2 text-sm font-medium text-purple-600 hover:text-purple-700">
                View upgrade options →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Existing Domains for THIS page */}
      {domainsForThisPage.length > 0 && (
        <div className="space-y-3">
          {domainsForThisPage.map((domain) => {
            const statusInfo = getDomainStatusInfo(domain.status);
            return (
              <div key={domain.domain} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900">{domain.domain}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusInfo.bgColor} ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteDomain(domain.domain)}
                    disabled={deleteDomain.isPending}
                    className="text-red-600 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                </div>

                {domain.status_message && (
                  <p className="text-sm text-gray-600 mb-3">{domain.status_message}</p>
                )}

                {/* DNS Validation Records */}
                {domain.status === 'pending_validation' && domain.validation_record_name && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-3">
                    <h5 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      Add this DNS record to verify ownership:
                    </h5>
                    <div className="bg-white rounded p-3 font-mono text-xs overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-gray-500">
                            <th className="pb-1">Type</th>
                            <th className="pb-1">Name</th>
                            <th className="pb-1">Value</th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-900">
                          <tr>
                            <td className="py-1 pr-4">CNAME</td>
                            <td className="py-1 pr-4 break-all">{domain.validation_record_name}</td>
                            <td className="py-1 break-all">{domain.validation_record_value}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-amber-700 mt-2">
                      After adding this record, validation usually completes within 5-30 minutes.
                    </p>
                  </div>
                )}

                {/* Active Domain - CNAME Target */}
                {domain.status === 'active' && domain.cname_target && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-3">
                    <h5 className="font-medium text-green-800 mb-2 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Domain is active!
                    </h5>
                    <p className="text-sm text-green-700 mb-2">
                      Point your domain to our CDN:
                    </p>
                    <div className="bg-white rounded p-2 font-mono text-sm">
                      <span className="text-gray-500">CNAME</span> {domain.domain} → <span className="text-green-600">{domain.cname_target}</span>
                    </div>
                  </div>
                )}

                {/* Provisioning Progress */}
                {(domain.status === 'validating' || domain.status === 'provisioning') && (
                  <div className="flex items-center gap-2 text-sm text-indigo-600 mt-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Setting up your domain... This may take 10-15 minutes.</span>
                  </div>
                )}

                {/* Failed Status */}
                {domain.status === 'failed' && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
                    <p className="text-sm text-red-700">
                      Setup failed. You can remove this domain and try again.
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Domain Button/Form */}
      {canAddDomain && !showSetup && domainsForThisPage.length === 0 && (
        <button
          onClick={() => setShowSetup(true)}
          className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
        >
          <svg className="w-8 h-8 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="font-medium">Connect Custom Domain</span>
        </button>
      )}

      {showSetup && (
        <div className="border border-indigo-200 rounded-lg p-5 bg-indigo-50/50">
          <h4 className="font-medium text-gray-900 mb-3">Connect Your Domain</h4>
          <div className="flex gap-3">
            <input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value.toLowerCase().replace(/[^a-z0-9.-]/g, ''))}
              placeholder="landing.yourdomain.com"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleSetupDomain}
              disabled={!newDomain.trim() || createDomain.isPending}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {createDomain.isPending ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Setting up...
                </>
              ) : (
                'Connect'
              )}
            </button>
            <button
              onClick={() => { setShowSetup(false); setNewDomain(''); }}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Cancel
            </button>
          </div>
          {createDomain.isError && (
            <p className="text-sm text-red-600 mt-2">
              Failed to setup domain. Please check the domain format and try again.
            </p>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Enter your domain without http:// or www (e.g., landing.example.com)
          </p>
        </div>
      )}

      {thisPageHasDomain && used >= limit && limit > 1 && (
        <p className="text-sm text-gray-500">
          Using {used} of {limit} custom domains. Remove a domain or upgrade for more.
        </p>
      )}

      {/* Default URL */}
      <div className="border-t border-gray-200 pt-6">
        <h4 className="font-medium text-gray-900 mb-2">Default URL</h4>
        <p className="text-sm text-gray-600">
          Your page is always accessible at:
        </p>
        <a
          href={`/p/${pageSlug}?ws=${workspaceId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:underline text-sm font-mono"
        >
          {window.location.origin}/p/{pageSlug}?ws={workspaceId}
        </a>
      </div>
    </div>
  );
}
