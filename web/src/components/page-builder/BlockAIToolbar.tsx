import { useState } from 'react';
import { Sparkles, Wand2, RefreshCw, ImagePlus, Loader2 } from 'lucide-react';
import { useCurrentWorkspace } from '../../lib/hooks/useWorkspaces';
import { useImproveBlock, useGenerateImage } from '../../lib/hooks/useAI';

interface BlockAIToolbarProps {
  blockType: string;
  config: Record<string, unknown>;
  onConfigChange: (config: Record<string, unknown>) => void;
  pageContext?: {
    headline?: string;
    subheadline?: string;
    other_blocks?: string[];
  };
  supportsImage?: boolean;
  imageField?: string;  // e.g., 'backgroundImage', 'url'
  pageDesign?: {
    style?: string;
    primaryColor?: string;
    secondaryColor?: string;
    accentColor?: string;
  };
}

// Functional editing options only - tone/voice comes from the business profile
const IMPROVEMENT_OPTIONS = [
  { id: 'improve', label: 'Make it better', instruction: 'Improve this content to be more compelling and persuasive while maintaining the brand voice' },
  { id: 'shorten', label: 'Make it shorter', instruction: 'Make this content more concise while keeping the key message and brand voice' },
  { id: 'expand', label: 'Add more detail', instruction: 'Expand this content with more details and examples while maintaining the brand voice' },
  { id: 'persuasive', label: 'Stronger CTA', instruction: 'Make the call-to-action more compelling and persuasive' },
  { id: 'benefits', label: 'More benefits', instruction: 'Rewrite to focus more on benefits and value to the reader' },
  { id: 'clarity', label: 'Clarify', instruction: 'Make this content clearer and easier to understand' },
];

export default function BlockAIToolbar({
  blockType,
  config,
  onConfigChange,
  pageContext,
  supportsImage = false,
  imageField = 'url',
  pageDesign,
}: BlockAIToolbarProps) {
  const { workspaceId } = useCurrentWorkspace();
  const [showOptions, setShowOptions] = useState(false);
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [imagePrompt, setImagePrompt] = useState('');

  const improveBlock = useImproveBlock(workspaceId || '');
  const generateImage = useGenerateImage(workspaceId || '');

  const handleImprove = async (instruction: string) => {
    if (!workspaceId) return;

    try {
      const improved = await improveBlock.mutateAsync({
        block_type: blockType,
        config,
        page_context: pageContext,
        instruction,
      });

      onConfigChange(improved);
      setShowOptions(false);
    } catch (err) {
      console.error('Failed to improve block:', err);
    }
  };

  const handleGenerateImage = async () => {
    if (!workspaceId || !imagePrompt.trim()) return;

    try {
      const result = await generateImage.mutateAsync({
        context: imagePrompt,
        style: pageDesign?.style || 'professional',
        colors: pageDesign?.primaryColor ? {
          primary: pageDesign.primaryColor,
          secondary: pageDesign.secondaryColor,
          accent: pageDesign.accentColor,
        } : undefined,
      });

      // For hero blocks, also set backgroundType to 'image' so it displays
      const updatedConfig: Record<string, unknown> = {
        ...config,
        [imageField]: result.url,
      };
      if (blockType === 'hero' && imageField === 'backgroundImage') {
        updatedConfig.backgroundType = 'image';
      }

      onConfigChange(updatedConfig);

      setShowImagePrompt(false);
      setImagePrompt('');
    } catch (err) {
      console.error('Failed to generate image:', err);
    }
  };

  const isLoading = improveBlock.isPending || generateImage.isPending;

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        {/* AI Improve Button */}
        <button
          onClick={() => setShowOptions(!showOptions)}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors disabled:opacity-50"
          title="AI Improve"
        >
          {improveBlock.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          <span>AI</span>
        </button>

        {/* Quick Improve */}
        <button
          onClick={() => handleImprove('Improve this content to be more compelling')}
          disabled={isLoading}
          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
          title="Quick improve"
        >
          <Wand2 className="w-4 h-4" />
        </button>

        {/* Regenerate */}
        <button
          onClick={() => handleImprove('Regenerate this content with a fresh perspective')}
          disabled={isLoading}
          className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
          title="Regenerate"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        {/* Generate Image (if supported) */}
        {supportsImage && (
          <button
            onClick={() => setShowImagePrompt(true)}
            disabled={isLoading}
            className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50"
            title="Generate image"
          >
            {generateImage.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ImagePlus className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Improvement Options Dropdown */}
      {showOptions && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          <div className="px-3 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-100">
            How should AI improve this?
          </div>
          {IMPROVEMENT_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => handleImprove(option.instruction)}
              disabled={isLoading}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50"
            >
              {option.label}
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              onClick={() => {
                setShowOptions(false);
                const customInstruction = prompt('Enter custom instruction for AI:');
                if (customInstruction) {
                  handleImprove(customInstruction);
                }
              }}
              disabled={isLoading}
              className="w-full px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-50"
            >
              Custom instruction...
            </button>
          </div>
        </div>
      )}

      {/* Image Generation Modal */}
      {showImagePrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-100 rounded-lg">
                <ImagePlus className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Generate Image</h3>
                <p className="text-sm text-gray-500">Describe the image you want</p>
              </div>
            </div>

            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder="e.g., A modern office with happy team members collaborating..."
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 mb-4"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowImagePrompt(false);
                  setImagePrompt('');
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerateImage}
                disabled={!imagePrompt.trim() || generateImage.isPending}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
              >
                {generateImage.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {showOptions && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowOptions(false)}
        />
      )}
    </div>
  );
}
