import { Outlet, useParams, useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useCurrentWorkspace } from '@/lib/hooks/useWorkspaces';
import { useSite } from '@/lib/hooks/useSites';
import { usePages } from '@/lib/hooks/usePages';

/**
 * Layout wrapper for site-scoped routes.
 * Provides site context via URL params (:siteId).
 * The sidebar in AppLayout reads from the URL to determine if we're in a site context.
 *
 * When at the exact path `/sites/:siteId` (no sub-route), redirects to the
 * site's primary page editor.
 */
export default function SiteLayout() {
  const { siteId } = useParams<{ siteId: string }>();
  const { workspaceId } = useCurrentWorkspace();
  const { data: site, isLoading } = useSite(workspaceId, siteId);
  const location = useLocation();
  const navigate = useNavigate();

  // Check if we're at the bare `/sites/:siteId` path (no sub-route)
  const isBareSitePath = location.pathname === `/sites/${siteId}` || location.pathname === `/sites/${siteId}/`;

  // Fetch pages for this site to find the primary page (only when needed for redirect)
  const { data: pages } = usePages(workspaceId, siteId, isBareSitePath);

  // Redirect bare site path to the page editor
  useEffect(() => {
    if (isBareSitePath && pages && pages.length > 0) {
      navigate(`/sites/${siteId}/pages/${pages[0].id}`, { replace: true });
    } else if (isBareSitePath && pages && pages.length === 0) {
      navigate(`/sites/${siteId}/pages`, { replace: true });
    }
  }, [isBareSitePath, pages, siteId, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-semibold text-gray-900">Site not found</h2>
        <p className="mt-1 text-gray-500">The site you're looking for doesn't exist.</p>
      </div>
    );
  }

  return <Outlet />;
}
