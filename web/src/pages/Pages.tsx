import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePages, useDeletePage, useCreatePage, type Page } from '../lib/hooks/usePages';
import { useCurrentWorkspace } from '../lib/hooks/useWorkspaces';
import Modal from '../components/ui/Modal';
import { useToast } from '../components/Toast';

export default function Pages() {
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const { data: pages, isLoading, error, refetch } = usePages(workspaceId);
  const deletePage = useDeletePage(workspaceId || '');
  const createPage = useCreatePage(workspaceId || '');
  const navigate = useNavigate();
  const toast = useToast();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPageName, setNewPageName] = useState('');
  const [newPageSlug, setNewPageSlug] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleCreatePage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPageName.trim() || !newPageSlug.trim()) return;

    try {
      const page = await createPage.mutateAsync({
        name: newPageName,
        slug: newPageSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
        headline: newPageName,
      });
      setShowCreateModal(false);
      setNewPageName('');
      setNewPageSlug('');
      toast.success('Page created successfully');
      navigate(`/pages/${page.id}`);
    } catch (err) {
      console.error('Failed to create page:', err);
      toast.error('Failed to create page. Please try again.');
    }
  };

  const handleDeletePage = async (pageId: string) => {
    try {
      await deletePage.mutateAsync(pageId);
      setDeleteConfirm(null);
      toast.success('Page deleted successfully');
    } catch (err) {
      console.error('Failed to delete page:', err);
      toast.error('Failed to delete page. Please try again.');
    }
  };

  const getStatusBadge = (status: Page['status']) => {
    const styles = {
      draft: 'bg-yellow-100 text-yellow-800',
      published: 'bg-green-100 text-green-800',
      archived: 'bg-gray-100 text-gray-800',
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (isLoadingWorkspace || isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4" />
        <div className="h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <svg className="w-12 h-12 mx-auto text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h3 className="text-lg font-medium text-red-800 mb-1">Failed to load pages</h3>
        <p className="text-red-600 mb-4">Something went wrong while fetching your pages.</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pages</h1>
          <p className="text-gray-600 mt-1">
            Create and manage public landing pages with forms and AI chat.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Create Page
        </button>
      </div>

      {/* Pages List */}
      {pages && pages.length > 0 ? (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  URL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Views
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Submissions
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pages.map((page) => (
                <tr key={page.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      to={`/pages/${page.id}`}
                      className="text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      {page.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <code className="bg-gray-100 px-2 py-1 rounded">
                      /p/{page.slug}
                    </code>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(page.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {page.view_count.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {page.form_submission_count.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={`/p/${page.slug}?ws=${workspaceId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-500 hover:text-gray-700"
                        title="Preview"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </a>
                      <Link
                        to={`/pages/${page.id}`}
                        className="text-indigo-600 hover:text-indigo-800"
                        title="Edit"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </Link>
                      <button
                        onClick={() => setDeleteConfirm(page.id)}
                        className="text-red-500 hover:text-red-700"
                        title="Delete"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg
            className="w-16 h-16 mx-auto text-gray-400 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No pages yet</h3>
          <p className="text-gray-600 mb-6">
            Create your first landing page to start capturing leads.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Create Your First Page
          </button>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create New Page"
      >
        <form onSubmit={handleCreatePage} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Page Name
            </label>
            <input
              type="text"
              value={newPageName}
              onChange={(e) => {
                setNewPageName(e.target.value);
                setNewPageSlug(
                  e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-')
                );
              }}
              placeholder="My Landing Page"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL Slug
            </label>
            <div className="flex items-center">
              <span className="text-gray-500 mr-1">/p/</span>
              <input
                type="text"
                value={newPageSlug}
                onChange={(e) =>
                  setNewPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                }
                placeholder="my-landing-page"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
                pattern="[a-z0-9-]+"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={() => setShowCreateModal(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createPage.isPending}
              className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {createPage.isPending ? 'Creating...' : 'Create Page'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Page"
      >
        <p className="text-gray-600 mb-6">
          Are you sure you want to delete this page? This action cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setDeleteConfirm(null)}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => deleteConfirm && handleDeletePage(deleteConfirm)}
            disabled={deletePage.isPending}
            className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {deletePage.isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
