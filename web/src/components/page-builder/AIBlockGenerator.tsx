import { useState, useEffect, useCallback } from 'react';
import { Sparkles, X, Wand2, Loader2, Check, RefreshCw, ChevronRight, Eye, Trash2 } from 'lucide-react';
import { PageBlock, getBlockTypeInfo, BlockType } from './types';
import { useGenerateBlocks, useImproveBlock } from '../../lib/hooks/useAI';
import { useCurrentWorkspace } from '../../lib/hooks/useWorkspaces';

interface AIBlockGeneratorProps {
  onGenerate: (blocks: PageBlock[]) => void;
  onClose: () => void;
  isGenerating?: boolean;
  pageId?: string;
}

const STYLE_OPTIONS = [
  { value: 'professional', label: 'Professional', description: 'Clean, corporate look' },
  { value: 'bold', label: 'Bold', description: 'Vibrant, eye-catching' },
  { value: 'minimal', label: 'Minimal', description: 'Simple, elegant' },
  { value: 'playful', label: 'Playful', description: 'Fun, creative' },
] as const;

const QUICK_PROMPTS = [
  'Landing page for a SaaS product',
  'Portfolio page for a freelancer',
  'Coming soon page with email capture',
  'Product launch announcement',
  'Service pricing page',
  'About us company page',
];

type GenerationStep = 'input' | 'generating' | 'preview';

interface PreviewBlock extends PageBlock {
  isGenerating?: boolean;
  error?: string;
}

export default function AIBlockGenerator({
  onGenerate,
  onClose,
  isGenerating: externalIsGenerating = false,
  pageId,
}: AIBlockGeneratorProps) {
  const { workspaceId } = useCurrentWorkspace();
  const generateBlocks = useGenerateBlocks(workspaceId || '');
  const improveBlock = useImproveBlock(workspaceId || '');

  const [description, setDescription] = useState('');
  const [style, setStyle] = useState<'professional' | 'bold' | 'minimal' | 'playful'>('professional');
  const [includeForm, setIncludeForm] = useState(true);
  const [includeChat, setIncludeChat] = useState(true);

  // Agentic state
  const [step, setStep] = useState<GenerationStep>('input');
  const [previewBlocks, setPreviewBlocks] = useState<PreviewBlock[]>([]);
  const [currentBlockIndex, setCurrentBlockIndex] = useState(-1);
  const [generationMessages, setGenerationMessages] = useState<string[]>([]);
  const [selectedPreviewBlock, setSelectedPreviewBlock] = useState<number | null>(null);
  const [isRefining, setIsRefining] = useState(false);

  const isGenerating = externalIsGenerating || generateBlocks.isPending;

  // Add generation message
  const addMessage = useCallback((message: string) => {
    setGenerationMessages(prev => [...prev, message]);
  }, []);

  // Agentic generation process
  const handleGenerate = async () => {
    if (!description.trim()) return;

    setStep('generating');
    setGenerationMessages([]);
    setPreviewBlocks([]);
    setCurrentBlockIndex(-1);

    addMessage('🧠 Analyzing your content...');

    // Try AI backend first, fall back to local generation
    if (workspaceId) {
      try {
        addMessage('🤖 AI is crafting your page structure...');

        const blocks = await generateBlocks.mutateAsync({
          description,
          style,
          include_form: includeForm,
          include_chat: includeChat,
          page_id: pageId,
        });

        if (blocks && blocks.length > 0) {
          addMessage(`✨ Generated ${blocks.length} blocks!`);

          // Simulate streaming effect - add blocks one by one
          for (let i = 0; i < blocks.length; i++) {
            await new Promise(r => setTimeout(r, 300));
            const block = blocks[i] as Record<string, unknown>;
            setPreviewBlocks(prev => [...prev, {
              ...block,
              id: (block.id as string) || Math.random().toString(36).substring(2, 10),
              type: block.type as string,
              config: block.config as Record<string, unknown>,
              order: i,
              width: (block.width as number) || 4,
            } as PreviewBlock]);
            setCurrentBlockIndex(i);
            const blockInfo = getBlockTypeInfo(block.type as BlockType);
            addMessage(`  ✓ Added ${blockInfo?.label || block.type} block`);
          }

          addMessage('🎉 Page ready for review!');
          setStep('preview');
          return;
        }
      } catch (error) {
        console.error('AI generation failed, falling back to local:', error);
        addMessage('⚠️ AI service unavailable, using smart templates...');
      }
    }

    // Fallback to local generation
    addMessage('📝 Detecting content type...');
    await new Promise(r => setTimeout(r, 500));

    const blocks = generateBlocksFromDescription(description, style, includeForm, includeChat);
    addMessage(`✨ Creating ${blocks.length} blocks...`);

    // Simulate streaming effect
    for (let i = 0; i < blocks.length; i++) {
      await new Promise(r => setTimeout(r, 200));
      setPreviewBlocks(prev => [...prev, blocks[i] as PreviewBlock]);
      setCurrentBlockIndex(i);
      const blockInfo = getBlockTypeInfo(blocks[i].type);
      addMessage(`  ✓ ${blockInfo?.label || blocks[i].type}`);
    }

    addMessage('🎉 Ready to review!');
    setStep('preview');
  };

  // Refine a single block with AI
  const handleRefineBlock = async (blockIndex: number, instruction: string) => {
    if (!workspaceId) return;

    const block = previewBlocks[blockIndex];
    setIsRefining(true);

    // Mark block as generating
    setPreviewBlocks(prev => prev.map((b, i) =>
      i === blockIndex ? { ...b, isGenerating: true } : b
    ));

    try {
      const result = await improveBlock.mutateAsync({
        block_type: block.type,
        config: block.config,
        instruction,
        page_id: pageId,
      });

      // Update block with refined content
      setPreviewBlocks(prev => prev.map((b, i) =>
        i === blockIndex ? { ...b, config: result, isGenerating: false } : b
      ));
    } catch (error) {
      console.error('Block refinement failed:', error);
      setPreviewBlocks(prev => prev.map((b, i) =>
        i === blockIndex ? { ...b, isGenerating: false, error: 'Refinement failed' } : b
      ));
    } finally {
      setIsRefining(false);
    }
  };

  // Remove a block from preview
  const handleRemoveBlock = (blockIndex: number) => {
    setPreviewBlocks(prev => prev.filter((_, i) => i !== blockIndex));
    setSelectedPreviewBlock(null);
  };

  // Apply the generated blocks
  const handleApply = () => {
    const cleanBlocks: PageBlock[] = previewBlocks.map((b, i) => ({
      id: b.id,
      type: b.type,
      order: i,
      width: b.width || 4,
      config: b.config,
    }));
    onGenerate(cleanBlocks);
  };

  // Back to input
  const handleBack = () => {
    setStep('input');
    setPreviewBlocks([]);
    setGenerationMessages([]);
  };

  const handleQuickPrompt = (prompt: string) => {
    setDescription(prompt);
  };

  // Auto-scroll messages
  useEffect(() => {
    const container = document.getElementById('generation-messages');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [generationMessages]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-bold">
                  {step === 'input' && 'AI Page Builder'}
                  {step === 'generating' && 'Building Your Page...'}
                  {step === 'preview' && 'Review & Refine'}
                </h2>
                <p className="text-white/80 text-sm">
                  {step === 'input' && 'Describe your page and let AI build it'}
                  {step === 'generating' && 'AI is creating blocks one by one'}
                  {step === 'preview' && 'Click blocks to refine or remove them'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Progress steps */}
          <div className="flex items-center gap-2 mt-4">
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              step === 'input' ? 'bg-white text-purple-600' : 'bg-white/20 text-white'
            }`}>
              {step !== 'input' && <Check className="w-3 h-3" />}
              <span>Describe</span>
            </div>
            <ChevronRight className="w-4 h-4 text-white/50" />
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              step === 'generating' ? 'bg-white text-purple-600' :
              step === 'preview' ? 'bg-white/20 text-white' : 'bg-white/10 text-white/50'
            }`}>
              {step === 'generating' && <Loader2 className="w-3 h-3 animate-spin" />}
              {step === 'preview' && <Check className="w-3 h-3" />}
              <span>Generate</span>
            </div>
            <ChevronRight className="w-4 h-4 text-white/50" />
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
              step === 'preview' ? 'bg-white text-purple-600' : 'bg-white/10 text-white/50'
            }`}>
              <span>Review</span>
            </div>
          </div>
        </div>

        {/* Content - Input Step */}
        {step === 'input' && (
          <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-280px)]">
            {/* Quick prompts */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Quick Start
              </label>
              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleQuickPrompt(prompt)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      description === prompt
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                    }`}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            {/* Description input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Describe Your Page (or paste your content)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Paste a resume, business description, product info, or describe what you want. The more detail you provide, the better the result!

Example: 'Steve Ross - Staff Systems Architect with 8+ years experience in cloud infrastructure, AI systems, and team leadership. Currently at TheRealReal building AI agent pipelines...'"
                rows={6}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
              />
              <p className="mt-2 text-xs text-gray-500">
                Tip: Paste a full resume, bio, or business description for best results!
              </p>
            </div>

            {/* Style selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Visual Style
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {STYLE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setStyle(option.value)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      style === option.value
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className={`font-medium text-sm ${
                      style === option.value ? 'text-indigo-700' : 'text-gray-900'
                    }`}>
                      {option.label}
                    </p>
                    <p className="text-xs text-gray-500">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeForm}
                  onChange={(e) => setIncludeForm(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Include contact form</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeChat}
                  onChange={(e) => setIncludeChat(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">Include AI chat widget</span>
              </label>
            </div>
          </div>
        )}

        {/* Content - Generating Step */}
        {step === 'generating' && (
          <div className="p-6 space-y-4">
            {/* Live generation messages */}
            <div
              id="generation-messages"
              className="bg-gray-900 rounded-xl p-4 font-mono text-sm max-h-64 overflow-y-auto"
            >
              {generationMessages.map((msg, i) => (
                <div key={i} className="text-green-400 py-0.5">
                  {msg}
                </div>
              ))}
              {generationMessages.length > 0 && (
                <div className="text-green-400 animate-pulse">▊</div>
              )}
            </div>

            {/* Preview of blocks being generated */}
            {previewBlocks.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Blocks being created:</p>
                <div className="grid grid-cols-2 gap-2">
                  {previewBlocks.map((block, i) => {
                    const blockInfo = getBlockTypeInfo(block.type);
                    return (
                      <div
                        key={block.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border ${
                          i === currentBlockIndex
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <Check className="w-4 h-4 text-green-500" />
                        <span className="text-sm font-medium text-gray-900">
                          {blockInfo?.label || block.type}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Content - Preview Step */}
        {step === 'preview' && (
          <div className="flex max-h-[calc(90vh-280px)]">
            {/* Block list */}
            <div className="flex-1 p-6 overflow-y-auto border-r border-gray-200">
              <p className="text-sm font-medium text-gray-700 mb-3">
                Generated Blocks ({previewBlocks.length})
              </p>
              <div className="space-y-2">
                {previewBlocks.map((block, i) => {
                  const blockInfo = getBlockTypeInfo(block.type);
                  const isSelected = selectedPreviewBlock === i;
                  return (
                    <div
                      key={block.id}
                      onClick={() => setSelectedPreviewBlock(isSelected ? null : i)}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'border-purple-500 bg-purple-50 shadow-md'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      } ${block.isGenerating ? 'opacity-50' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                        isSelected ? 'bg-purple-100' : 'bg-gray-100'
                      }`}>
                        <span className="text-xs font-bold text-gray-600">{i + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {blockInfo?.label || block.type}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
                          {String(block.config?.headline || block.config?.title || blockInfo?.description || '')}
                        </p>
                      </div>
                      {block.isGenerating ? (
                        <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveBlock(i);
                          }}
                          className="p-1 text-gray-400 hover:text-red-500 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Refinement panel */}
            <div className="w-80 p-6 bg-gray-50">
              {selectedPreviewBlock !== null ? (
                <BlockRefinementPanel
                  block={previewBlocks[selectedPreviewBlock]}
                  onRefine={(instruction) => handleRefineBlock(selectedPreviewBlock, instruction)}
                  onRemove={() => handleRemoveBlock(selectedPreviewBlock)}
                  isRefining={isRefining}
                />
              ) : (
                <div className="text-center py-8">
                  <Eye className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">
                    Click a block to refine it with AI
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {step === 'input' && 'AI will generate blocks based on your description'}
              {step === 'generating' && 'Please wait while AI creates your page...'}
              {step === 'preview' && 'Review your blocks before applying'}
            </p>
            <div className="flex gap-3">
              {step === 'input' && (
                <>
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGenerate}
                    disabled={!description.trim() || isGenerating}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Wand2 className="w-4 h-4" />
                    Generate Page
                  </button>
                </>
              )}
              {step === 'preview' && (
                <>
                  <button
                    onClick={handleBack}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                  >
                    ← Back
                  </button>
                  <button
                    onClick={handleGenerate}
                    className="flex items-center gap-2 px-4 py-2 text-purple-600 hover:text-purple-700 font-medium"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Regenerate
                  </button>
                  <button
                    onClick={handleApply}
                    disabled={previewBlocks.length === 0}
                    className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Check className="w-4 h-4" />
                    Apply {previewBlocks.length} Blocks
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Block refinement panel component
function BlockRefinementPanel({
  block,
  onRefine,
  onRemove,
  isRefining,
}: {
  block: PreviewBlock;
  onRefine: (instruction: string) => void;
  onRemove: () => void;
  isRefining: boolean;
}) {
  const [customInstruction, setCustomInstruction] = useState('');
  const blockInfo = getBlockTypeInfo(block.type);

  const quickRefinements = [
    { label: 'More Professional', instruction: 'Make this more professional and business-appropriate' },
    { label: 'More Engaging', instruction: 'Make this more engaging and exciting' },
    { label: 'More Concise', instruction: 'Make this shorter and more punchy' },
    { label: 'More Detailed', instruction: 'Expand this with more details and information' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-medium text-gray-900">{blockInfo?.label || block.type}</h4>
        <p className="text-xs text-gray-500 mt-1">{blockInfo?.description || ''}</p>
      </div>

      {/* Quick refinement buttons */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-700">Quick Refinements</p>
        <div className="grid grid-cols-2 gap-2">
          {quickRefinements.map((r) => (
            <button
              key={r.label}
              onClick={() => onRefine(r.instruction)}
              disabled={isRefining}
              className="px-3 py-2 text-xs bg-white border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 disabled:opacity-50 text-left"
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom instruction */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-700">Custom Instruction</p>
        <textarea
          value={customInstruction}
          onChange={(e) => setCustomInstruction(e.target.value)}
          placeholder="Describe how you want to change this block..."
          rows={3}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-200 resize-none"
        />
        <button
          onClick={() => {
            if (customInstruction.trim()) {
              onRefine(customInstruction);
              setCustomInstruction('');
            }
          }}
          disabled={!customInstruction.trim() || isRefining}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {isRefining ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Refining...
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              Apply Refinement
            </>
          )}
        </button>
      </div>

      {/* Remove button */}
      <button
        onClick={onRemove}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-red-600 text-sm font-medium border border-red-200 rounded-lg hover:bg-red-50"
      >
        <Trash2 className="w-3 h-3" />
        Remove Block
      </button>
    </div>
  );
}

// Smart block generation from description
function generateBlocksFromDescription(
  description: string,
  style: string,
  includeForm: boolean,
  includeChat: boolean
): PageBlock[] {
  const blocks: PageBlock[] = [];
  const desc = description.toLowerCase();

  // Generate unique IDs
  const genId = () => Math.random().toString(36).substring(2, 10);

  // Style-based colors
  const styleColors: Record<string, { primary: string; gradient: [string, string] }> = {
    professional: { primary: '#4f46e5', gradient: ['#1e1b4b', '#312e81'] },
    bold: { primary: '#dc2626', gradient: ['#0f0f0f', '#1f1f1f'] },
    minimal: { primary: '#171717', gradient: ['#fafafa', '#f5f5f5'] },
    playful: { primary: '#ec4899', gradient: ['#831843', '#701a75'] },
  };
  const colors = styleColors[style] || styleColors.professional;
  const isLightStyle = style === 'minimal';

  // Detect content type
  const contentType = detectContentType(description, desc);

  // Extract key information based on content type
  const extracted = extractContent(description, contentType);

  // 1. HERO BLOCK
  blocks.push({
    id: genId(),
    type: 'hero',
    order: blocks.length,
    width: 4,
    config: {
      headline: extracted.headline,
      subheadline: extracted.subheadline,
      buttonText: extracted.cta,
      buttonLink: '#contact',
      backgroundType: 'gradient',
      gradientFrom: colors.gradient[0],
      gradientTo: colors.gradient[1],
      textAlign: 'center',
      showButton: true,
    },
  });

  // 2. FEATURES/SKILLS/SERVICES BLOCK
  if (extracted.features.length > 0) {
    blocks.push({
      id: genId(),
      type: 'features',
      order: blocks.length,
      width: 4,
      config: {
        title: extracted.featuresTitle,
        subtitle: extracted.featuresSubtitle,
        columns: Math.min(extracted.features.length, 3) as 2 | 3 | 4,
        items: extracted.features.slice(0, 6),
      },
    });
  }

  // 3. STATS BLOCK (for professional/resume content)
  if (extracted.stats.length > 0) {
    blocks.push({
      id: genId(),
      type: 'stats',
      order: blocks.length,
      width: 4,
      config: {
        title: '',
        items: extracted.stats,
      },
    });
  }

  // 4. EXPERIENCE/TESTIMONIALS BLOCK
  if (extracted.experiences.length > 0 && contentType === 'resume') {
    // For resume, show as text block with experience
    blocks.push({
      id: genId(),
      type: 'text',
      order: blocks.length,
      width: 4,
      config: {
        content: formatExperience(extracted.experiences),
        alignment: 'left',
      },
    });
  } else if (contentType !== 'resume' && contentType !== 'coming-soon') {
    // For other types, show testimonials
    blocks.push({
      id: genId(),
      type: 'testimonials',
      order: blocks.length,
      width: 4,
      config: {
        title: 'What People Say',
        items: [
          { quote: `Working with ${extracted.name || 'them'} was an excellent experience. Professional, responsive, and delivered outstanding results.`, author: 'Sarah Johnson', company: 'Tech Innovations', avatar: '' },
          { quote: 'Exceeded our expectations in every way. Highly recommend!', author: 'Michael Chen', company: 'Growth Partners', avatar: '' },
        ],
      },
    });
  }

  // 5. PRICING BLOCK (if applicable)
  if (extracted.pricing.length > 0) {
    blocks.push({
      id: genId(),
      type: 'pricing',
      order: blocks.length,
      width: 4,
      config: {
        title: 'Pricing',
        subtitle: 'Choose the right plan for you',
        items: extracted.pricing,
      },
    });
  }

  // 6. FAQ BLOCK (for SaaS/service pages)
  if (contentType === 'saas' || contentType === 'service') {
    blocks.push({
      id: genId(),
      type: 'faq',
      order: blocks.length,
      width: 4,
      config: {
        title: 'Frequently Asked Questions',
        items: generateContextualFAQ(extracted.name, contentType, extracted),
      },
    });
  }

  // 7. FORM + CHAT (side by side if both)
  if (includeForm && includeChat) {
    blocks.push({
      id: genId(),
      type: 'form',
      order: blocks.length,
      width: 2,
      config: {
        formId: '',
        title: contentType === 'resume' ? 'Get in Touch' : contentType === 'coming-soon' ? 'Get Early Access' : 'Contact Me',
        description: contentType === 'resume'
          ? `Interested in working together? Let's connect.`
          : contentType === 'coming-soon'
            ? 'Be the first to know when we launch.'
            : `Have questions? I'd love to hear from you.`,
      },
    });
    blocks.push({
      id: genId(),
      type: 'chat',
      order: blocks.length,
      width: 2,
      config: {
        title: 'Quick Questions?',
        subtitle: 'Chat with AI for instant answers',
        placeholder: 'Ask anything...',
        position: 'inline',
        primaryColor: colors.primary,
      },
    });
  } else if (includeForm) {
    blocks.push({
      id: genId(),
      type: 'form',
      order: blocks.length,
      width: 4,
      config: {
        formId: '',
        title: contentType === 'resume' ? 'Let\'s Connect' : 'Get Started',
        description: contentType === 'resume'
          ? 'Reach out for opportunities, collaborations, or just to say hello.'
          : 'Fill out the form and I\'ll get back to you shortly.',
      },
    });
  } else if (includeChat) {
    blocks.push({
      id: genId(),
      type: 'chat',
      order: blocks.length,
      width: 4,
      config: {
        title: 'Have Questions?',
        subtitle: 'Get instant answers',
        placeholder: 'Type your question...',
        position: 'inline',
        primaryColor: colors.primary,
      },
    });
  }

  // 8. FINAL CTA
  blocks.push({
    id: genId(),
    type: 'cta',
    order: blocks.length,
    width: 4,
    config: {
      headline: extracted.ctaHeadline,
      description: extracted.ctaDescription,
      buttonText: extracted.cta,
      buttonLink: '#contact',
      backgroundColor: colors.primary,
      textColor: isLightStyle ? 'dark' : 'light',
    },
  });

  return blocks;
}

// Detect what type of content we're dealing with
function detectContentType(_original: string, lower: string): string {
  // Resume indicators
  const resumeIndicators = [
    'professional experience', 'work experience', 'employment', 'resume',
    'curriculum vitae', 'cv', 'professional summary', 'career',
    'years of experience', 'staff engineer', 'senior engineer', 'manager',
    'director', 'architect', 'developer', 'designer',
    '@', 'email', 'phone', 'linkedin'
  ];
  const resumeScore = resumeIndicators.filter(i => lower.includes(i)).length;
  if (resumeScore >= 3 || (lower.includes('experience') && lower.includes('|'))) {
    return 'resume';
  }

  // Other content types
  if (lower.includes('coming soon') || lower.includes('launching') || lower.includes('waitlist')) return 'coming-soon';
  if (lower.includes('portfolio') || lower.includes('my work') || lower.includes('projects')) return 'portfolio';
  if (lower.includes('saas') || lower.includes('software') || lower.includes('app') || lower.includes('platform')) return 'saas';
  if (lower.includes('service') || lower.includes('agency') || lower.includes('consulting')) return 'service';
  if (lower.includes('product') || lower.includes('shop') || lower.includes('buy')) return 'product';
  if (lower.includes('pricing') || lower.includes('plans')) return 'pricing';

  return 'general';
}

interface ExtractedContent {
  name: string;
  headline: string;
  subheadline: string;
  cta: string;
  ctaHeadline: string;
  ctaDescription: string;
  featuresTitle: string;
  featuresSubtitle: string;
  features: Array<{ icon: string; title: string; description: string }>;
  stats: Array<{ value: string; label: string }>;
  experiences: Array<{ title: string; company: string; description: string }>;
  pricing: Array<{ name: string; price: string; period: string; features: string[]; highlighted: boolean; buttonText: string; buttonLink: string }>;
}

function extractContent(description: string, contentType: string): ExtractedContent {
  const lines = description.split('\n').filter(l => l.trim());
  const lower = description.toLowerCase();

  // Extract name (first capitalized word sequence or first line)
  let name = '';
  const nameMatch = description.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/m);
  if (nameMatch) {
    name = nameMatch[1];
  } else if (lines[0] && lines[0].length < 50) {
    name = lines[0].replace(/[|•\-–]/g, '').trim().split(/\s{2,}/)[0];
  }

  // Extract title/role
  let title = '';
  const titlePatterns = [
    /(?:staff|senior|lead|principal|chief|head|director|manager|vp|cto|ceo|cfo|coo)\s+[\w\s]+(?:engineer|architect|developer|designer|analyst|scientist|manager|director)/i,
    /[\w\s]+(?:engineer|architect|developer|designer|analyst|scientist|consultant|specialist)/i,
  ];
  for (const pattern of titlePatterns) {
    const match = description.match(pattern);
    if (match) {
      title = match[0].trim();
      break;
    }
  }

  // Extract years of experience
  let yearsExp = '';
  const yearsMatch = description.match(/(\d+)\+?\s*years?\s*(?:of\s+)?experience/i);
  if (yearsMatch) {
    yearsExp = yearsMatch[1] + '+';
  }

  // Extract key skills/technologies
  const techKeywords = [
    'AWS', 'Azure', 'GCP', 'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js',
    'Docker', 'Kubernetes', 'AI', 'ML', 'Machine Learning', 'Cloud', 'DevOps',
    'Infrastructure', 'Security', 'Data', 'Analytics', 'API', 'Microservices',
    'Serverless', 'Lambda', 'DynamoDB', 'PostgreSQL', 'MongoDB', 'Redis',
    'CI/CD', 'Terraform', 'CloudFormation', 'SAM', 'FastAPI', 'Django', 'Flask'
  ];
  const foundTech = techKeywords.filter(t => lower.includes(t.toLowerCase()));

  // Extract achievements/metrics
  const achievements: string[] = [];
  const achievementPatterns = [
    /achieved\s+\$?[\d,]+[KkMm]?\+?\s*(?:annual\s+)?(?:savings|revenue|growth)/gi,
    /reduced\s+[\w\s]+by\s+\d+%/gi,
    /improved\s+[\w\s]+by\s+\d+%/gi,
    /\d+%\s+(?:reduction|improvement|growth|increase)/gi,
    /\$[\d,]+[KkMm]?\+?\s*(?:savings|revenue)/gi,
  ];
  for (const pattern of achievementPatterns) {
    const matches = description.match(pattern);
    if (matches) {
      achievements.push(...matches.slice(0, 2));
    }
  }

  // Extract experience entries
  const experiences: Array<{ title: string; company: string; description: string }> = [];
  const expPattern = /([A-Z][\w\s,]+)\n([A-Z][\w\s]+)\s*\|\s*(\w+\s+\d{4})/g;
  let expMatch;
  while ((expMatch = expPattern.exec(description)) !== null) {
    experiences.push({
      title: expMatch[1].trim(),
      company: expMatch[2].trim(),
      description: '',
    });
  }

  // Generate content based on type
  if (contentType === 'resume') {
    return {
      name,
      headline: name || 'Professional Portfolio',
      subheadline: title
        ? `${title}${yearsExp ? ` with ${yearsExp} years of experience` : ''}`
        : 'Driving innovation and delivering results',
      cta: 'Get in Touch',
      ctaHeadline: `Let's Work Together`,
      ctaDescription: 'Open to new opportunities and collaborations.',
      featuresTitle: 'Core Expertise',
      featuresSubtitle: 'Key skills and specializations',
      features: generateSkillFeatures(foundTech, lower),
      stats: generateResumeStats(yearsExp, achievements, lower),
      experiences,
      pricing: [],
    };
  }

  if (contentType === 'coming-soon') {
    return {
      name: name || 'Something Amazing',
      headline: `${name || 'Something Amazing'} is Coming`,
      subheadline: 'We\'re working on something special. Be the first to know when we launch.',
      cta: 'Notify Me',
      ctaHeadline: 'Don\'t Miss Out',
      ctaDescription: 'Join our waitlist for exclusive early access.',
      featuresTitle: 'What to Expect',
      featuresSubtitle: 'Here\'s a sneak peek',
      features: [
        { icon: 'zap', title: 'Lightning Fast', description: 'Built for speed and performance.' },
        { icon: 'shield', title: 'Secure by Design', description: 'Your data\'s safety is our priority.' },
        { icon: 'star', title: 'Beautiful Experience', description: 'Crafted with attention to every detail.' },
      ],
      stats: [],
      experiences: [],
      pricing: [],
    };
  }

  // Default/general extraction
  return {
    name: name || extractProductName(description),
    headline: generateSmartHeadline(description, name, contentType),
    subheadline: generateSmartSubheadline(description, contentType),
    cta: generateSmartCTA(lower, contentType),
    ctaHeadline: `Ready to Get Started?`,
    ctaDescription: `Take the next step and see what ${name || 'we'} can do for you.`,
    featuresTitle: contentType === 'service' ? 'Our Services' : 'Key Features',
    featuresSubtitle: contentType === 'service' ? 'How we can help' : 'Everything you need',
    features: extractSmartFeatures(description, lower, contentType),
    stats: [],
    experiences: [],
    pricing: extractPricingTiers(description),
  };
}

function generateSkillFeatures(tech: string[], lower: string): Array<{ icon: string; title: string; description: string }> {
  const features: Array<{ icon: string; title: string; description: string }> = [];

  // Map tech to feature categories
  if (tech.some(t => ['AWS', 'Azure', 'GCP', 'Cloud'].includes(t)) || lower.includes('cloud')) {
    features.push({ icon: 'cloud', title: 'Cloud Architecture', description: 'Designing and managing scalable cloud infrastructure across AWS, Azure, and GCP.' });
  }
  if (tech.some(t => ['AI', 'ML', 'Machine Learning'].includes(t)) || lower.includes('ai') || lower.includes('machine learning')) {
    features.push({ icon: 'zap', title: 'AI & Automation', description: 'Building intelligent systems that automate workflows and drive efficiency.' });
  }
  if (tech.some(t => ['Docker', 'Kubernetes', 'DevOps', 'CI/CD'].includes(t)) || lower.includes('devops')) {
    features.push({ icon: 'git-branch', title: 'DevOps & Infrastructure', description: 'Implementing CI/CD pipelines and container orchestration at scale.' });
  }
  if (lower.includes('team') || lower.includes('lead') || lower.includes('manage') || lower.includes('mentor')) {
    features.push({ icon: 'users', title: 'Technical Leadership', description: 'Leading and mentoring engineering teams to deliver exceptional results.' });
  }
  if (lower.includes('security') || lower.includes('secure') || lower.includes('zero-trust')) {
    features.push({ icon: 'shield', title: 'Security', description: 'Implementing enterprise-grade security and compliance measures.' });
  }
  if (lower.includes('cost') || lower.includes('optimization') || lower.includes('savings')) {
    features.push({ icon: 'target', title: 'Cost Optimization', description: 'Driving significant savings through strategic resource optimization.' });
  }

  // Fill with defaults if needed
  const defaults = [
    { icon: 'star', title: 'Problem Solving', description: 'Tackling complex challenges with innovative solutions.' },
    { icon: 'rocket', title: 'Fast Execution', description: 'Delivering results quickly without compromising quality.' },
    { icon: 'heart', title: 'Collaboration', description: 'Building strong relationships across teams and stakeholders.' },
  ];

  while (features.length < 3 && defaults.length > 0) {
    const def = defaults.shift()!;
    if (!features.some(f => f.icon === def.icon)) {
      features.push(def);
    }
  }

  return features.slice(0, 3);
}

function generateResumeStats(yearsExp: string, _achievements: string[], lower: string): Array<{ value: string; label: string }> {
  const stats: Array<{ value: string; label: string }> = [];

  if (yearsExp) {
    stats.push({ value: yearsExp, label: 'Years Experience' });
  }

  // Look for specific numbers
  const savingsMatch = lower.match(/\$(\d+)[kK]\+?/);
  if (savingsMatch) {
    stats.push({ value: `$${savingsMatch[1]}K+`, label: 'Cost Savings' });
  }

  const percentMatch = lower.match(/(\d+)%/);
  if (percentMatch && !stats.some(s => s.value.includes('%'))) {
    stats.push({ value: `${percentMatch[1]}%`, label: 'Improvement' });
  }

  // Server/infrastructure count
  const serverMatch = lower.match(/(\d+)\+?\s*servers?/);
  if (serverMatch) {
    stats.push({ value: `${serverMatch[1]}+`, label: 'Servers Managed' });
  }

  // Team size
  const teamMatch = lower.match(/(\d+)[-\s]?person\s+team/);
  if (teamMatch) {
    stats.push({ value: teamMatch[1], label: 'Team Size' });
  }

  return stats.slice(0, 4);
}

function extractProductName(description: string): string {
  const forMatch = description.match(/(?:for|called|named|introducing)\s+([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)?)/);
  if (forMatch) return forMatch[1];

  const capsMatch = description.match(/\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/);
  if (capsMatch) return capsMatch[1];

  return '';
}

function generateSmartHeadline(desc: string, name: string, contentType: string): string {
  const firstLine = desc.split('\n')[0].trim();
  if (firstLine.length > 5 && firstLine.length < 60) {
    return firstLine;
  }

  if (name) {
    if (contentType === 'saas') return `${name}: Work Smarter, Not Harder`;
    if (contentType === 'service') return `${name}: Results That Speak`;
    return name;
  }

  return 'Transform How You Work';
}

function generateSmartSubheadline(desc: string, contentType: string): string {
  const sentences = desc.split(/[.!?]+/).filter(s => s.trim().length > 20);
  if (sentences[1] && sentences[1].length < 150) {
    return sentences[1].trim();
  }

  if (contentType === 'saas') return 'The all-in-one platform that helps teams do more with less.';
  if (contentType === 'service') return 'We deliver results that matter, on time and on budget.';
  return 'Powerful features designed to help you succeed.';
}

function generateSmartCTA(lower: string, contentType: string): string {
  if (lower.includes('trial')) return 'Start Free Trial';
  if (lower.includes('demo')) return 'Request Demo';
  if (lower.includes('book') || lower.includes('call')) return 'Book a Call';
  if (contentType === 'service') return 'Get a Quote';
  return 'Get Started';
}

function extractSmartFeatures(_desc: string, lower: string, _contentType: string): Array<{ icon: string; title: string; description: string }> {
  const features: Array<{ icon: string; title: string; description: string }> = [];

  const featureMap: Record<string, { icon: string; title: string; description: string }> = {
    'ai': { icon: 'zap', title: 'AI-Powered', description: 'Leverage cutting-edge AI to automate and enhance your workflow.' },
    'fast': { icon: 'rocket', title: 'Lightning Fast', description: 'Optimized for speed so you can focus on what matters.' },
    'secure': { icon: 'shield', title: 'Enterprise Security', description: 'Bank-level encryption keeps your data safe.' },
    'team': { icon: 'users', title: 'Team Collaboration', description: 'Work together seamlessly with your entire team.' },
    'analytic': { icon: 'target', title: 'Rich Analytics', description: 'Actionable insights from comprehensive data.' },
    'integrat': { icon: 'globe', title: 'Easy Integrations', description: 'Connect with tools you already use.' },
    'automat': { icon: 'zap', title: 'Automation', description: 'Automate repetitive tasks and save time.' },
    'support': { icon: 'heart', title: '24/7 Support', description: 'Our team is always here to help.' },
  };

  for (const [keyword, feature] of Object.entries(featureMap)) {
    if (lower.includes(keyword) && features.length < 3) {
      features.push(feature);
    }
  }

  const defaults = [
    { icon: 'zap', title: 'Powerful', description: 'Everything you need in one place.' },
    { icon: 'shield', title: 'Reliable', description: 'Dependable performance you can trust.' },
    { icon: 'heart', title: 'Loved', description: 'Trusted by thousands of happy customers.' },
  ];

  while (features.length < 3) {
    features.push(defaults[features.length]);
  }

  return features;
}

function extractPricingTiers(desc: string): Array<{ name: string; price: string; period: string; features: string[]; highlighted: boolean; buttonText: string; buttonLink: string }> {
  const priceMatches = desc.match(/\$\d+(?:\/mo)?/gi);
  if (!priceMatches || priceMatches.length < 2) return [];

  return [
    { name: 'Starter', price: 'Free', period: '', features: ['Core features', 'Community support'], highlighted: false, buttonText: 'Get Started', buttonLink: '#' },
    { name: 'Pro', price: priceMatches[0].replace(/\/mo/i, ''), period: '/month', features: ['Everything in Starter', 'Priority support', 'Advanced features'], highlighted: true, buttonText: 'Start Trial', buttonLink: '#' },
    { name: 'Enterprise', price: 'Custom', period: '', features: ['Everything in Pro', 'Dedicated support', 'Custom integrations'], highlighted: false, buttonText: 'Contact Us', buttonLink: '#' },
  ];
}

function generateContextualFAQ(name: string, contentType: string, _extracted: ExtractedContent): Array<{ question: string; answer: string }> {
  const productName = name || 'our solution';

  if (contentType === 'saas') {
    return [
      { question: `How does ${productName} work?`, answer: 'Sign up for free, complete a quick setup, and you\'re ready to go. Our intuitive interface makes it easy to get started in minutes.' },
      { question: 'Is there a free trial?', answer: 'Yes! We offer a 14-day free trial with full access to all features. No credit card required.' },
      { question: 'Can I cancel anytime?', answer: 'Absolutely. No long-term contracts or cancellation fees. Cancel anytime.' },
    ];
  }

  return [
    { question: 'How do I get started?', answer: 'Reach out through our contact form or chat. We\'ll schedule a call to understand your needs.' },
    { question: 'What is your turnaround time?', answer: 'Most projects complete within 2-4 weeks, depending on scope.' },
  ];
}

function formatExperience(experiences: Array<{ title: string; company: string; description: string }>): string {
  if (experiences.length === 0) return '';

  let text = '## Professional Experience\n\n';
  for (const exp of experiences.slice(0, 3)) {
    text += `**${exp.title}**\n${exp.company}\n\n`;
  }
  return text;
}
