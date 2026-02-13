import { useState } from 'react';
import { Sparkles, Loader2, X, Wand2, Type, Zap } from 'lucide-react';
import { PageBlock } from './types';
import { useImproveBlock } from '../../lib/hooks/useAI';

interface MultiBlockAIToolbarProps {
  selectedBlocks: PageBlock[];
  workspaceId: string;
  pageId?: string;
  onUpdate: (updatedBlocks: PageBlock[]) => void;
  onClose: () => void;
  onClearSelection: () => void;
}

// Functional editing options only - tone/voice comes from the business profile
const AI_ACTIONS = [
  {
    id: 'cohesive',
    label: 'Make Cohesive',
    icon: Zap,
    description: 'Unify style across all selected blocks',
    instruction: 'Rewrite this content to flow better and have a consistent style. Ensure the messaging flows naturally from one section to another while maintaining brand voice.'
  },
  {
    id: 'improve',
    label: 'Improve All',
    icon: Sparkles,
    description: 'Make content more compelling',
    instruction: 'Improve this content to be more compelling and persuasive while maintaining the brand voice.'
  },
  {
    id: 'concise',
    label: 'Shorten All',
    icon: Type,
    description: 'Shorten while keeping impact',
    instruction: 'Make this content more concise and punchy. Remove unnecessary words while keeping the impact and brand voice.'
  },
  {
    id: 'benefits',
    label: 'More Benefits',
    icon: Type,
    description: 'Focus on value to the reader',
    instruction: 'Rewrite to focus more on benefits and value to the reader while maintaining the brand voice.'
  },
];

export default function MultiBlockAIToolbar({
  selectedBlocks,
  workspaceId,
  pageId,
  onUpdate,
  onClose,
  onClearSelection,
}: MultiBlockAIToolbarProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);
  const [customInstruction, setCustomInstruction] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const improveBlock = useImproveBlock(workspaceId);

  const handleAction = async (actionId: string, instruction: string) => {
    setIsProcessing(true);
    setCurrentAction(actionId);

    try {
      // Process each block with context of all selected blocks
      const allBlocksContext = selectedBlocks.map(b => ({
        type: b.type,
        content: JSON.stringify(b.config),
      }));

      const updatedBlocks = await Promise.all(
        selectedBlocks.map(async (block) => {
          // Create context-aware prompt
          const contextPrompt = `
You are updating one block that is part of a multi-block selection (${selectedBlocks.length} blocks selected).
Apply this change: "${instruction}"

Context of all selected blocks (to maintain consistency):
${allBlocksContext.map((b, i) => `Block ${i + 1} (${b.type}): ${b.content.substring(0, 200)}...`).join('\n')}

Maintain the same JSON structure but update the text content according to the instruction.`;

          try {
            const result = await improveBlock.mutateAsync({
              block_type: block.type,
              config: block.config,
              instruction: contextPrompt,
              page_id: pageId,
            });

            return {
              ...block,
              config: result || block.config,
            };
          } catch {
            return block; // Return unchanged on error
          }
        })
      );

      onUpdate(updatedBlocks);
      onClearSelection();
    } catch {
      // Multi-block AI update failed
    } finally {
      setIsProcessing(false);
      setCurrentAction(null);
    }
  };

  const handleCustomInstruction = () => {
    if (customInstruction.trim()) {
      handleAction('custom', customInstruction);
      setShowCustom(false);
      setCustomInstruction('');
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 min-w-[400px]">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-medium text-gray-900">
              AI Edit {selectedBlocks.length} Blocks
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Quick actions */}
        {!showCustom ? (
          <>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {AI_ACTIONS.map((action) => (
                <button
                  key={action.id}
                  onClick={() => handleAction(action.id, action.instruction)}
                  disabled={isProcessing}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all ${
                    currentAction === action.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                  } disabled:opacity-50`}
                >
                  {isProcessing && currentAction === action.id ? (
                    <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                  ) : (
                    <action.icon className="w-4 h-4 text-indigo-600" />
                  )}
                  <div>
                    <div className="text-sm font-medium text-gray-900">{action.label}</div>
                    <div className="text-xs text-gray-500">{action.description}</div>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowCustom(true)}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
            >
              <Wand2 className="w-4 h-4" />
              Custom instruction...
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <textarea
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              placeholder="Describe how you want to change these blocks..."
              className="w-full h-24 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowCustom(false)}
                className="flex-1 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCustomInstruction}
                disabled={!customInstruction.trim() || isProcessing}
                className="flex-1 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                Apply
              </button>
            </div>
          </div>
        )}

        {/* Progress indicator */}
        {isProcessing && (
          <div className="mt-3 text-center text-xs text-gray-500">
            Updating {selectedBlocks.length} blocks with AI...
          </div>
        )}
      </div>
    </div>
  );
}
