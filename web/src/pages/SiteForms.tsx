import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { usePages } from '../lib/hooks/usePages';
import { useCurrentWorkspace } from '../lib/hooks/useWorkspaces';
import { Loader2 } from 'lucide-react';
import FormsTab from '../components/page-editor/FormsTab';

export default function SiteForms() {
  const { siteId } = useParams<{ siteId: string }>();
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const { data: pages, isLoading: isLoadingPages } = usePages(workspaceId, siteId);

  // Track which page is selected — default to first page
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);

  if (isLoadingWorkspace || isLoadingPages) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (!pages || pages.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Forms</h1>
          <p className="mt-1 text-gray-500">Manage forms across your site's pages.</p>
        </div>
        <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
          <p className="text-gray-500">No pages in this site yet. Create a page first to add forms.</p>
        </div>
      </div>
    );
  }

  const activePageId = selectedPageId || pages[0]?.id;
  const activePage = pages.find(p => p.id === activePageId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Forms</h1>
        <p className="mt-1 text-gray-500">Manage forms across your site's pages.</p>
      </div>

      {/* Page selector (only show if multiple pages) */}
      {pages.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {pages.map(page => (
            <button
              key={page.id}
              onClick={() => setSelectedPageId(page.id)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                page.id === activePageId
                  ? 'bg-primary-50 border-primary-300 text-primary-700 font-medium'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {page.name}
            </button>
          ))}
        </div>
      )}

      {/* Forms for selected page */}
      {activePageId && workspaceId && (
        <div className="bg-white rounded-lg shadow p-6">
          {pages.length > 1 && activePage && (
            <p className="text-sm text-gray-500 mb-4">
              Showing forms for <span className="font-medium text-gray-700">{activePage.name}</span>
            </p>
          )}
          <FormsTab
            workspaceId={workspaceId}
            pageId={activePageId}
          />
        </div>
      )}
    </div>
  );
}
