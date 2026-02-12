import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentWorkspace } from '@/lib/hooks/useWorkspaces';
import { useSites } from '@/lib/hooks/useSites';
import { Globe, ChevronsUpDown, Check } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

/**
 * Domain picker dropdown shown in the sidebar when inside a site route.
 * Allows quick switching between sites while preserving the current sub-route.
 */
export default function SiteSwitcher() {
  const { siteId } = useParams<{ siteId: string }>();
  const { workspaceId } = useCurrentWorkspace();
  const { data: sites } = useSites(workspaceId);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentSite = sites?.find((s) => s.id === siteId);

  if (!sites || sites.length === 0) return null;

  const handleSwitch = (newSiteId: string) => {
    // Invalidate site-scoped caches so new site gets fresh data
    queryClient.removeQueries({ queryKey: ['pages', workspaceId] });
    queryClient.removeQueries({ queryKey: ['workflows', workspaceId] });
    queryClient.removeQueries({ queryKey: ['kb-documents', workspaceId] });
    queryClient.removeQueries({ queryKey: ['kb-status', workspaceId] });
    queryClient.removeQueries({ queryKey: ['businessProfile', workspaceId] });
    queryClient.removeQueries({ queryKey: ['site', workspaceId] });

    // Preserve the current sub-route (e.g., /pages, /workflows)
    const match = location.pathname.match(/\/sites\/[^/]+(\/.*)$/);
    const subRoute = match?.[1] || '/pages';
    navigate(`/sites/${newSiteId}${subRoute}`);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg hover:bg-gray-100 transition-colors"
      >
        <Globe className="w-4 h-4 text-primary-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-700 truncate block">
            {currentSite?.name || 'Select site'}
          </span>
          {currentSite?.domain_name && (
            <span className="text-xs text-gray-400 truncate block">
              {currentSite.domain_name}
            </span>
          )}
        </div>
        <ChevronsUpDown className="w-4 h-4 text-gray-400 flex-shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 max-h-60 overflow-auto">
          {sites.map((site) => (
            <button
              key={site.id}
              onClick={() => handleSwitch(site.id)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <span className="text-gray-700 truncate block">{site.name}</span>
                {site.domain_name && (
                  <span className="text-xs text-gray-400 truncate block">
                    {site.domain_name}
                  </span>
                )}
              </div>
              {site.id === siteId && (
                <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
