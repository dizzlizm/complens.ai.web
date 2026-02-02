import { useState, useCallback } from 'react';
import { X, Sparkles, Loader2, ChevronRight, AlertCircle } from 'lucide-react';
import { BlockType, BLOCK_TYPES, PageBlock } from './types';
import { useSynthesizePage, SynthesisResult } from '../../lib/hooks/useAI';
import { useCurrentWorkspace } from '../../lib/hooks/useWorkspaces';

interface SynthesisPopupProps {
  selectedBlockTypes: BlockType[];
  pageId?: string;
  onClose: () => void;
  onApply: (blocks: PageBlock[], synthesisResult: SynthesisResult) => void;
}

const STYLE_OPTIONS = [
  { value: 'professional', label: 'Professional', description: 'Clean, corporate, trustworthy' },
  { value: 'bold', label: 'Bold', description: 'High-contrast, urgent, attention-grabbing' },
  { value: 'minimal', label: 'Minimal', description: 'Simple, elegant, lots of whitespace' },
  { value: 'playful', label: 'Playful', description: 'Colorful, friendly, approachable' },
] as const;

export default function SynthesisPopup({
  selectedBlockTypes,
  pageId,
  onClose,
  onApply,
}: SynthesisPopupProps) {
  const { workspaceId } = useCurrentWorkspace();
  const [description, setDescription] = useState('');
  const [style, setStyle] = useState<'professional' | 'bold' | 'minimal' | 'playful'>('professional');
  const [showPreview, setShowPreview] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<SynthesisResult | null>(null);

  const synthesizePage = useSynthesizePage(workspaceId || '');

  // Get block labels for display
  const getBlockLabel = (type: BlockType): string => {
    const blockInfo = BLOCK_TYPES.find((b) => b.type === type);
    return blockInfo?.label || type;
  };

  // Handle synthesis
  const handleSynthesize = useCallback(async () => {
    if (!workspaceId) return;

    try {
      const result = await synthesizePage.mutateAsync({
        description: description || 'Generate content for the selected blocks',
        style_preference: style,
        page_id: pageId,
        include_form: selectedBlockTypes.includes('form'),
        include_chat: selectedBlockTypes.includes('chat'),
        block_types: selectedBlockTypes,
      });

      setSynthesisResult(result);
      setShowPreview(true);
    } catch (error) {
      console.error('Synthesis failed:', error);
    }
  }, [workspaceId, synthesizePage, description, style, pageId, selectedBlockTypes]);

  // Handle apply
  const handleApply = useCallback(() => {
    if (!synthesisResult) return;

    // Convert synthesis blocks to PageBlock format
    const blocks: PageBlock[] = synthesisResult.blocks.map((block, index) => ({
      id: block.id,
      type: block.type as BlockType,
      config: block.config,
      order: index,
      width: (block.width || 4) as 1 | 2 | 3 | 4,
    }));

    onApply(blocks, synthesisResult);
    onClose();
  }, [synthesisResult, onApply, onClose]);

  // Render preview content
  const renderPreview = () => {
    if (!synthesisResult) return null;

    return (
      <div className="space-y-4">
        {/* Intent & Assessment Summary */}
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Sparkles className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">
                {synthesisResult.business_name || 'Your Page'}
              </h4>
              <p className="text-sm text-gray-600 mt-1">
                {synthesisResult.tagline || 'AI-generated content ready'}
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                  {synthesisResult.blocks.length} blocks generated
                </span>
                <span>Style: {synthesisResult.design_system.style}</span>
                <span>Goal: {synthesisResult.intent.goal}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Block Preview List */}
        <div className="space-y-2">
          <h5 className="text-sm font-medium text-gray-700">Generated Blocks</h5>
          <div className="max-h-60 overflow-y-auto space-y-2">
            {synthesisResult.blocks.map((block, index) => (
              <div
                key={block.id}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <span className="w-6 h-6 flex items-center justify-center bg-gray-200 rounded text-xs font-medium text-gray-600">
                  {index + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900 capitalize">
                    {block.type}
                  </p>
                  {(block.config as { headline?: string }).headline && (
                    <p className="text-xs text-gray-500 truncate">
                      {(block.config as { headline: string }).headline}
                    </p>
                  )}
                  {(block.config as { title?: string }).title && !(block.config as { headline?: string }).headline && (
                    <p className="text-xs text-gray-500 truncate">
                      {(block.config as { title: string }).title}
                    </p>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {block.width === 4 ? 'Full' : `${block.width}/4`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Excluded Blocks Warning */}
        {Object.keys(synthesisResult.metadata.blocks_excluded).length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">Some blocks were excluded</p>
                <ul className="text-xs text-amber-700 mt-1 space-y-1">
                  {Object.entries(synthesisResult.metadata.blocks_excluded).map(([type, reason]) => (
                    <li key={type}>
                      <span className="font-medium">{type}</span>: {reason}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Color Scheme Preview */}
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">Colors:</span>
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full border border-gray-200"
              style={{ backgroundColor: synthesisResult.design_system.colors.primary }}
              title="Primary"
            />
            <div
              className="w-6 h-6 rounded-full border border-gray-200"
              style={{ backgroundColor: synthesisResult.design_system.colors.secondary }}
              title="Secondary"
            />
            <div
              className="w-6 h-6 rounded-full border border-gray-200"
              style={{ backgroundColor: synthesisResult.design_system.colors.accent }}
              title="Accent"
            />
          </div>
          <span className="text-xs text-gray-500 capitalize">
            {synthesisResult.design_system.style} style
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {showPreview ? 'Preview Synthesis' : 'AI Synthesis'}
              </h3>
              <p className="text-sm text-gray-500">
                {showPreview
                  ? 'Review and apply generated content'
                  : 'Generate content for selected blocks'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {!showPreview ? (
            <>
              {/* Selected Blocks */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selected Blocks
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedBlockTypes.map((type) => (
                    <span
                      key={type}
                      className="px-3 py-1.5 bg-purple-100 text-purple-700 text-sm font-medium rounded-full"
                    >
                      {getBlockLabel(type)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Describe your page (optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., A landing page for my AI-powered marketing automation tool that helps small businesses..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">
                  The more context you provide, the better the AI-generated content will be
                </p>
              </div>

              {/* Style Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Style
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {STYLE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setStyle(option.value)}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        style === option.value
                          ? 'border-purple-500 bg-purple-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className={`text-sm font-medium ${
                        style === option.value ? 'text-purple-700' : 'text-gray-900'
                      }`}>
                        {option.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {option.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            renderPreview()
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 bg-gray-50 border-t border-gray-100">
          {!showPreview ? (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSynthesize}
                disabled={synthesizePage.isPending}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-purple-500/25"
              >
                {synthesizePage.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Synthesizing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Content
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Back to Options
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSynthesize}
                  disabled={synthesizePage.isPending}
                  className="px-4 py-2 text-purple-700 hover:text-purple-900 hover:bg-purple-100 rounded-lg transition-colors"
                >
                  {synthesizePage.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Regenerate'
                  )}
                </button>
                <button
                  onClick={handleApply}
                  className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md shadow-purple-500/25"
                >
                  Apply to Page
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Error Display */}
        {synthesizePage.isError && (
          <div className="mx-5 mb-5 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">
              Synthesis failed. Please try again or provide more details about your page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
