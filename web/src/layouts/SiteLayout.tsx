import { Outlet, useParams } from 'react-router-dom';
import { useCurrentWorkspace } from '@/lib/hooks/useWorkspaces';
import { useSite } from '@/lib/hooks/useSites';

/**
 * Layout wrapper for site-scoped routes.
 * Provides site context via URL params (:siteId).
 * The sidebar in AppLayout reads from the URL to determine if we're in a site context.
 */
export default function SiteLayout() {
  const { siteId } = useParams<{ siteId: string }>();
  const { workspaceId } = useCurrentWorkspace();
  const { data: site, isLoading } = useSite(workspaceId, siteId);

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
