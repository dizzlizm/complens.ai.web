import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSites, useDeleteSite } from '../lib/hooks/useSites';
import { useCurrentWorkspace } from '../lib/hooks/useWorkspaces';
import { useDomains, useCreateDomain, useDeleteDomain, getDomainStatusInfo } from '../lib/hooks/useDomains';
import { getApiErrorMessage } from '../lib/api';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/Toast';
import {
  Globe, Trash2, ArrowRight, Search, Settings, Copy, Check, RefreshCw,
  Loader2, AlertCircle,
} from 'lucide-react';

export default function Sites() {
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const { data: sites, isLoading, error } = useSites(workspaceId);
  const deleteSite = useDeleteSite(workspaceId || '');
  const { data: domainsData } = useDomains(workspaceId);
  const createDomain = useCreateDomain(workspaceId || '');
  const deleteDomain = useDeleteDomain(workspaceId || '');
  const navigate = useNavigate();
  const toast = useToast();

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [domainInputs, setDomainInputs] = useState<Record<string, string>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [connectingSiteId, setConnectingSiteId] = useState<string | null>(null);
  const [confirmDeleteDomain, setConfirmDeleteDomain] = useState<string | null>(null);

  const provisionedDomains = domainsData?.items || [];

  // Auto-navigate to the single site if there's exactly one
  useEffect(() => {
    if (!isLoading && sites && sites.length === 1) {
      navigate(`/sites/${sites[0].id}/pages`, { replace: true });
    }
  }, [isLoading, sites, navigate]);

  const handleDeleteSite = async (siteId: string) => {
    try {
      await deleteSite.mutateAsync(siteId);
      setDeleteConfirm(null);
      toast.success('Site deleted successfully');
    } catch (err) {
      toast.error('Failed to delete site. Please try again.');
    }
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleConnectDomain = async (siteId: string) => {
    const domainName = (domainInputs[siteId] || '').trim().toLowerCase();
    if (!domainName || !domainName.includes('.')) return;

    setConnectingSiteId(siteId);
    try {
      await createDomain.mutateAsync({ domain: domainName, site_id: siteId });
    } catch {
      // Error handled by mutation state
    } finally {
      setConnectingSiteId(null);
    }
  };

  const handleDeleteDomain = (domain: string) => {
    if (confirmDeleteDomain === domain) {
      deleteDomain.mutate(domain);
      setConfirmDeleteDomain(null);
    } else {
      setConfirmDeleteDomain(domain);
    }
  };

  const filteredSites = sites?.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.domain_name && s.domain_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (isLoadingWorkspace || isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load sites. Please try again.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sites</h1>
          <p className="mt-1 text-gray-500">
            Organize your pages, workflows, and content by domain.
          </p>
        </div>
      </div>

      {/* Search */}
      {sites && sites.length > 0 && (
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search sites..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      )}

      {/* Empty state — should rarely appear since backend auto-creates a default site */}
      {(!sites || sites.length === 0) && (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <Globe className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No sites yet</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Your first site will be created automatically. Try refreshing the page.
          </p>
          <button
            onClick={() => navigate('/settings/domains')}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Manage Domains
          </button>
        </div>
      )}

      {/* Sites grid */}
      {filteredSites && filteredSites.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSites.map((site) => {
            const domainSetup = provisionedDomains.find((d) => d.site_id === site.id);
            const statusInfo = domainSetup ? getDomainStatusInfo(domainSetup.status) : null;
            const isConnecting = connectingSiteId === site.id;
            const domainInput = domainInputs[site.id] ?? site.domain_name ?? '';

            return (
              <div
                key={site.id}
                className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow group"
              >
                <div
                  className="cursor-pointer"
                  onClick={() => navigate(`/sites/${site.id}/pages`)}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
                        <Globe className="w-5 h-5 text-primary-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{site.name}</h3>
                        {site.domain_name && (
                          <p className="text-sm text-gray-500">{site.domain_name}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm(site.id);
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete site"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  {site.description && (
                    <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                      {site.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-sm text-gray-400">
                    <span>
                      Created {new Date(site.created_at).toLocaleDateString()}
                    </span>
                    <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>

                {/* Custom Domain Section */}
                <div className="mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
                  {/* No domain provisioned yet — show input field */}
                  {!domainSetup && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Custom Domain</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          className="input flex-1 text-sm"
                          placeholder="example.com"
                          value={domainInput}
                          onChange={(e) => setDomainInputs((prev) => ({ ...prev, [site.id]: e.target.value }))}
                          onKeyDown={(e) => e.key === 'Enter' && handleConnectDomain(site.id)}
                        />
                        <button
                          onClick={() => handleConnectDomain(site.id)}
                          disabled={isConnecting || !domainInput.trim() || !domainInput.includes('.')}
                          className="btn btn-primary btn-sm inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          {isConnecting ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Globe className="w-3.5 h-3.5" />
                          )}
                          Connect
                        </button>
                      </div>
                      {createDomain.isError && connectingSiteId === site.id && (
                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          {getApiErrorMessage(createDomain.error, 'Failed to set up domain')}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Domain status badge */}
                  {domainSetup && statusInfo && (
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-500 font-medium">{domainSetup.domain}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.bgColor} ${statusInfo.color}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                  )}

                  {/* Pending validation — show CNAME record */}
                  {domainSetup && domainSetup.status === 'pending_validation' && domainSetup.validation_record_name && (
                    <div className="space-y-2">
                      <p className="text-xs text-amber-700">
                        Add this CNAME record to verify <strong>{domainSetup.domain}</strong>:
                      </p>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-2 space-y-1.5">
                        <div>
                          <label className="block text-xs text-gray-500 mb-0.5">Name</label>
                          <div className="flex items-center gap-1">
                            <code className="flex-1 text-xs bg-white rounded px-2 py-1 font-mono text-gray-800 break-all border border-gray-100">
                              {domainSetup.validation_record_name}
                            </code>
                            <button
                              onClick={() => handleCopy(domainSetup.validation_record_name!, `${site.id}-name`)}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded shrink-0"
                              title="Copy"
                            >
                              {copiedField === `${site.id}-name` ? (
                                <Check className="w-3 h-3 text-green-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-0.5">Value</label>
                          <div className="flex items-center gap-1">
                            <code className="flex-1 text-xs bg-white rounded px-2 py-1 font-mono text-gray-800 break-all border border-gray-100">
                              {domainSetup.validation_record_value}
                            </code>
                            <button
                              onClick={() => handleCopy(domainSetup.validation_record_value!, `${site.id}-value`)}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded shrink-0"
                              title="Copy"
                            >
                              {copiedField === `${site.id}-value` ? (
                                <Check className="w-3 h-3 text-green-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-gray-500">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Checking DNS...
                      </div>
                    </div>
                  )}

                  {/* Provisioning — distribution deploying */}
                  {domainSetup && domainSetup.status === 'provisioning' && (
                    <div className="flex items-center gap-2 text-xs text-indigo-700">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {domainSetup.status_message || 'CDN deploying globally...'}
                    </div>
                  )}

                  {/* Active — show CNAME target */}
                  {domainSetup && domainSetup.status === 'active' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs text-green-700">
                        <Check className="w-3.5 h-3.5" />
                        <span className="font-medium">{domainSetup.domain} is live</span>
                      </div>
                      {domainSetup.cname_target && (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-2">
                          <p className="text-xs text-gray-500 mb-0.5">CNAME target:</p>
                          <div className="flex items-center gap-1">
                            <code className="flex-1 text-xs bg-white rounded px-2 py-1 font-mono text-gray-800 break-all border border-gray-100">
                              {domainSetup.cname_target}
                            </code>
                            <button
                              onClick={() => handleCopy(domainSetup.cname_target!, `${site.id}-cname`)}
                              className="p-1 text-gray-400 hover:text-gray-600 rounded shrink-0"
                              title="Copy"
                            >
                              {copiedField === `${site.id}-cname` ? (
                                <Check className="w-3 h-3 text-green-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Failed — show error with retry */}
                  {domainSetup && domainSetup.status === 'failed' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5 text-xs text-red-600">
                        <AlertCircle className="w-3.5 h-3.5" />
                        {domainSetup.status_message || 'Domain setup failed'}
                      </div>
                      <button
                        onClick={() => {
                          deleteDomain.mutate(domainSetup.domain, {
                            onSuccess: () => handleConnectDomain(site.id),
                          });
                        }}
                        disabled={deleteDomain.isPending || createDomain.isPending}
                        className="btn btn-secondary btn-sm text-xs inline-flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" />
                        Retry
                      </button>
                    </div>
                  )}

                  {/* Remove domain button for provisioned domains */}
                  {domainSetup && domainSetup.status !== 'failed' && (
                    <div className="mt-2">
                      <button
                        onClick={() => handleDeleteDomain(domainSetup.domain)}
                        className={`text-xs px-2.5 py-1 rounded-md transition-colors inline-flex items-center gap-1 ${
                          confirmDeleteDomain === domainSetup.domain
                            ? 'bg-red-100 text-red-700'
                            : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600'
                        }`}
                      >
                        <Trash2 className="w-3 h-3" />
                        {confirmDeleteDomain === domainSetup.domain ? 'Confirm remove' : 'Remove'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <Modal isOpen={!!deleteConfirm} onClose={() => setDeleteConfirm(null)} title="Delete Site">
          <p className="text-gray-600 mb-6">
            Are you sure you want to delete this site? This won't delete the pages
            and workflows within it - they'll become unassigned.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={() => handleDeleteSite(deleteConfirm)}
              disabled={deleteSite.isPending}
              className="btn bg-red-600 text-white hover:bg-red-700"
            >
              {deleteSite.isPending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
