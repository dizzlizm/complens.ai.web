import { useState } from 'react';
import { Sparkles, X, Wand2, Zap, Type, ChevronDown, Loader2 } from 'lucide-react';
import { BlockType, BLOCK_TYPES, PageBlock } from './types';
import { useImproveBlock } from '../../lib/hooks/useAI';

// AI editing actions for content blocks (functional changes only - tone comes from profile)
const AI_EDIT_ACTIONS = [
  {
    id: 'improve',
    label: 'Improve',
    icon: Wand2,
    instruction: 'Improve this content to be more compelling and persuasive while maintaining the brand voice.',
  },
  {
    id: 'shorten',
    label: 'Shorten',
    icon: Type,
    instruction: 'Make this content more concise and punchy while keeping the impact and brand voice.',
  },
  {
    id: 'expand',
    label: 'Expand',
    icon: Type,
    instruction: 'Add more detail and depth to this content while maintaining the brand voice.',
  },
  {
    id: 'cohesive',
    label: 'Make Cohesive',
    icon: Zap,
    instruction: 'Rewrite this content to flow better and have a consistent style across all sections.',
  },
];

interface GenerateToolbarProps {
  selectedCount: number;
  selectedBlockTypes: BlockType[];
  selectedBlocks?: PageBlock[];
  workspaceId?: string;
  onGenerate: () => void;
  onClear: () => void;
  onUpdateBlocks?: (blocks: PageBlock[]) => void;
}

export default function GenerateToolbar({
  selectedCount,
  selectedBlockTypes,
  selectedBlocks = [],
  workspaceId,
  onGenerate,
  onClear,
  onUpdateBlocks,
}: GenerateToolbarProps) {
  const [showEditMenu, setShowEditMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentAction, setCurrentAction] = useState<string | null>(null);

  const improveBlock = useImproveBlock(workspaceId || '');

  // Get labels for selected block types
  const getBlockLabel = (type: BlockType): string => {
    const blockInfo = BLOCK_TYPES.find((b) => b.type === type);
    return blockInfo?.label || type;
  };

  // Count placeholder slots (ones where AI decides the type)
  const aiDecideCount = selectedCount - selectedBlockTypes.length;

  // Check if any selected blocks have content (not placeholders)
  const hasContentBlocks = selectedBlocks.some(
    (block) => block.type !== 'placeholder' && Object.keys(block.config || {}).length > 0
  );

  // Handle AI edit action
  const handleEditAction = async (actionId: string, instruction: string) => {
    if (!workspaceId || !onUpdateBlocks || selectedBlocks.length === 0) return;

    setIsEditing(true);
    setCurrentAction(actionId);
    setShowEditMenu(false);

    try {
      const contentBlocks = selectedBlocks.filter(
        (block) => block.type !== 'placeholder'
      );

      const updatedBlocks = await Promise.all(
        contentBlocks.map(async (block) => {
          try {
            const result = await improveBlock.mutateAsync({
              block_type: block.type,
              config: block.config,
              instruction,
            });
            return { ...block, config: result || block.config };
          } catch (err) {
            console.error(`Failed to improve block ${block.id}:`, err);
            return block;
          }
        })
      );

      // Merge updated blocks back with the full list
      const blockMap = new Map(updatedBlocks.map((b) => [b.id, b]));
      const finalBlocks = selectedBlocks.map((b) => blockMap.get(b.id) || b);
      onUpdateBlocks(finalBlocks);
    } catch (error) {
      console.error('AI edit failed:', error);
    } finally {
      setIsEditing(false);
      setCurrentAction(null);
    }
  };

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-4 flex items-center gap-4 min-w-[400px] animate-in slide-in-from-bottom-4 duration-200">
        {/* Selected info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900">
            {selectedCount} slot{selectedCount !== 1 ? 's' : ''} selected
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {selectedBlockTypes.slice(0, 3).map((type, idx) => (
              <span
                key={`${type}-${idx}`}
                className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full"
              >
                {getBlockLabel(type)}
              </span>
            ))}
            {aiDecideCount > 0 && (
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                {aiDecideCount} AI decide
              </span>
            )}
            {selectedBlockTypes.length > 3 && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                +{selectedBlockTypes.length - 3} more
              </span>
            )}
          </div>
        </div>

        {/* Clear button */}
        <button
          onClick={onClear}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Clear selection"
        >
          <X className="w-5 h-5" />
        </button>

        {/* AI Edit dropdown - shown when content blocks are selected */}
        {hasContentBlocks && workspaceId && onUpdateBlocks && (
          <div className="relative">
            <button
              onClick={() => setShowEditMenu(!showEditMenu)}
              disabled={isEditing}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50"
            >
              {isEditing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              <span>Edit</span>
              <ChevronDown className="w-4 h-4" />
            </button>

            {/* Edit dropdown menu */}
            {showEditMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowEditMenu(false)}
                />
                <div className="absolute bottom-full left-0 mb-2 w-48 bg-white rounded-xl shadow-xl border border-gray-200 py-1 z-50">
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-500 border-b border-gray-100">
                    AI Edit Options
                  </div>
                  {AI_EDIT_ACTIONS.map((action) => (
                    <button
                      key={action.id}
                      onClick={() => handleEditAction(action.id, action.instruction)}
                      disabled={isEditing}
                      className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {currentAction === action.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                      ) : (
                        <action.icon className="w-4 h-4 text-gray-400" />
                      )}
                      {action.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Generate button */}
        <button
          onClick={onGenerate}
          disabled={isEditing}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/25 disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          Generate Content
        </button>
      </div>
    </div>
  );
}
