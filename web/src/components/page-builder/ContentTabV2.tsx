import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Eye, Pencil, Undo2, Redo2, List } from 'lucide-react';
import { PageBlock, BlockType, BLOCK_TYPES } from './types';
import type { PageLayout } from '../../lib/hooks/usePages';
import LayoutCanvas from './LayoutCanvas';
import SynthesisPopup, { type ApplyOptions } from './SynthesisPopup';
import ProfilePromptBanner from './ProfilePromptBanner';
import SeoSection from './SeoSection';
import ScriptsSection from './ScriptsSection';
import { SynthesisResult, useCreateCompletePage, useGenerateImage, useBusinessProfile } from '../../lib/hooks/useAI';
import { useToast } from '../Toast';
import PillTabs from '../ui/PillTabs';
import { useUndoRedo } from './useUndoRedo';
import BlockOutlinePanel from './BlockOutlinePanel';
import CommandPalette from './CommandPalette';

// Form data for the form block selector
interface FormInfo {
  id: string;
  name: string;
  fields?: Array<{
    id: string;
    name: string;
    label: string;
    type: string;
    required: boolean;
    placeholder?: string;
    options?: string[];
  }>;
}

interface ContentTabV2Props {
  blocks: PageBlock[];
  onChange: (blocks: PageBlock[]) => void;
  forms?: FormInfo[];
  pageHeadline?: string;
  pageSubheadline?: string;
  workspaceId?: string;
  pageId?: string;
  profileScore?: number;
  onGoToProfile: () => void;
  // Page metadata fields
  pageName?: string;
  pageSlug?: string;
  pageUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  onPageNameChange?: (name: string) => void;
  onPageSlugChange?: (slug: string) => void;
  onPrimaryColorChange?: (color: string) => void;
  onSecondaryColorChange?: (color: string) => void;
  onAccentColorChange?: (color: string) => void;
  // SEO fields
  metaTitle?: string;
  metaDescription?: string;
  ogImageUrl?: string;
  onMetaTitleChange?: (value: string) => void;
  onMetaDescriptionChange?: (value: string) => void;
  onOgImageUrlChange?: (value: string) => void;
  // Scripts & Tracking
  gaTrackingId?: string;
  fbPixelId?: string;
  scriptsHead?: string;
  scriptsBody?: string;
  onGaTrackingIdChange?: (value: string) => void;
  onFbPixelIdChange?: (value: string) => void;
  onScriptsHeadChange?: (value: string) => void;
  onScriptsBodyChange?: (value: string) => void;
  // Layout
  layout?: PageLayout;
  onLayoutChange?: (layout: PageLayout) => void;
  // Callbacks for resource creation
  onFormCreated?: (formId: string) => void;
  onWorkflowCreated?: (workflowId: string) => void;
}

export default function ContentTabV2({
  blocks,
  onChange,
  forms = [],
  // pageHeadline, pageSubheadline kept in props for future use
  workspaceId,
  pageId,
  profileScore = 100,
  onGoToProfile,
  pageName,
  pageSlug,
  pageUrl = '',
  primaryColor = '#6366f1',
  secondaryColor = '#8b5cf6',
  accentColor = '#f59e0b',
  onPageNameChange,
  onPageSlugChange,
  onPrimaryColorChange,
  onSecondaryColorChange,
  onAccentColorChange,
  // SEO
  metaTitle = '',
  metaDescription = '',
  ogImageUrl = '',
  onMetaTitleChange,
  onMetaDescriptionChange,
  onOgImageUrlChange,
  // Scripts
  gaTrackingId = '',
  fbPixelId = '',
  scriptsHead = '',
  scriptsBody = '',
  onGaTrackingIdChange,
  onFbPixelIdChange,
  onScriptsHeadChange,
  onScriptsBodyChange,
  // Layout
  layout = 'full-bleed',
  onLayoutChange,
  // Callbacks
  onFormCreated,
  onWorkflowCreated,
}: ContentTabV2Props) {
  const toast = useToast();
  const queryClient = useQueryClient();

  // Content subtab state
  const [contentSubTab, setContentSubTab] = useState<'blocks' | 'seo' | 'scripts'>('blocks');

  // Editor mode: edit or preview
  const [editorMode, setEditorMode] = useState<'edit' | 'preview'>('edit');

  // Outline panel
  const [showOutlinePanel, setShowOutlinePanel] = useState(false);

  // Command palette
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // Undo/Redo — wraps blocks state
  const { state: undoBlocks, set: setUndoBlocks, undo, redo, canUndo, canRedo } = useUndoRedo(blocks);

  // Sync undo state changes back to parent
  const handleBlocksChange = useCallback((newBlocks: PageBlock[]) => {
    setUndoBlocks(newBlocks);
    onChange(newBlocks);
  }, [setUndoBlocks, onChange]);

  // When undo/redo changes undoBlocks, sync to parent
  useEffect(() => {
    // Only sync if undoBlocks differs from blocks (undo/redo happened)
    if (undoBlocks !== blocks && undoBlocks.length >= 0) {
      onChange(undoBlocks);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undoBlocks]);

  // Keyboard shortcuts: Cmd+Z, Cmd+Shift+Z, Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (isMod && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
      if (isMod && e.key === 'k') {
        e.preventDefault();
        setShowCommandPalette(prev => !prev);
      }
      if (isMod && e.shiftKey && e.key === 'O') {
        e.preventDefault();
        setShowOutlinePanel(prev => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Synthesis popup state
  const [showSynthesisPopup, setShowSynthesisPopup] = useState(false);
  const [selectedBlockTypesForSynthesis, setSelectedBlockTypesForSynthesis] = useState<BlockType[]>([]);
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);

  // Create complete page hook (for form/workflow creation)
  const createCompletePage = useCreateCompletePage(workspaceId || '');

  // OG image generation
  const generateImage = useGenerateImage(workspaceId || '');
  const { data: businessProfile } = useBusinessProfile(workspaceId, pageId);

  const handleGenerateOgImage = useCallback(async () => {
    if (!workspaceId) return;

    // Build a rich context string from SEO fields + business profile
    const parts: string[] = [];
    if (businessProfile?.business_name) parts.push(businessProfile.business_name);
    if (businessProfile?.tagline) parts.push(businessProfile.tagline);
    if (businessProfile?.industry) parts.push(`${businessProfile.industry} industry`);
    if (businessProfile?.description) parts.push(businessProfile.description);

    const context = parts.join(' — ') || pageName || 'business';

    // Build a descriptive prompt using all available signals
    const promptParts = [
      'Professional social sharing banner image',
      `for ${businessProfile?.business_name || pageName || 'a business'}`,
    ];
    if (metaTitle) promptParts.push(`about "${metaTitle}"`);
    if (metaDescription) promptParts.push(`— ${metaDescription}`);
    if (businessProfile?.brand_voice) promptParts.push(`${businessProfile.brand_voice} tone`);
    if (businessProfile?.target_audience) promptParts.push(`targeting ${businessProfile.target_audience}`);
    promptParts.push('modern clean design, no text overlay, high quality, suitable for social media preview card');

    // Titan image prompt limit is 512 chars
    const prompt = promptParts.join(', ').slice(0, 512);

    try {
      const result = await generateImage.mutateAsync({
        context,
        prompt,
        style: businessProfile?.brand_voice === 'playful' ? 'vibrant' : 'professional',
        width: 1200,
        height: 630,
        colors: primaryColor ? {
          primary: primaryColor,
          secondary: secondaryColor || undefined,
          accent: accentColor || undefined,
        } : undefined,
      });

      if (result?.url) {
        onOgImageUrlChange?.(result.url);
        toast.success('Social sharing image generated!');
      }
    } catch {
      toast.error('Failed to generate image. Please try again.');
    }
  }, [workspaceId, businessProfile, pageName, metaTitle, metaDescription, primaryColor, secondaryColor, accentColor, generateImage, onOgImageUrlChange, toast]);

  // Handle opening synthesis popup with selected blocks from layout canvas
  const handleSynthesizeBlocks = useCallback((blockTypes: BlockType[], slotIds: string[]) => {
    setSelectedBlockTypesForSynthesis(blockTypes);
    setSelectedSlotIds(slotIds);
    setShowSynthesisPopup(true);
  }, []);

  // Handle applying synthesis results to the selected slots
  const handleApplySynthesis = useCallback(
    async (synthesizedBlocks: PageBlock[], synthesisResult: SynthesisResult, options: ApplyOptions) => {
      const selectedSet = new Set(selectedSlotIds);

      // Find the insertion point: the row of the first selected slot
      const migrated = blocks.map((block, index) => ({
        ...block,
        row: block.row ?? index,
        colSpan: block.colSpan ?? 12,
        colStart: block.colStart ?? 0,
      }));
      // Split current blocks into: before selection, after selection (excluding selected)
      const keepBefore: PageBlock[] = [];
      const keepAfter: PageBlock[] = [];
      let pastSelection = false;
      for (const block of migrated) {
        if (selectedSet.has(block.id)) {
          pastSelection = true;
          continue; // Remove selected slots — they'll be replaced
        }
        if (!pastSelection) {
          keepBefore.push(block);
        } else {
          keepAfter.push(block);
        }
      }

      // Group synthesized blocks by their row from the backend layout
      const synthByRow = new Map<number, PageBlock[]>();
      for (const block of synthesizedBlocks) {
        const row = block.row ?? 0;
        if (!synthByRow.has(row)) synthByRow.set(row, []);
        synthByRow.get(row)!.push(block);
      }
      const synthRows = Array.from(synthByRow.keys()).sort((a, b) => a - b);

      // Build the final block list with proper row numbering
      let currentRow = 0;
      const finalBlocks: PageBlock[] = [];

      // 1) Blocks before the selection point
      const beforeRows = new Map<number, PageBlock[]>();
      for (const b of keepBefore) {
        const r = b.row ?? 0;
        if (!beforeRows.has(r)) beforeRows.set(r, []);
        beforeRows.get(r)!.push(b);
      }
      for (const row of Array.from(beforeRows.keys()).sort((a, b) => a - b)) {
        let colStart = 0;
        for (const b of beforeRows.get(row)!) {
          finalBlocks.push({ ...b, row: currentRow, colStart, order: finalBlocks.length });
          colStart += b.colSpan ?? 12;
        }
        currentRow++;
      }

      // 2) Synthesized blocks in place of the selection
      for (const synthRow of synthRows) {
        const rowBlocks = synthByRow.get(synthRow)!;
        let colStart = 0;
        for (const b of rowBlocks) {
          finalBlocks.push({
            ...b,
            row: currentRow,
            colSpan: (b.colSpan ?? 12) as 4 | 6 | 8 | 12,
            colStart,
            order: finalBlocks.length,
          });
          colStart += b.colSpan ?? 12;
        }
        currentRow++;
      }

      // 3) Blocks after the selection point
      const afterRows = new Map<number, PageBlock[]>();
      for (const b of keepAfter) {
        const r = b.row ?? 0;
        if (!afterRows.has(r)) afterRows.set(r, []);
        afterRows.get(r)!.push(b);
      }
      for (const row of Array.from(afterRows.keys()).sort((a, b) => a - b)) {
        let colStart = 0;
        for (const b of afterRows.get(row)!) {
          finalBlocks.push({ ...b, row: currentRow, colStart, order: finalBlocks.length });
          colStart += b.colSpan ?? 12;
        }
        currentRow++;
      }

      let newBlocks = finalBlocks;

      onChange(newBlocks);
      setShowSynthesisPopup(false);
      setSelectedBlockTypesForSynthesis([]);
      setSelectedSlotIds([]);

      // If synthesis included colors, update the color palette
      if (synthesisResult.design_system?.colors) {
        const colors = synthesisResult.design_system.colors;
        if (colors.primary && onPrimaryColorChange) {
          onPrimaryColorChange(colors.primary);
        }
        if (colors.secondary && onSecondaryColorChange) {
          onSecondaryColorChange(colors.secondary);
        }
        if (colors.accent && onAccentColorChange) {
          onAccentColorChange(colors.accent);
        }
      }

      // Apply generated SEO metadata
      if (synthesisResult.seo) {
        if (synthesisResult.seo.meta_title && onMetaTitleChange) {
          onMetaTitleChange(synthesisResult.seo.meta_title);
        }
        if (synthesisResult.seo.meta_description && onMetaDescriptionChange) {
          onMetaDescriptionChange(synthesisResult.seo.meta_description);
        }
      }

      // Create form and workflow if requested
      if ((options.createForm || options.createWorkflow) && pageId && workspaceId) {
        const hasFormBlock = newBlocks.some(b => b.type === 'form');

        if (hasFormBlock && synthesisResult.form_config) {
          try {
            toast.info('Creating form and workflow...');

            // Use create-complete to create form and workflow
            // Construct minimal content object for type compliance (synthesis engine handles actual content)
            const result = await createCompletePage.mutateAsync({
              page_id: pageId,
              name: pageName,
              slug: pageSlug,
              content: {
                business_info: {
                  business_name: synthesisResult.business_name || 'Business',
                  business_type: 'service',
                  industry: 'general',
                  products: [],
                  audience: 'general',
                  tone: 'professional',
                },
                content: {
                  headlines: [],
                  tagline: '',
                  value_props: [],
                  features: [],
                  testimonial_concepts: [],
                  faq: [],
                  cta_text: '',
                  hero_subheadline: '',
                },
                suggested_colors: {
                  primary: synthesisResult.design_system?.colors?.primary || '#6366f1',
                  secondary: synthesisResult.design_system?.colors?.secondary || '#8b5cf6',
                  accent: synthesisResult.design_system?.colors?.accent || '#f59e0b',
                },
              },
              style: synthesisResult.design_system.style as 'professional' | 'bold' | 'minimal' | 'playful',
              colors: {
                primary: synthesisResult.design_system.colors.primary,
                secondary: synthesisResult.design_system.colors.secondary,
                accent: synthesisResult.design_system.colors.accent,
              },
              include_form: options.createForm,
              include_chat: newBlocks.some(b => b.type === 'chat'),
              synthesized_blocks: newBlocks.map((b, idx) => ({
                id: b.id,
                type: b.type as string,
                order: idx,
                width: b.width || 4,
                config: b.config as Record<string, unknown>,
              })),
              synthesized_form_config: options.createForm ? {
                name: synthesisResult.form_config.name,
                fields: options.formFields.length > 0
                  ? options.formFields.map(f => ({ ...f }) as Record<string, unknown>)
                  : synthesisResult.form_config.fields,
                submit_button_text: synthesisResult.form_config.submit_button_text,
                success_message: synthesisResult.form_config.success_message,
                add_tags: synthesisResult.form_config.add_tags,
              } : undefined,
              synthesized_workflow_config: options.createWorkflow ? {
                name: synthesisResult.workflow_config?.name || 'Lead Follow-up',
                trigger_type: options.workflowTrigger,
                send_welcome_email: options.sendWelcomeEmail,
                notify_owner: options.notifyOwner,
                owner_email: options.ownerEmail || synthesisResult.workflow_config?.owner_email,
                welcome_message: synthesisResult.workflow_config?.welcome_message,
                add_tags: options.workflowTags.length > 0 ? options.workflowTags : (synthesisResult.workflow_config?.add_tags || ['lead']),
              } : undefined,
              automation: {
                send_welcome_email: options.sendWelcomeEmail,
                notify_owner: options.notifyOwner,
                add_tags: options.workflowTags.length > 0 ? options.workflowTags : ['lead', 'website'],
              },
              business_name: synthesisResult.business_name,
            });

            // Notify parent components
            if (result.form && onFormCreated) {
              onFormCreated(result.form.id as string);

              // Update form block with actual form ID
              newBlocks = newBlocks.map(block => {
                if (block.type === 'form') {
                  return {
                    ...block,
                    config: { ...block.config, formId: result.form?.id },
                  };
                }
                return block;
              });
              onChange(newBlocks);
            }

            if (result.workflow && onWorkflowCreated) {
              onWorkflowCreated(result.workflow.id as string);
            }

            // Invalidate React Query cache to refresh Forms and Workflows tabs
            queryClient.invalidateQueries({ queryKey: ['pageForms', workspaceId, pageId] });
            queryClient.invalidateQueries({ queryKey: ['pageWorkflows', workspaceId, pageId] });
            queryClient.invalidateQueries({ queryKey: ['page', workspaceId, pageId] });

            toast.success(
              options.createForm && options.createWorkflow
                ? 'Form and workflow created!'
                : options.createForm
                  ? 'Form created!'
                  : 'Workflow created!'
            );
          } catch {
            toast.error('Content applied, but failed to create form/workflow. You can create them manually.');
          }
        }
      }
    },
    [blocks, selectedSlotIds, onChange, onPrimaryColorChange, onSecondaryColorChange, onAccentColorChange, onMetaTitleChange, onMetaDescriptionChange, pageId, workspaceId, pageName, pageSlug, createCompletePage, toast, onFormCreated, onWorkflowCreated, queryClient]
  );

  // Close synthesis popup
  const handleCloseSynthesis = useCallback(() => {
    setShowSynthesisPopup(false);
    setSelectedBlockTypesForSynthesis([]);
    setSelectedSlotIds([]);
  }, []);

  return (
    <div className="space-y-4">
      {/* Profile Prompt Banner */}
      <ProfilePromptBanner
        profileScore={profileScore}
        threshold={50}
        onGoToProfile={onGoToProfile}
      />

      {/* Page Metadata Bar */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Page Name
            </label>
            <input
              type="text"
              value={pageName || ''}
              onChange={(e) => onPageNameChange?.(e.target.value)}
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
                value={pageSlug || ''}
                onChange={(e) =>
                  onPageSlugChange?.(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                }
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>
            {pageUrl && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    pageUrl.startsWith('http') ? pageUrl : `${window.location.origin}${pageUrl}`
                  );
                }}
                className="mt-1.5 text-xs text-indigo-600 hover:text-indigo-800 truncate max-w-full text-left"
                title="Click to copy public URL"
              >
                {pageUrl.startsWith('http') ? pageUrl : `${window.location.origin}${pageUrl}`} — click to copy
              </button>
            )}
          </div>
        </div>

        {/* Color Palette */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Color Palette
          </label>
          <div className="flex items-center gap-4">
            {/* Primary Color */}
            <div className="flex items-center gap-2">
              <div className="relative group">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => onPrimaryColorChange?.(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border-2 border-gray-200 hover:border-gray-300 transition-colors"
                />
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  Primary
                </span>
              </div>
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => onPrimaryColorChange?.(e.target.value)}
                className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                placeholder="#6366f1"
              />
            </div>

            {/* Secondary Color */}
            <div className="flex items-center gap-2">
              <div className="relative group">
                <input
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => onSecondaryColorChange?.(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border-2 border-gray-200 hover:border-gray-300 transition-colors"
                />
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  Secondary
                </span>
              </div>
              <input
                type="text"
                value={secondaryColor}
                onChange={(e) => onSecondaryColorChange?.(e.target.value)}
                className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                placeholder="#8b5cf6"
              />
            </div>

            {/* Accent Color */}
            <div className="flex items-center gap-2">
              <div className="relative group">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => onAccentColorChange?.(e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border-2 border-gray-200 hover:border-gray-300 transition-colors"
                />
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  Accent
                </span>
              </div>
              <input
                type="text"
                value={accentColor}
                onChange={(e) => onAccentColorChange?.(e.target.value)}
                className="w-24 px-2 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                placeholder="#f59e0b"
              />
            </div>

            {/* Color preview bar */}
            <div className="flex-1 flex items-center justify-end">
              <div className="flex rounded-lg overflow-hidden shadow-sm border border-gray-200">
                <div
                  className="w-12 h-8"
                  style={{ backgroundColor: primaryColor }}
                  title="Primary"
                />
                <div
                  className="w-12 h-8"
                  style={{ backgroundColor: secondaryColor }}
                  title="Secondary"
                />
                <div
                  className="w-12 h-8"
                  style={{ backgroundColor: accentColor }}
                  title="Accent"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content Subtab Navigation */}
      <PillTabs
        tabs={[
          { id: 'blocks' as const, label: 'Blocks' },
          { id: 'seo' as const, label: 'Discoverability' },
          { id: 'scripts' as const, label: 'Scripts & Tracking' },
        ]}
        activeTab={contentSubTab}
        onChange={setContentSubTab}
      />

      {/* Blocks Subtab */}
      {contentSubTab === 'blocks' && (
        <>
          {/* Toolbar: Layout toggle + Edit/Preview + Undo/Redo + Outline + Cmd+K */}
          <div className="flex items-center justify-between bg-white rounded-lg shadow px-4 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Page Layout</span>
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => onLayoutChange?.('full-bleed')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    layout === 'full-bleed'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Full-bleed
                </button>
                <button
                  onClick={() => onLayoutChange?.('contained')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    layout === 'contained'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Contained
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {/* Undo */}
              <button
                onClick={undo}
                disabled={!canUndo}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo (Cmd+Z)"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              {/* Redo */}
              <button
                onClick={redo}
                disabled={!canRedo}
                className="p-1.5 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Redo (Cmd+Shift+Z)"
              >
                <Redo2 className="w-4 h-4" />
              </button>

              <div className="w-px h-5 bg-gray-200 mx-1" />

              {/* Outline panel toggle */}
              <button
                onClick={() => setShowOutlinePanel(!showOutlinePanel)}
                className={`p-1.5 rounded-lg transition-colors ${
                  showOutlinePanel
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                title="Block outline (Cmd+Shift+O)"
              >
                <List className="w-4 h-4" />
              </button>

              {/* Edit/Preview toggle */}
              <button
                onClick={() => setEditorMode(editorMode === 'edit' ? 'preview' : 'edit')}
                className={`p-1.5 rounded-lg transition-colors ${
                  editorMode === 'preview'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
                title={editorMode === 'edit' ? 'Preview mode' : 'Edit mode'}
              >
                {editorMode === 'edit' ? <Eye className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Outline panel + Canvas layout */}
          <div className="relative flex">
            {/* Block Outline Panel */}
            {showOutlinePanel && (
              <BlockOutlinePanel
                blocks={blocks}
                onClose={() => setShowOutlinePanel(false)}
              />
            )}

            {/* Visual Layout Canvas */}
            <div className="flex-1 min-w-0">
              <LayoutCanvas
                blocks={blocks}
                onChange={handleBlocksChange}
                onSynthesizeBlocks={handleSynthesizeBlocks}
                forms={forms}
                workspaceId={workspaceId}
                pageId={pageId}
                previewMode={editorMode === 'preview'}
              />
            </div>
          </div>
        </>
      )}

      {/* SEO Subtab */}
      {contentSubTab === 'seo' && (
        <SeoSection
          metaTitle={metaTitle}
          metaDescription={metaDescription}
          ogImageUrl={ogImageUrl}
          pageUrl={pageUrl}
          onMetaTitleChange={(value) => onMetaTitleChange?.(value)}
          onMetaDescriptionChange={(value) => onMetaDescriptionChange?.(value)}
          onOgImageUrlChange={(value) => onOgImageUrlChange?.(value)}
          onGenerateOgImage={workspaceId ? handleGenerateOgImage : undefined}
          isGeneratingOgImage={generateImage.isPending}
          blocks={blocks}
          profileScore={profileScore}
          defaultOpen
        />
      )}

      {/* Scripts Subtab */}
      {contentSubTab === 'scripts' && (
        <ScriptsSection
          gaTrackingId={gaTrackingId}
          fbPixelId={fbPixelId}
          scriptsHead={scriptsHead}
          scriptsBody={scriptsBody}
          onGaTrackingIdChange={(value) => onGaTrackingIdChange?.(value)}
          onFbPixelIdChange={(value) => onFbPixelIdChange?.(value)}
          onScriptsHeadChange={(value) => onScriptsHeadChange?.(value)}
          onScriptsBodyChange={(value) => onScriptsBodyChange?.(value)}
          defaultOpen
        />
      )}

      {/* Command Palette */}
      {showCommandPalette && (
        <CommandPalette
          blocks={blocks}
          onClose={() => setShowCommandPalette(false)}
          onAddBlock={(type) => {
            const typeInfo = BLOCK_TYPES.find(b => b.type === type);
            const newBlock: PageBlock = {
              id: Math.random().toString(36).substring(2, 10),
              type,
              config: typeInfo?.defaultConfig || {},
              order: blocks.length,
              width: 4,
              row: blocks.length > 0 ? Math.max(...blocks.map(b => b.row ?? 0)) + 1 : 0,
              colSpan: 12,
              colStart: 0,
            };
            handleBlocksChange([...blocks, newBlock]);
          }}
          onUndo={undo}
          onRedo={redo}
          onTogglePreview={() => setEditorMode(editorMode === 'edit' ? 'preview' : 'edit')}
          canUndo={canUndo}
          canRedo={canRedo}
        />
      )}

      {/* Synthesis Popup */}
      {showSynthesisPopup && (
        <SynthesisPopup
          selectedBlockTypes={selectedBlockTypesForSynthesis}
          selectedSlotIds={selectedSlotIds}
          existingBlockTypes={blocks.filter(b => b.type !== 'placeholder').map(b => b.type)}
          pageId={pageId}
          onClose={handleCloseSynthesis}
          onApply={handleApplySynthesis}
        />
      )}
    </div>
  );
}
