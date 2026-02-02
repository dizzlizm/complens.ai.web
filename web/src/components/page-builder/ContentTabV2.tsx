import { useState, useCallback } from 'react';
import { PageBlock, BlockType } from './types';
import BlockSelectionGrid from './BlockSelectionGrid';
import SynthesisPopup from './SynthesisPopup';
import ProfilePromptBanner from './ProfilePromptBanner';
import PageBuilderCanvas from './PageBuilderCanvas';
import { SynthesisResult } from '../../lib/hooks/useAI';

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
  primaryColor?: string;
  onPageNameChange?: (name: string) => void;
  onPageSlugChange?: (slug: string) => void;
  onPrimaryColorChange?: (color: string) => void;
}

export default function ContentTabV2({
  blocks,
  onChange,
  forms = [],
  pageHeadline,
  pageSubheadline,
  workspaceId,
  pageId,
  profileScore = 100,
  onGoToProfile,
  pageName,
  pageSlug,
  primaryColor = '#6366f1',
  onPageNameChange,
  onPageSlugChange,
  onPrimaryColorChange,
}: ContentTabV2Props) {
  // Synthesis popup state
  const [showSynthesisPopup, setShowSynthesisPopup] = useState(false);
  const [selectedBlockTypesForSynthesis, setSelectedBlockTypesForSynthesis] = useState<BlockType[]>([]);

  // Handle opening synthesis popup with selected blocks
  const handleSynthesizeBlocks = useCallback((blockTypes: BlockType[]) => {
    setSelectedBlockTypesForSynthesis(blockTypes);
    setShowSynthesisPopup(true);
  }, []);

  // Handle applying synthesis results
  const handleApplySynthesis = useCallback(
    (synthesizedBlocks: PageBlock[], synthesisResult: SynthesisResult) => {
      // Merge synthesized blocks with existing blocks
      // Strategy: Replace blocks of the same type, add new ones
      const existingBlocksByType = new Map<string, PageBlock>();
      blocks.forEach((b) => existingBlocksByType.set(b.type, b));

      const newBlocks: PageBlock[] = [];
      let order = 0;

      // Add synthesized blocks
      synthesizedBlocks.forEach((synthesizedBlock) => {
        newBlocks.push({
          ...synthesizedBlock,
          order: order++,
        });
      });

      // Add existing blocks that weren't replaced
      blocks.forEach((existingBlock) => {
        const wasReplaced = synthesizedBlocks.some((sb) => sb.type === existingBlock.type);
        if (!wasReplaced) {
          newBlocks.push({
            ...existingBlock,
            order: order++,
          });
        }
      });

      // Sort by intended order (synthesis blocks first, then existing)
      newBlocks.sort((a, b) => a.order - b.order);

      // Re-index orders
      newBlocks.forEach((b, i) => {
        b.order = i;
      });

      onChange(newBlocks);
      setShowSynthesisPopup(false);
      setSelectedBlockTypesForSynthesis([]);

      // If synthesis included colors, update the primary color
      if (synthesisResult.design_system?.colors?.primary && onPrimaryColorChange) {
        onPrimaryColorChange(synthesisResult.design_system.colors.primary);
      }
    },
    [blocks, onChange, onPrimaryColorChange]
  );

  // Close synthesis popup
  const handleCloseSynthesis = useCallback(() => {
    setShowSynthesisPopup(false);
    setSelectedBlockTypesForSynthesis([]);
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
        <div className="grid grid-cols-3 gap-4">
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
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Primary Color
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => onPrimaryColorChange?.(e.target.value)}
                className="w-10 h-9 rounded cursor-pointer border-0"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => onPrimaryColorChange?.(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Block Selection Grid */}
      <BlockSelectionGrid
        onSynthesizeBlocks={handleSynthesizeBlocks}
        showCategories={true}
      />

      {/* Visual Page Builder Canvas */}
      <PageBuilderCanvas
        blocks={blocks}
        onChange={onChange}
        forms={forms}
        pageHeadline={pageHeadline}
        pageSubheadline={pageSubheadline}
        workspaceId={workspaceId}
        pageId={pageId}
      />

      {/* Empty state */}
      {blocks.length === 0 && (
        <div className="text-center py-8 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <p className="text-gray-500 mb-2">No content yet</p>
          <p className="text-sm text-gray-400">
            Select sections above and click "Synthesize" to generate AI-powered content
          </p>
        </div>
      )}

      {/* Synthesis Popup */}
      {showSynthesisPopup && (
        <SynthesisPopup
          selectedBlockTypes={selectedBlockTypesForSynthesis}
          pageId={pageId}
          onClose={handleCloseSynthesis}
          onApply={handleApplySynthesis}
        />
      )}
    </div>
  );
}
