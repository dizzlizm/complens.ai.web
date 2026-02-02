import { useState, useCallback } from 'react';
import {
  LayoutTemplate,
  Grid3x3,
  MousePointerClick,
  FileText,
  Quote,
  HelpCircle,
  Type,
  Image,
  BarChart2,
  Minus,
  CreditCard,
  PlayCircle,
  MessageCircle,
  Images,
  Play,
  Building2,
  Sparkles,
} from 'lucide-react';
import { BlockType, BLOCK_TYPES, BlockTypeInfo } from './types';

// Category definitions for organizing blocks
export const BLOCK_CATEGORIES = [
  {
    id: 'essential',
    label: 'Essential',
    description: 'Core landing page blocks',
    blocks: ['hero', 'features', 'cta', 'form'],
  },
  {
    id: 'social-proof',
    label: 'Social Proof',
    description: 'Build trust and credibility',
    blocks: ['testimonials', 'stats', 'logo-cloud'],
  },
  {
    id: 'content',
    label: 'Content',
    description: 'Rich content sections',
    blocks: ['text', 'faq', 'pricing'],
  },
  {
    id: 'media',
    label: 'Media',
    description: 'Visual content',
    blocks: ['image', 'video', 'gallery', 'slider'],
  },
  {
    id: 'interactive',
    label: 'Interactive',
    description: 'Engage visitors',
    blocks: ['chat'],
  },
  {
    id: 'layout',
    label: 'Layout',
    description: 'Visual structure',
    blocks: ['divider'],
  },
] as const;

// Icon mapping for blocks
const BLOCK_ICONS: Record<string, React.ElementType> = {
  hero: LayoutTemplate,
  features: Grid3x3,
  cta: MousePointerClick,
  form: FileText,
  testimonials: Quote,
  faq: HelpCircle,
  text: Type,
  image: Image,
  stats: BarChart2,
  divider: Minus,
  pricing: CreditCard,
  video: PlayCircle,
  chat: MessageCircle,
  gallery: Images,
  slider: Play,
  'logo-cloud': Building2,
};

interface BlockSelectionGridProps {
  onAddBlock: (type: BlockType) => void;
  onSynthesizeBlocks: (blockTypes: BlockType[]) => void;
  showCategories?: boolean;
}

export default function BlockSelectionGrid({
  onAddBlock,
  onSynthesizeBlocks,
  showCategories = true,
}: BlockSelectionGridProps) {
  const [selectedBlockTypes, setSelectedBlockTypes] = useState<Set<BlockType>>(new Set());
  const [hoveredBlock, setHoveredBlock] = useState<string | null>(null);

  // Handle block click - single click adds, Ctrl+click selects for synthesis
  const handleBlockClick = useCallback(
    (type: BlockType, event: React.MouseEvent) => {
      if (event.ctrlKey || event.metaKey) {
        // Toggle selection for synthesis
        setSelectedBlockTypes((prev) => {
          const newSet = new Set(prev);
          if (newSet.has(type)) {
            newSet.delete(type);
          } else {
            newSet.add(type);
          }
          return newSet;
        });
      } else {
        // Regular click - add block immediately
        onAddBlock(type);
        // Clear selection when adding single block
        setSelectedBlockTypes(new Set());
      }
    },
    [onAddBlock]
  );

  // Handle synthesize button click
  const handleSynthesize = useCallback(() => {
    if (selectedBlockTypes.size > 0) {
      onSynthesizeBlocks(Array.from(selectedBlockTypes));
    }
  }, [selectedBlockTypes, onSynthesizeBlocks]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedBlockTypes(new Set());
  }, []);

  // Get block info by type
  const getBlockInfo = (type: string): BlockTypeInfo | undefined => {
    return BLOCK_TYPES.find((b) => b.type === type);
  };

  // Render a single block tile
  const renderBlockTile = (type: string) => {
    const blockInfo = getBlockInfo(type);
    if (!blockInfo) return null;

    const IconComponent = BLOCK_ICONS[type] || Grid3x3;
    const isSelected = selectedBlockTypes.has(type as BlockType);
    const isHovered = hoveredBlock === type;

    return (
      <button
        key={type}
        onClick={(e) => handleBlockClick(type as BlockType, e)}
        onMouseEnter={() => setHoveredBlock(type)}
        onMouseLeave={() => setHoveredBlock(null)}
        className={`
          relative group p-4 rounded-xl border-2 transition-all duration-200
          ${isSelected
            ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
            : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-md'
          }
        `}
      >
        {/* Selection checkbox indicator */}
        {isSelected && (
          <div className="absolute top-2 right-2 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}

        {/* Icon */}
        <div
          className={`
            w-10 h-10 rounded-lg flex items-center justify-center mb-2 transition-colors
            ${isSelected
              ? 'bg-purple-100 text-purple-600'
              : 'bg-gray-100 text-gray-600 group-hover:bg-indigo-100 group-hover:text-indigo-600'
            }
          `}
        >
          <IconComponent className="w-5 h-5" />
        </div>

        {/* Label */}
        <p className={`text-sm font-medium ${isSelected ? 'text-purple-700' : 'text-gray-900'}`}>
          {blockInfo.label}
        </p>

        {/* Description on hover */}
        {isHovered && (
          <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg whitespace-nowrap shadow-lg">
            {blockInfo.description}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
          </div>
        )}
      </button>
    );
  };

  // Render blocks by category or as flat grid
  const renderBlocks = () => {
    if (showCategories) {
      return BLOCK_CATEGORIES.map((category) => (
        <div key={category.id} className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <h4 className="text-sm font-semibold text-gray-700">{category.label}</h4>
            <span className="text-xs text-gray-400">{category.description}</span>
          </div>
          <div className="grid grid-cols-4 gap-3">
            {category.blocks.map((type) => renderBlockTile(type))}
          </div>
        </div>
      ));
    }

    // Flat grid without categories
    return (
      <div className="grid grid-cols-4 gap-3">
        {BLOCK_TYPES.map((block) => renderBlockTile(block.type))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Add Blocks</h3>
          <p className="text-sm text-gray-500">
            Click to add • <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-xs font-mono">Ctrl</kbd>+click to select for AI synthesis
          </p>
        </div>

        {/* Synthesize button */}
        {selectedBlockTypes.size > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={clearSelection}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
            >
              Clear ({selectedBlockTypes.size})
            </button>
            <button
              onClick={handleSynthesize}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-medium rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all shadow-md shadow-purple-500/25"
            >
              <Sparkles className="w-4 h-4" />
              Synthesize Selected ({selectedBlockTypes.size})
            </button>
          </div>
        )}
      </div>

      {/* Block Grid */}
      {renderBlocks()}

      {/* Helper text at bottom */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          Select multiple blocks and click "Synthesize" to generate AI content for them all at once
        </p>
      </div>
    </div>
  );
}
