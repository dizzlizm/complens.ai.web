import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePage, useUpdatePage, type UpdatePageInput, type PageLayout } from '../lib/hooks/usePages';
import { usePageForms, type Form } from '../lib/hooks/useForms';
import { useCurrentWorkspace } from '../lib/hooks/useWorkspaces';
import {
  useBusinessProfile,
  GeneratedPageContent,
  AutomationConfig,
} from '../lib/hooks/useAI';
import { useToast } from '../components/Toast';
import { PageBlock, AgenticPageBuilder, ContentTabV2 } from '../components/page-builder';
import { Loader2 } from 'lucide-react';

// Auto-save delay in milliseconds
const AUTO_SAVE_DELAY = 3000;

// Subdomain suffix for page URLs (e.g., "dev.complens.ai" or "complens.ai")
const SUBDOMAIN_SUFFIX = import.meta.env.VITE_SUBDOMAIN_SUFFIX
  || (import.meta.env.VITE_API_URL || '').replace(/^https?:\/\/api\./, '')
  || 'complens.ai';

export default function PageEditor() {
  const { id: pageId, siteId } = useParams<{ id: string; siteId: string }>();
  const navigate = useNavigate();
  const { workspaceId } = useCurrentWorkspace();
  const toast = useToast();

  const { data: page, isLoading } = usePage(workspaceId, pageId);
  const { data: pageForms } = usePageForms(workspaceId, pageId);
  const updatePage = useUpdatePage(workspaceId || '', pageId || '');

  // AI Profile hook - only for profile score in ContentTabV2
  const { data: profile } = useBusinessProfile(workspaceId, pageId, siteId);

  const [formData, setFormData] = useState<UpdatePageInput>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // AI Generate modal state - using agentic chat-based builder
  const [showAIGenerator, setShowAIGenerator] = useState(false);

  // Blocks state for the visual builder
  const [blocks, setBlocks] = useState<PageBlock[]>([]);

  // Auto-save timer ref
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track latest form/blocks data for auto-save callback
  const formDataRef = useRef(formData);
  const blocksRef = useRef(blocks);
  formDataRef.current = formData;
  blocksRef.current = blocks;

  // Auto-save function
  const performAutoSave = useCallback(async () => {
    if (!workspaceId || !pageId) return;

    setAutoSaveStatus('saving');
    try {
      await updatePage.mutateAsync({
        ...formDataRef.current,
        blocks: blocksRef.current,
      });
      setHasChanges(false);
      setAutoSaveStatus('saved');
      // Reset to idle after showing "saved" briefly
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch (err) {
      setAutoSaveStatus('error');
    }
  }, [workspaceId, pageId, updatePage]);

  // Auto-save effect - triggers after changes with debounce.
  // Uses formData/blocks as deps so the timer resets on each edit (proper debounce).
  // Does NOT depend on `page` — that changes after every save and would restart the timer.
  useEffect(() => {
    if (!hasChanges) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, AUTO_SAVE_DELAY);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [hasChanges, formData, blocks, performAutoSave]);

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  // Track if we've done initial load
  const initialLoadDone = useRef(false);

  // Reset state when pageId changes (navigating to different page)
  useEffect(() => {
    initialLoadDone.current = false;
  }, [pageId]);

  // Initialize form data and blocks when page first loads (or when navigating to a different page).
  // This must NOT re-run on every `page` refetch (e.g. after auto-save),
  // otherwise it overwrites the user's local edits and causes focus loss.
  useEffect(() => {
    if (page && !initialLoadDone.current) {
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
        secondary_color: page.secondary_color || '#8b5cf6',
        accent_color: page.accent_color || '#f59e0b',
        custom_css: page.custom_css || '',
        // SEO fields
        meta_title: page.meta_title || '',
        meta_description: page.meta_description || '',
        og_image_url: page.og_image_url || '',
        // Scripts & Tracking
        ga_tracking_id: page.ga_tracking_id || '',
        fb_pixel_id: page.fb_pixel_id || '',
        scripts_head: page.scripts_head || '',
        scripts_body: page.scripts_body || '',
        // Domain
        subdomain: page.subdomain || '',
        custom_domain: page.custom_domain || '',
        // Theme
        theme: page.theme || {},
      });
      setBlocks((page.blocks || []) as PageBlock[]);
      initialLoadDone.current = true;
    }
  }, [page]);

  const handleChange = <K extends keyof UpdatePageInput>(
    key: K,
    value: UpdatePageInput[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      await updatePage.mutateAsync({
        ...formData,
        blocks: blocks,
      });
      setHasChanges(false);
      toast.success('Page saved successfully');
    } catch (err: any) {
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
      setFormData((prev) => ({ ...prev, status: 'published' }));
      setHasChanges(false);
      toast.success('Page published successfully');
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message
        || err?.response?.data?.errors?.map((e: any) => `${e.field}: ${e.message}`).join(', ')
        || err?.message
        || 'Failed to publish page. Please try again.';
      toast.error(errorMessage);
    }
  };

  // Handle AI-generated content from the new agentic page builder
  const handleAIGeneratedBlocks = (result: {
    blocks: PageBlock[];
    content: GeneratedPageContent;
    style: 'professional' | 'bold' | 'minimal' | 'playful';
    colors: { primary: string; secondary: string; accent: string };
    automation: AutomationConfig;
    includeForm: boolean;
    includeChat: boolean;
    createdPage?: { page: { id: string; name: string; slug: string }; form?: unknown; workflow?: unknown; updated?: boolean };
  }) => {
    setShowAIGenerator(false);

    // Check if this was an update to the current page (update mode)
    if (result.createdPage?.updated) {
      const features = [];
      if (result.blocks.length > 0) features.push(`${result.blocks.length} sections`);
      if (result.createdPage.form) features.push('lead capture form');
      if (result.createdPage.workflow) features.push('automation workflow');
      if (result.includeChat) features.push('chat widget');

      toast.success(`Page updated with AI! Features: ${features.join(', ')}.`);
      setHasChanges(false);
      return;
    }

    // If a new page was created, navigate to it
    if (result.createdPage?.page?.id) {
      const features = [];
      if (result.blocks.length > 0) features.push(`${result.blocks.length} sections`);
      if (result.createdPage.form) features.push('lead capture form');
      if (result.createdPage.workflow) features.push('automation workflow');
      if (result.includeChat) features.push('chat widget');

      toast.success(`Page "${result.createdPage.page.name}" created! Features: ${features.join(', ')}.`);
      navigate(`/pages/${result.createdPage.page.id}`);
      return;
    }

    // Fallback: update current page with generated blocks locally (legacy behavior)
    setBlocks(result.blocks.map((b, i) => ({ ...b, order: i })));

    const headline = result.content.content.headlines?.[0] || '';
    const subheadline = result.content.content.hero_subheadline || result.content.content.tagline || '';

    setFormData((prev) => ({
      ...prev,
      headline,
      subheadline,
      body_content: '',
      primary_color: result.colors.primary,
      chat_config: result.includeChat ? {
        enabled: true,
        position: 'bottom-right',
        initial_message: `Hi! How can I help you learn more about ${result.content.business_info?.business_name || formData.name}?`,
        ai_persona: `Helpful assistant for ${result.content.business_info?.business_name || formData.name}`,
      } : prev.chat_config,
    }));

    setHasChanges(true);

    const features = [];
    if (result.blocks.length > 0) features.push(`${result.blocks.length} sections`);
    if (result.includeForm) features.push('lead capture form');
    if (result.automation.send_welcome_email || result.automation.notify_owner) features.push('automation workflow');
    if (result.includeChat) features.push('chat widget');

    toast.success(`Page built with AI! Created: ${features.join(', ')}. Review and save your changes.`);
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
        <Link to="/sites" className="underline">
          Go back to sites
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(siteId ? `/sites/${siteId}/pages` : '/sites')}
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
          <a
            href={
              page.custom_domain
                ? `https://${page.custom_domain}`
                : page.subdomain
                  ? `https://${page.subdomain}.${SUBDOMAIN_SUFFIX}`
                  : `/p/${page.slug}?ws=${workspaceId}`
            }
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
          {/* Auto-save status indicator */}
          <span className="text-sm text-gray-500 flex items-center gap-1">
            {autoSaveStatus === 'saving' && (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Saving...
              </>
            )}
            {autoSaveStatus === 'saved' && (
              <span className="text-green-600">✓ Saved</span>
            )}
            {autoSaveStatus === 'error' && (
              <span className="text-red-600">Save failed</span>
            )}
            {autoSaveStatus === 'idle' && hasChanges && (
              <span className="text-amber-600">Unsaved changes</span>
            )}
          </span>
          <button
            onClick={handleSave}
            disabled={!hasChanges || updatePage.isPending || autoSaveStatus === 'saving'}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {updatePage.isPending || autoSaveStatus === 'saving' ? 'Saving...' : 'Save Draft'}
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

      {/* Page Builder */}
      <ContentTabV2
        blocks={blocks}
        onChange={handleBlocksChange}
        forms={pageForms?.map((f: Form) => ({ id: f.id, name: f.name })) || []}
        pageHeadline={formData.headline}
        pageSubheadline={formData.subheadline}
        workspaceId={workspaceId}
        pageId={pageId}
        siteId={siteId}
        profileScore={profile?.profile_score || 0}
        onGoToProfile={() => navigate(siteId ? `/sites/${siteId}/ai` : '/sites')}
        pageName={formData.name}
        pageSlug={formData.slug}
        pageUrl={page?.subdomain ? `https://${page.subdomain}.${SUBDOMAIN_SUFFIX}` : `/p/${page?.slug}?ws=${workspaceId}`}
        primaryColor={formData.primary_color}
        secondaryColor={formData.secondary_color}
        accentColor={formData.accent_color}
        onPageNameChange={(name) => handleChange('name', name)}
        onPageSlugChange={(slug) => handleChange('slug', slug)}
        onPrimaryColorChange={(color) => handleChange('primary_color', color)}
        onSecondaryColorChange={(color) => handleChange('secondary_color', color)}
        onAccentColorChange={(color) => handleChange('accent_color', color)}
        metaTitle={formData.meta_title || ''}
        metaDescription={formData.meta_description || ''}
        ogImageUrl={formData.og_image_url || ''}
        onMetaTitleChange={(value) => handleChange('meta_title', value)}
        onMetaDescriptionChange={(value) => handleChange('meta_description', value)}
        onOgImageUrlChange={(value) => handleChange('og_image_url', value)}
        gaTrackingId={formData.ga_tracking_id || ''}
        fbPixelId={formData.fb_pixel_id || ''}
        scriptsHead={formData.scripts_head || ''}
        scriptsBody={formData.scripts_body || ''}
        onGaTrackingIdChange={(value) => handleChange('ga_tracking_id', value)}
        onFbPixelIdChange={(value) => handleChange('fb_pixel_id', value)}
        onScriptsHeadChange={(value) => handleChange('scripts_head', value)}
        onScriptsBodyChange={(value) => handleChange('scripts_body', value)}
        layout={((formData.theme as Record<string, unknown>)?.layout as PageLayout) || 'full-bleed'}
        onLayoutChange={(layout) => handleChange('theme', { ...formData.theme, layout })}
      />

      {/* AI Page Builder Modal - agentic chat-based builder */}
      {showAIGenerator && (
        <AgenticPageBuilder
          onComplete={handleAIGeneratedBlocks}
          onClose={() => setShowAIGenerator(false)}
          pageId={pageId}
          siteId={siteId}
          useSynthesisEngine={true}
        />
      )}
    </div>
  );
}
