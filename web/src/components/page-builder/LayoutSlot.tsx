import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  Settings,
  Search,
  Copy,
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

// Icon mapping for blocks — exported for reuse
export const BLOCK_ICONS: Record<string, React.ElementType> = {
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

// ==================== BlockTypePicker ====================

interface BlockTypePickerProps {
  currentType?: BlockType | 'placeholder';
  onSelect: (type: BlockType | 'placeholder') => void;
  onClose: () => void;
  showAiOption?: boolean;
  anchorEl?: HTMLElement | null;
}

export function BlockTypePicker({ currentType, onSelect, onClose, showAiOption = true, anchorEl }: BlockTypePickerProps) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          !(anchorEl && anchorEl.contains(e.target as Node))) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorEl]);

  const filtered = BLOCK_TYPES.filter((bt) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return bt.label.toLowerCase().includes(q) || bt.description.toLowerCase().includes(q);
  });

  // Compute position when anchored to an element (portal mode)
  const getAnchorStyle = (): React.CSSProperties | undefined => {
    if (!anchorEl) return undefined;
    const rect = anchorEl.getBoundingClientRect();
    const pickerWidth = 288;
    let top = rect.bottom + 4;
    let left = rect.left;
    if (left + pickerWidth > window.innerWidth) left = window.innerWidth - pickerWidth - 8;
    if (top + 350 > window.innerHeight) { top = rect.top - 350 - 4; if (top < 0) top = 8; }
    return { position: 'fixed', top, left, zIndex: 80 };
  };

  const picker = (
    <div
      ref={ref}
      className={anchorEl
        ? "w-72 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
        : "absolute z-50 top-full left-0 mt-1 w-72 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
      }
      style={getAnchorStyle()}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Search */}
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search blocks..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300"
          />
        </div>
      </div>

      {/* AI option */}
      {showAiOption && !search && (
        <button
          onClick={() => { onSelect('placeholder'); onClose(); }}
          className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors border-b border-gray-100 ${
            currentType === 'placeholder' ? 'bg-purple-50 text-purple-700' : 'text-gray-700 hover:bg-purple-50'
          }`}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Let AI Decide</p>
            <p className="text-xs text-gray-500">AI chooses best block</p>
          </div>
          {currentType === 'placeholder' && <Check className="w-4 h-4 text-purple-600" />}
        </button>
      )}

      {/* 4-column icon grid */}
      <div className="p-2 grid grid-cols-4 gap-1 max-h-64 overflow-y-auto">
        {filtered.map((blockType) => {
          const BlockIcon = BLOCK_ICONS[blockType.type] || Grid3x3;
          const isCurrentType = currentType === blockType.type;

          return (
            <button
              key={blockType.type}
              onClick={() => { onSelect(blockType.type); onClose(); }}
              className={`flex flex-col items-center gap-1 p-2 rounded-lg text-center transition-colors ${
                isCurrentType
                  ? 'bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
              title={blockType.description}
            >
              <BlockIcon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-tight truncate w-full">{blockType.label}</span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-center text-sm text-gray-400 py-4">No matching blocks</p>
      )}
    </div>
  );

  return anchorEl ? createPortal(picker, document.body) : picker;
}

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
  onDuplicate?: () => void;
  showDeleteButton?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  forms?: FormInfo[];
  workspaceId?: string;
  pageId?: string;
  previewMode?: boolean;
}

export default function LayoutSlot({
  slot,
  isSelected,
  onSelect,
  onTypeChange,
  onDelete,
  onWidthChange,
  onConfigChange,
  onDuplicate,
  showDeleteButton = true,
  forms = [],
  workspaceId,
  pageId,
  previewMode = false,
}: LayoutSlotProps) {
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [showWidthDropdown, setShowWidthDropdown] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const widthDropdownRef = useRef<HTMLDivElement>(null);
  const typeButtonRef = useRef<HTMLButtonElement>(null);
  const widthButtonRef = useRef<HTMLButtonElement>(null);
  const [toolbarPos, setToolbarPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Position floating toolbar above the slot
  const updateToolbarPosition = useCallback(() => {
    if (!slotRef.current || !isSelected || previewMode) {
      setToolbarPos(null);
      return;
    }
    const rect = slotRef.current.getBoundingClientRect();
    const scrollTop = window.scrollY;
    const above = rect.top + scrollTop - 44;
    const below = rect.bottom + scrollTop + 4;
    // If too close to top, show below
    const top = rect.top < 60 ? below : above;
    setToolbarPos({ top, left: rect.left + rect.width / 2, width: rect.width });
  }, [isSelected, previewMode]);

  useEffect(() => {
    updateToolbarPosition();
    window.addEventListener('scroll', updateToolbarPosition, true);
    window.addEventListener('resize', updateToolbarPosition);
    return () => {
      window.removeEventListener('scroll', updateToolbarPosition, true);
      window.removeEventListener('resize', updateToolbarPosition);
    };
  }, [updateToolbarPosition]);

  // Auto-activate inline editing when slot is selected and has content
  const hasContentVal = blockHasContent(slot);
  const isEditing = isSelected && hasContentVal && !!onConfigChange;

  // Type dropdown click-outside is handled by BlockTypePicker's own handler.
  // Width dropdown click-outside is handled by its portal overlay.

  const isPlaceholder = slot.type === 'placeholder';
  const blockTypeInfo = !isPlaceholder
    ? BLOCK_TYPES.find((b) => b.type === slot.type)
    : null;
  const IconComponent = BLOCK_ICONS[slot.type] || Sparkles;
  const colSpan = slot.colSpan ?? 12;
  const hasContent = hasContentVal;

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

  // Preview mode: render only the block content, no chrome
  if (previewMode) {
    if (isPlaceholder || !hasContent) return null;
    return (
      <div className="overflow-hidden">
        <BlockRenderer block={slot} isEditing={false} forms={forms} workspaceId={workspaceId} />
      </div>
    );
  }

  return (
    <>
      <div
        ref={slotRef}
        className={`
          relative group rounded-xl border-2 transition-all duration-200 min-h-[140px] flex flex-col
          ${isSelected
            ? 'border-indigo-500 ring-2 ring-indigo-200 shadow-lg'
            : isPlaceholder
              ? 'border-dashed border-gray-300 bg-gray-50 hover:border-dashed hover:border-blue-400 hover:bg-indigo-50/30'
              : 'border-transparent bg-white hover:border-dashed hover:border-blue-400 hover:shadow-md'
          }
        `}
        onClick={onSelect}
      >
        {/* Hover type label - shows block type on hover before selection */}
        {!isPlaceholder && !isSelected && (
          <div className="absolute -top-3 left-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-500 text-white text-xs font-medium rounded shadow-sm">
              <IconComponent className="w-3 h-3" />
              {getTypeLabel()}
            </span>
          </div>
        )}
        {/* Top Bar - type & width controls */}
        <div className={`
          flex items-center justify-between p-2 border-b transition-colors z-10 relative
          ${hasContent ? 'bg-white/90 backdrop-blur-sm' : 'bg-white border-gray-100'}
        `}>
          {/* Left: Drag handle + Type dropdown */}
          <div className="flex items-center gap-2">
            <div className="cursor-grab text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="w-4 h-4" />
            </div>

            <div className="relative" ref={dropdownRef}>
              <button
                ref={typeButtonRef}
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

              {showTypeDropdown && (
                <BlockTypePicker
                  currentType={slot.type as BlockType | 'placeholder'}
                  onSelect={(type) => onTypeChange(type)}
                  onClose={() => setShowTypeDropdown(false)}
                  anchorEl={typeButtonRef.current}
                />
              )}
            </div>
          </div>

          {/* Right: Width + Selection indicator */}
          <div className="flex items-center gap-2">
            {/* Width Dropdown */}
            <div className="relative" ref={widthDropdownRef}>
              <button
                ref={widthButtonRef}
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
            </div>

            {/* Selection indicator */}
            <div
              className={`
                w-5 h-5 rounded-full flex items-center justify-center transition-colors
                ${isSelected
                  ? 'bg-indigo-500 text-white'
                  : 'border-2 border-gray-300 text-transparent hover:border-gray-400'
                }
              `}
            >
              <Check className="w-3 h-3" />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div
          className={`
            flex-1 overflow-hidden
            ${isPlaceholder ? 'p-4 flex flex-col items-center justify-center' : ''}
          `}
          onClick={(e) => {
            if (isEditing) e.stopPropagation();
          }}
        >
          {isPlaceholder ? (
            <p className="text-sm text-gray-500 text-center">
              {isSelected ? (
                <span className="text-indigo-600 font-medium flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Selected for AI generation
                </span>
              ) : (
                'Click to select for AI generation'
              )}
            </p>
          ) : hasContent ? (
            <div className="relative">
              <BlockRenderer
                block={slot}
                isEditing={isEditing}
                onConfigChange={handleConfigChange}
                forms={forms}
                workspaceId={workspaceId}
              />
            </div>
          ) : (
            <div className="p-6 flex flex-col items-center justify-center flex-1 bg-gray-50">
              <IconComponent className="w-8 h-8 text-gray-300 mb-2" />
              <p className="text-sm text-gray-500 text-center">
                {blockTypeInfo?.description || `${slot.type} section`}
              </p>
              {isSelected ? (
                <p className="text-xs text-indigo-600 mt-2 flex items-center gap-1">
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
          <div className="absolute inset-0 rounded-xl pointer-events-none border-2 border-indigo-500" />
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
            pageId={pageId}
          />
        )}
      </div>

      {/* Floating toolbar via portal - appears above slot on selection */}
      {isSelected && toolbarPos && !isPlaceholder && createPortal(
        <div
          className="fixed z-[60] flex items-center gap-1 px-2 py-1 bg-white rounded-lg shadow-lg border border-gray-200"
          style={{
            top: toolbarPos.top,
            left: toolbarPos.left,
            transform: 'translateX(-50%)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4 text-gray-400 cursor-grab" />
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          <span className="text-xs font-medium text-gray-600 px-1">{getTypeLabel()}</span>
          <div className="w-px h-4 bg-gray-200 mx-0.5" />
          {onDuplicate && (
            <button
              onClick={onDuplicate}
              className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
              title="Duplicate (Cmd+D)"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          )}
          {hasContent && onConfigChange && (
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
              title="Settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
          {showDeleteButton && (
            <button
              onClick={onDelete}
              className="p-1 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              title="Delete"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>,
        document.body
      )}

      {/* Width dropdown via portal */}
      {showWidthDropdown && createPortal(
        <>
          <div className="fixed inset-0 z-[79]" onMouseDown={() => setShowWidthDropdown(false)} />
          <div
            className="fixed z-[80] w-32 bg-white rounded-lg shadow-xl border border-gray-200 py-1"
            style={(() => {
              const rect = widthButtonRef.current?.getBoundingClientRect();
              if (!rect) return {};
              let top = rect.bottom + 4;
              const left = rect.right - 128;
              if (top + 150 > window.innerHeight) top = rect.top - 150 - 4;
              return { top, left };
            })()}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
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
        </>,
        document.body
      )}
    </>
  );
}
