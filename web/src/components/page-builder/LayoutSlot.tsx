import { useState, useRef } from 'react';
import {
  ChevronDown,
  Check,
  Trash2,
  GripVertical,
  Sparkles,
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
  Pencil,
  Settings,
} from 'lucide-react';
import {
  PageBlock,
  BlockType,
  ColSpan,
  BLOCK_TYPES,
  getWidthLabel,
} from './types';
import BlockRenderer, { blockHasContent } from './BlockRenderer';
import BlockSettingsModal from './BlockSettingsModal';

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
  placeholder: Sparkles,
};

// Form data for the form block
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

interface LayoutSlotProps {
  slot: PageBlock;
  isSelected: boolean;
  onSelect: () => void;
  onTypeChange: (type: BlockType | 'placeholder') => void;
  onDelete: () => void;
  onWidthChange: (width: ColSpan) => void;
  onConfigChange?: (config: Record<string, unknown>) => void;
  showDeleteButton?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  forms?: FormInfo[];
  workspaceId?: string;
}

export default function LayoutSlot({
  slot,
  isSelected,
  onSelect,
  onTypeChange,
  onDelete,
  onWidthChange,
  onConfigChange,
  showDeleteButton = true,
  forms = [],
  workspaceId,
}: LayoutSlotProps) {
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showWidthDropdown, setShowWidthDropdown] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const widthDropdownRef = useRef<HTMLDivElement>(null);

  const isPlaceholder = slot.type === 'placeholder';
  const blockTypeInfo = !isPlaceholder
    ? BLOCK_TYPES.find((b) => b.type === slot.type)
    : null;
  const IconComponent = BLOCK_ICONS[slot.type] || Sparkles;
  const colSpan = slot.colSpan ?? 12;
  const hasContent = blockHasContent(slot);

  // Get label for current block type
  const getTypeLabel = () => {
    if (isPlaceholder) return 'Select Type';
    return blockTypeInfo?.label || slot.type;
  };

  // Width options
  const widthOptions: { value: ColSpan; label: string }[] = [
    { value: 12, label: 'Full Width' },
    { value: 8, label: '2/3 Width' },
    { value: 6, label: 'Half Width' },
    { value: 4, label: '1/3 Width' },
  ];

  // Handle config change from inline editing
  const handleConfigChange = (config: Record<string, unknown>) => {
    onConfigChange?.(config);
  };

  // Toggle edit mode
  const toggleEditMode = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(!isEditing);
  };

  return (
    <div
      className={`
        relative group rounded-xl border-2 transition-all duration-200 overflow-hidden min-h-[140px] flex flex-col
        ${isSelected
          ? 'border-purple-500 ring-2 ring-purple-200 shadow-lg'
          : isPlaceholder
            ? 'border-dashed border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/30'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md'
        }
      `}
      onClick={onSelect}
    >
      {/* Top Bar - Always visible */}
      <div className={`
        flex items-center justify-between p-2 border-b transition-colors z-10 relative
        ${hasContent ? 'bg-white/90 backdrop-blur-sm' : 'bg-white border-gray-100'}
      `}>
        {/* Left: Drag handle + Type dropdown */}
        <div className="flex items-center gap-2">
          {/* Drag Handle */}
          <div className="cursor-grab text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
            <GripVertical className="w-4 h-4" />
          </div>

          {/* Block Type Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowTypeDropdown(!showTypeDropdown);
                setShowWidthDropdown(false);
              }}
              className={`
                flex items-center gap-2 px-2 py-1 rounded-lg text-sm font-medium transition-colors
                ${isPlaceholder
                  ? 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  : 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                }
              `}
            >
              <IconComponent className="w-4 h-4" />
              {getTypeLabel()}
              <ChevronDown className="w-3 h-3" />
            </button>

            {/* Type Dropdown Menu */}
            {showTypeDropdown && (
              <div className="absolute z-50 top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-200 py-1 max-h-64 overflow-y-auto">
                {/* Let AI Decide option */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTypeChange('placeholder');
                    setShowTypeDropdown(false);
                  }}
                  className={`
                    w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50
                    ${isPlaceholder ? 'bg-purple-50 text-purple-700' : 'text-gray-700'}
                  `}
                >
                  <Sparkles className="w-4 h-4" />
                  <div>
                    <p className="text-sm font-medium">Let AI Decide</p>
                    <p className="text-xs text-gray-500">AI chooses best block type</p>
                  </div>
                  {isPlaceholder && <Check className="w-4 h-4 ml-auto" />}
                </button>

                <div className="border-t border-gray-100 my-1" />

                {/* Block type options */}
                {BLOCK_TYPES.map((blockType) => {
                  const BlockIcon = BLOCK_ICONS[blockType.type] || Grid3x3;
                  const isCurrentType = slot.type === blockType.type;

                  return (
                    <button
                      key={blockType.type}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTypeChange(blockType.type);
                        setShowTypeDropdown(false);
                      }}
                      className={`
                        w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50
                        ${isCurrentType ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'}
                      `}
                    >
                      <BlockIcon className="w-4 h-4" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{blockType.label}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {blockType.description}
                        </p>
                      </div>
                      {isCurrentType && <Check className="w-4 h-4 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Edit button + Width selector + Selection indicator + Delete */}
        <div className="flex items-center gap-2">
          {/* Edit button - only for filled blocks */}
          {hasContent && onConfigChange && (
            <button
              onClick={toggleEditMode}
              className={`
                p-1 rounded transition-colors
                ${isEditing
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                }
              `}
              title={isEditing ? 'Exit edit mode' : 'Edit content'}
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}

          {/* Settings button - opens full settings modal */}
          {hasContent && onConfigChange && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowSettingsModal(true);
              }}
              className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
              title="Block settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {/* Width Dropdown */}
          <div className="relative" ref={widthDropdownRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowWidthDropdown(!showWidthDropdown);
                setShowTypeDropdown(false);
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
            >
              {getWidthLabel(colSpan)}
              <ChevronDown className="w-3 h-3" />
            </button>

            {showWidthDropdown && (
              <div className="absolute z-50 top-full right-0 mt-1 w-32 bg-white rounded-lg shadow-xl border border-gray-200 py-1">
                {widthOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={(e) => {
                      e.stopPropagation();
                      onWidthChange(option.value);
                      setShowWidthDropdown(false);
                    }}
                    className={`
                      w-full flex items-center justify-between px-3 py-1.5 text-sm text-left hover:bg-gray-50
                      ${colSpan === option.value ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'}
                    `}
                  >
                    {option.label}
                    {colSpan === option.value && <Check className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selection indicator */}
          <div
            className={`
              w-5 h-5 rounded-full flex items-center justify-center transition-colors
              ${isSelected
                ? 'bg-purple-500 text-white'
                : 'border-2 border-gray-300 text-transparent hover:border-gray-400'
              }
            `}
          >
            <Check className="w-3 h-3" />
          </div>

          {/* Delete button */}
          {showDeleteButton && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div
        className={`
          flex-1
          ${isPlaceholder ? 'p-4 flex flex-col items-center justify-center' : ''}
        `}
        onClick={(e) => {
          // Prevent slot selection when clicking inside content during edit mode
          if (isEditing) {
            e.stopPropagation();
          }
        }}
      >
        {isPlaceholder ? (
          // Placeholder state - show prompt
          <p className="text-sm text-gray-500 text-center">
            {isSelected ? (
              <span className="text-purple-600 font-medium flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Selected for AI generation
              </span>
            ) : (
              'Click to select for AI generation'
            )}
          </p>
        ) : hasContent ? (
          // Has content - render the actual block
          <div className="relative">
            <BlockRenderer
              block={slot}
              isEditing={isEditing}
              onConfigChange={handleConfigChange}
              forms={forms}
            />
            {/* Selection overlay when selected but not editing */}
            {isSelected && !isEditing && (
              <div className="absolute inset-0 bg-purple-500/5 pointer-events-none" />
            )}
          </div>
        ) : (
          // Has type but no content - show awaiting content state
          <div className="p-6 flex flex-col items-center justify-center flex-1 bg-gray-50">
            <IconComponent className="w-8 h-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500 text-center">
              {blockTypeInfo?.description || `${slot.type} section`}
            </p>
            {isSelected ? (
              <p className="text-xs text-purple-600 mt-2 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Ready for AI generation
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-2">
                Select to generate content
              </p>
            )}
          </div>
        )}
      </div>

      {/* Selection border overlay */}
      {isSelected && (
        <div className="absolute inset-0 rounded-xl pointer-events-none border-2 border-purple-500" />
      )}

      {/* Block Settings Modal */}
      {showSettingsModal && onConfigChange && (
        <BlockSettingsModal
          isOpen={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          block={slot}
          onConfigChange={handleConfigChange}
          forms={forms}
          workspaceId={workspaceId}
        />
      )}
    </div>
  );
}
