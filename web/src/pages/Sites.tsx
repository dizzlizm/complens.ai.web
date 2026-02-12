import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSites, useDeleteSite } from '../lib/hooks/useSites';
import { useCurrentWorkspace } from '../lib/hooks/useWorkspaces';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/Toast';
import { Globe, Trash2, ArrowRight, Search, Settings } from 'lucide-react';

export default function Sites() {
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const { data: sites, isLoading, error } = useSites(workspaceId);
  const deleteSite = useDeleteSite(workspaceId || '');
  const navigate = useNavigate();
  const toast = useToast();

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

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
          {filteredSites.map((site) => (
            <div
              key={site.id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow group cursor-pointer"
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
          ))}
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
