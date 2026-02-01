import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePage, useUpdatePage, useGeneratePage, checkSubdomainAvailability, type UpdatePageInput, type ChatConfig, type GeneratePageInput } from '../lib/hooks/usePages';
import { usePageForms, useCreatePageForm, useDeletePageForm, type Form, type FormField } from '../lib/hooks/useForms';
import { usePageWorkflows, useDeletePageWorkflow } from '../lib/hooks/useWorkflows';
import { useCurrentWorkspace } from '../lib/hooks/useWorkspaces';
import { useDomains, useCreateDomain, useDeleteDomain, getDomainStatusInfo } from '../lib/hooks/useDomains';
import { useToast } from '../components/Toast';
import FormBuilder from '../components/FormBuilder';
import { PageBuilderCanvas, PageBlock } from '../components/page-builder';
import { Plus, Trash2, GitBranch, ExternalLink } from 'lucide-react';

// Extract subdomain suffix from API URL (e.g., "dev.complens.ai" from "https://api.dev.complens.ai")
const API_URL = import.meta.env.VITE_API_URL || 'https://api.dev.complens.ai';
const SUBDOMAIN_SUFFIX = API_URL.replace(/^https?:\/\/api\./, '');

type Tab = 'content' | 'forms' | 'workflows' | 'chat' | 'design' | 'seo' | 'domain';

export default function PageEditor() {
  const { id: pageId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { workspaceId } = useCurrentWorkspace();
  const toast = useToast();

  const { data: page, isLoading } = usePage(workspaceId, pageId);
  const { data: pageForms } = usePageForms(workspaceId, pageId);
  const { data: pageWorkflows } = usePageWorkflows(workspaceId, pageId);
  const updatePage = useUpdatePage(workspaceId || '', pageId || '');
  const createForm = useCreatePageForm(workspaceId || '', pageId || '');
  const deleteForm = useDeletePageForm(workspaceId || '', pageId || '');
  const deleteWorkflow = useDeletePageWorkflow(workspaceId || '', pageId || '');

  const [activeTab, setActiveTab] = useState<Tab>('content');
  const [formData, setFormData] = useState<UpdatePageInput>({});
  const [hasChanges, setHasChanges] = useState(false);

  // AI Generate modal state
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiInput, setAIInput] = useState<GeneratePageInput>({
    source_content: '',
    template: 'professional',
    target_audience: '',
    call_to_action: '',
    create_form: true,
  });
  const generatePage = useGeneratePage(workspaceId || '');

  // Blocks state for the visual builder
  const [blocks, setBlocks] = useState<PageBlock[]>([]);

  // Initialize form data when page loads
  useEffect(() => {
    if (page) {
      console.log('[PageEditor] Page data received:', {
        id: page.id,
        name: page.name,
        blocks: page.blocks,
        blockCount: page.blocks?.length ?? 0,
      });
      setFormData({
        name: page.name,
        slug: page.slug,
        status: page.status,
        headline: page.headline,
        subheadline: page.subheadline || '',
        hero_image_url: page.hero_image_url || '',
        body_content: page.body_content || '',
        form_ids: page.form_ids,
        chat_config: page.chat_config,
        primary_color: page.primary_color,
        custom_css: page.custom_css || '',
        meta_title: page.meta_title || '',
        meta_description: page.meta_description || '',
        subdomain: page.subdomain || '',
        custom_domain: page.custom_domain || '',
      });
      // Initialize blocks from page data - cast to PageBlock[] to match component types
      const pageBlocks = (page.blocks || []) as PageBlock[];
      console.log('[PageEditor] Setting blocks:', pageBlocks);
      setBlocks(pageBlocks);
    }
  }, [page]);

  const handleChange = <K extends keyof UpdatePageInput>(
    key: K,
    value: UpdatePageInput[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleChatConfigChange = <K extends keyof ChatConfig>(
    key: K,
    value: ChatConfig[K]
  ) => {
    setFormData((prev) => ({
      ...prev,
      chat_config: { ...prev.chat_config, [key]: value } as ChatConfig,
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      const payload = {
        ...formData,
        blocks: blocks,
      };
      console.log('[PageEditor] Saving page with payload:', {
        ...payload,
        blockCount: blocks.length,
        blocks: blocks.map(b => ({ id: b.id, type: b.type, order: b.order, width: b.width })),
      });
      const result = await updatePage.mutateAsync(payload);
      console.log('[PageEditor] Save result:', result);
      setHasChanges(false);
      toast.success('Page saved successfully');
    } catch (err: any) {
      console.error('Failed to save page:', err);
      // Extract detailed error message from API response
      const errorMessage = err?.response?.data?.message
        || err?.response?.data?.errors?.map((e: any) => `${e.field}: ${e.message}`).join(', ')
        || err?.message
        || 'Failed to save page. Please try again.';
      toast.error(errorMessage);
    }
  };

  const handleBlocksChange = (newBlocks: PageBlock[]) => {
    setBlocks(newBlocks);
    setHasChanges(true);
  };

  const handlePublish = async () => {
    try {
      await updatePage.mutateAsync({
        ...formData,
        blocks: blocks as any,
        status: 'published' as const,
      });
      setHasChanges(false);
      toast.success('Page published successfully');
    } catch (err: any) {
      console.error('Failed to publish page:', err);
      const errorMessage = err?.response?.data?.message
        || err?.response?.data?.errors?.map((e: any) => `${e.field}: ${e.message}`).join(', ')
        || err?.message
        || 'Failed to publish page. Please try again.';
      toast.error(errorMessage);
    }
  };

  const handleAIGenerate = async () => {
    if (!aiInput.source_content.trim()) return;

    try {
      const generated = await generatePage.mutateAsync(aiInput);

      // Apply generated content to form
      setFormData((prev) => ({
        ...prev,
        name: generated.name,
        slug: generated.slug,
        headline: generated.headline,
        subheadline: generated.subheadline || '',
        body_content: generated.body_content,
        primary_color: generated.primary_color,
        hero_image_url: generated.hero_image_url || prev.hero_image_url || '',
        meta_title: generated.meta_title || '',
        meta_description: generated.meta_description || '',
        // Auto-attach generated form
        form_ids: generated.form_ids || prev.form_ids || [],
        chat_config: {
          ...prev.chat_config,
          enabled: true,
          position: 'bottom-right',
          initial_message: generated.chat_config.initial_message || prev.chat_config?.initial_message || null,
          ai_persona: generated.chat_config.ai_persona || prev.chat_config?.ai_persona || null,
        } as ChatConfig,
      }));

      setHasChanges(true);
      setShowAIModal(false);
      setAIInput({ source_content: '', template: 'professional', target_audience: '', call_to_action: '', create_form: true });
      toast.success('Page content generated! Review and save your changes.');
    } catch (err) {
      console.error('AI generation failed:', err);
      toast.error('AI generation failed. Please try again.');
    }
  };

  // Form builder state
  const [editingForm, setEditingForm] = useState<Form | null>(null);
  const [showFormBuilder, setShowFormBuilder] = useState(false);
  const [formBuilderData, setFormBuilderData] = useState<{
    name: string;
    fields: FormField[];
    submitButtonText: string;
    successMessage: string;
  }>({
    name: 'New Form',
    fields: [],
    submitButtonText: 'Submit',
    successMessage: 'Thank you for your submission!',
  });

  const handleCreateForm = async () => {
    try {
      await createForm.mutateAsync({
        name: formBuilderData.name,
        fields: formBuilderData.fields,
        submit_button_text: formBuilderData.submitButtonText,
        success_message: formBuilderData.successMessage,
        create_contact: true,
        trigger_workflow: true,
      });
      setShowFormBuilder(false);
      setFormBuilderData({
        name: 'New Form',
        fields: [],
        submitButtonText: 'Submit',
        successMessage: 'Thank you for your submission!',
      });
      toast.success('Form created successfully');
    } catch (err) {
      console.error('Failed to create form:', err);
      toast.error('Failed to create form');
    }
  };

  const handleDeleteForm = async (formId: string) => {
    if (!confirm('Are you sure you want to delete this form?')) return;
    try {
      await deleteForm.mutateAsync(formId);
      toast.success('Form deleted');
    } catch (err) {
      console.error('Failed to delete form:', err);
      toast.error('Failed to delete form');
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (!confirm('Are you sure you want to delete this workflow?')) return;
    try {
      await deleteWorkflow.mutateAsync(workflowId);
      toast.success('Workflow deleted');
    } catch (err) {
      console.error('Failed to delete workflow:', err);
      toast.error('Failed to delete workflow');
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4" />
        <div className="h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!page) {
    return (
      <div className="bg-red-50 text-red-600 rounded-lg p-4">
        Page not found.{' '}
        <Link to="/pages" className="underline">
          Go back to pages
        </Link>
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'content', label: 'Content' },
    { id: 'forms', label: `Forms${pageForms?.length ? ` (${pageForms.length})` : ''}` },
    { id: 'workflows', label: `Workflows${pageWorkflows?.length ? ` (${pageWorkflows.length})` : ''}` },
    { id: 'chat', label: 'Chat' },
    { id: 'design', label: 'Design' },
    { id: 'seo', label: 'SEO' },
    { id: 'domain', label: 'Domain' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/pages')}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{page.name}</h1>
            <p className="text-gray-500 text-sm">/p/{page.slug}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAIModal(true)}
            className="px-4 py-2 border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            AI Generate
          </button>
          <a
            href={`/p/${page.slug}?ws=${workspaceId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Preview
          </a>
          <button
            onClick={handleSave}
            disabled={!hasChanges || updatePage.isPending}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {updatePage.isPending ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={handlePublish}
            disabled={updatePage.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {page.status === 'published' ? 'Update' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className={activeTab === 'content' ? '' : 'bg-white rounded-lg shadow p-6'}>
        {activeTab === 'content' && (
          <div className="space-y-4">
            {/* Page metadata bar */}
            <div className="bg-white rounded-lg shadow p-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Page Name
                  </label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL Slug
                  </label>
                  <div className="flex items-center">
                    <span className="text-gray-500 text-sm mr-1">/p/</span>
                    <input
                      type="text"
                      value={formData.slug || ''}
                      onChange={(e) =>
                        handleChange('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                      }
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.primary_color || '#6366f1'}
                      onChange={(e) => handleChange('primary_color', e.target.value)}
                      className="w-10 h-9 rounded cursor-pointer border-0"
                    />
                    <input
                      type="text"
                      value={formData.primary_color || '#6366f1'}
                      onChange={(e) => handleChange('primary_color', e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Page Builder */}
            <PageBuilderCanvas
              blocks={blocks}
              onChange={handleBlocksChange}
              forms={pageForms?.map((f: Form) => ({ id: f.id, name: f.name })) || []}
            />

            {/* Legacy content info */}
            {formData.body_content && blocks.length === 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> This page has legacy HTML content. Add blocks above to use the visual builder.
                  Legacy content will still be rendered on the public page until you switch to blocks.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'forms' && (
          <div className="space-y-6">
            {/* Form Builder Modal */}
            {showFormBuilder ? (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">
                    {editingForm ? 'Edit Form' : 'Create New Form'}
                  </h3>
                  <button
                    onClick={() => {
                      setShowFormBuilder(false);
                      setEditingForm(null);
                    }}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Form Name
                  </label>
                  <input
                    type="text"
                    value={formBuilderData.name}
                    onChange={(e) => setFormBuilderData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <FormBuilder
                  fields={formBuilderData.fields}
                  onChange={(fields) => setFormBuilderData(prev => ({ ...prev, fields }))}
                  submitButtonText={formBuilderData.submitButtonText}
                  onSubmitButtonTextChange={(text) => setFormBuilderData(prev => ({ ...prev, submitButtonText: text }))}
                  successMessage={formBuilderData.successMessage}
                  onSuccessMessageChange={(msg) => setFormBuilderData(prev => ({ ...prev, successMessage: msg }))}
                />

                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    onClick={() => {
                      setShowFormBuilder(false);
                      setEditingForm(null);
                    }}
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateForm}
                    disabled={createForm.isPending || !formBuilderData.name.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {createForm.isPending ? 'Creating...' : 'Create Form'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-gray-600">
                    Forms capture visitor information and can trigger workflows.
                  </p>
                  <button
                    onClick={() => setShowFormBuilder(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    <Plus className="w-4 h-4" />
                    Add Form
                  </button>
                </div>

                {pageForms && pageForms.length > 0 ? (
                  <div className="space-y-3">
                    {pageForms.map((form) => (
                      <div
                        key={form.id}
                        className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-gray-300"
                      >
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{form.name}</p>
                          <p className="text-sm text-gray-500">
                            {form.fields.length} fields • {form.submission_count} submissions
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDeleteForm(form.id)}
                            className="p-2 text-gray-400 hover:text-red-500"
                            title="Delete form"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                    <p className="text-gray-500 mb-2">No forms on this page yet</p>
                    <button
                      onClick={() => setShowFormBuilder(true)}
                      className="text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Create your first form
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'workflows' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <p className="text-gray-600">
                Page-specific workflows that trigger from this page's forms or events.
              </p>
              <Link
                to={`/workflows/new?pageId=${pageId}`}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                <Plus className="w-4 h-4" />
                Add Workflow
              </Link>
            </div>

            {pageWorkflows && pageWorkflows.length > 0 ? (
              <div className="space-y-3">
                {pageWorkflows.map((workflow) => (
                  <div
                    key={workflow.id}
                    className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-gray-300"
                  >
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <GitBranch className="w-5 h-5 text-purple-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{workflow.name}</p>
                      <p className="text-sm text-gray-500">
                        Status: {workflow.status} • {workflow.nodes?.length || 0} nodes
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/workflows/${workflow.id}`}
                        className="p-2 text-gray-400 hover:text-indigo-600"
                        title="Edit workflow"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handleDeleteWorkflow(workflow.id)}
                        className="p-2 text-gray-400 hover:text-red-500"
                        title="Delete workflow"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
                <p className="text-gray-500 mb-2">No workflows for this page yet</p>
                <Link
                  to={`/workflows/new?pageId=${pageId}`}
                  className="text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  Create your first workflow
                </Link>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Tip:</strong> Workspace-level workflows (not attached to a page) can be managed from the{' '}
                <Link to="/workflows" className="underline hover:text-blue-900">
                  Workflows page
                </Link>
                .
              </p>
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900">AI Chat Widget</h3>
                <p className="text-sm text-gray-500">
                  Enable visitors to chat with an AI assistant on this page.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.chat_config?.enabled ?? true}
                  onChange={(e) => handleChatConfigChange('enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
              </label>
            </div>

            {formData.chat_config?.enabled !== false && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Widget Position
                  </label>
                  <select
                    value={formData.chat_config?.position || 'bottom-right'}
                    onChange={(e) => handleChatConfigChange('position', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Initial Message
                  </label>
                  <input
                    type="text"
                    value={formData.chat_config?.initial_message || ''}
                    onChange={(e) =>
                      handleChatConfigChange('initial_message', e.target.value || null)
                    }
                    placeholder="Hi! How can I help you today?"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    AI Persona Instructions
                  </label>
                  <textarea
                    value={formData.chat_config?.ai_persona || ''}
                    onChange={(e) =>
                      handleChatConfigChange('ai_persona', e.target.value || null)
                    }
                    placeholder="You are a helpful assistant for our company. Be friendly and professional..."
                    rows={4}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'design' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Primary Color
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={formData.primary_color || '#6366f1'}
                  onChange={(e) => handleChange('primary_color', e.target.value)}
                  className="w-12 h-10 rounded cursor-pointer border-0"
                />
                <input
                  type="text"
                  value={formData.primary_color || '#6366f1'}
                  onChange={(e) => handleChange('primary_color', e.target.value)}
                  className="w-32 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Custom CSS
              </label>
              <textarea
                value={formData.custom_css || ''}
                onChange={(e) => handleChange('custom_css', e.target.value)}
                placeholder=".my-class { color: red; }"
                rows={8}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
              />
            </div>
          </div>
        )}

        {activeTab === 'seo' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meta Title
              </label>
              <input
                type="text"
                value={formData.meta_title || ''}
                onChange={(e) => handleChange('meta_title', e.target.value)}
                placeholder="Page Title | Company Name"
                maxLength={70}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {(formData.meta_title || '').length}/70 characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meta Description
              </label>
              <textarea
                value={formData.meta_description || ''}
                onChange={(e) => handleChange('meta_description', e.target.value)}
                placeholder="A brief description of this page for search engines..."
                maxLength={160}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {(formData.meta_description || '').length}/160 characters
              </p>
            </div>
          </div>
        )}

        {activeTab === 'domain' && (
          <DomainTab
            workspaceId={workspaceId || ''}
            pageId={pageId || ''}
            pageSlug={page.slug}
            subdomain={formData.subdomain ?? page.subdomain ?? ''}
            onSubdomainChange={(subdomain) => handleChange('subdomain', subdomain)}
            onSave={handleSave}
            isSaving={updatePage.isPending}
          />
        )}
      </div>

      {/* AI Generate Modal */}
      {showAIModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">AI Page Generator</h2>
                    <p className="text-sm text-gray-500">Paste any content and let AI create your landing page</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAIModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Source Content <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={aiInput.source_content}
                  onChange={(e) => setAIInput((prev) => ({ ...prev, source_content: e.target.value }))}
                  placeholder="Paste your resume, business description, product info, service offerings, event details, or any content you want to turn into a landing page..."
                  rows={10}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The AI will analyze this content and generate headlines, copy, and structure for your page.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Choose Template
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    type="button"
                    onClick={() => setAIInput((prev) => ({ ...prev, template: 'professional' }))}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      aiInput.template === 'professional'
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 mb-2" />
                    <div className="font-medium text-gray-900">Professional</div>
                    <div className="text-xs text-gray-500">Clean & modern</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAIInput((prev) => ({ ...prev, template: 'bold' }))}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      aiInput.template === 'bold'
                        ? 'border-amber-500 bg-amber-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-red-500 mb-2" />
                    <div className="font-medium text-gray-900">Bold</div>
                    <div className="text-xs text-gray-500">High impact</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAIInput((prev) => ({ ...prev, template: 'minimal' }))}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${
                      aiInput.template === 'minimal'
                        ? 'border-sky-500 bg-sky-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-400 to-sky-600 mb-2" />
                    <div className="font-medium text-gray-900">Minimal</div>
                    <div className="text-xs text-gray-500">Simple & elegant</div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Audience
                  </label>
                  <input
                    type="text"
                    value={aiInput.target_audience || ''}
                    onChange={(e) => setAIInput((prev) => ({ ...prev, target_audience: e.target.value }))}
                    placeholder="e.g., Small business owners, Tech recruiters"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Primary Call to Action
                  </label>
                  <input
                    type="text"
                    value={aiInput.call_to_action || ''}
                    onChange={(e) => setAIInput((prev) => ({ ...prev, call_to_action: e.target.value }))}
                    placeholder="e.g., Book a call, Get started"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aiInput.create_form !== false}
                    onChange={(e) => setAIInput((prev) => ({ ...prev, create_form: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600" />
                </label>
                <div>
                  <span className="text-sm font-medium text-gray-700">Create Lead Capture Form</span>
                  <p className="text-xs text-gray-500">Auto-generate a contact form for collecting leads</p>
                </div>
              </div>

            </div>

            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setShowAIModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleAIGenerate}
                disabled={!aiInput.source_content.trim() || generatePage.isPending}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
              >
                {generatePage.isPending ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Generating...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Generate Page
                  </>
                )}
              </button>
            </div>

            {generatePage.isError && (
              <div className="px-6 pb-6">
                <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
                  Failed to generate page. Please try again.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Domain Tab Component
interface DomainTabProps {
  workspaceId: string;
  pageId: string;
  pageSlug: string;
  subdomain: string;
  onSubdomainChange: (subdomain: string) => void;
  onSave: () => void;
  isSaving: boolean;
}

function DomainTab({
  workspaceId,
  pageId,
  pageSlug,
  subdomain,
  onSubdomainChange,
  onSave,
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
    onSubdomainChange(subdomainInput);
    // Trigger save after state update
    setTimeout(onSave, 0);
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
