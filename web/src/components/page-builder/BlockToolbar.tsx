import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
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
  Plus,
  MessageCircle,
} from 'lucide-react';
import { BLOCK_TYPES, BlockType } from './types';

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'layout-template': LayoutTemplate,
  'grid-3x3': Grid3x3,
  'mouse-pointer-click': MousePointerClick,
  'file-text': FileText,
  quote: Quote,
  'help-circle': HelpCircle,
  type: Type,
  image: Image,
  'bar-chart-2': BarChart2,
  minus: Minus,
  'credit-card': CreditCard,
  'play-circle': PlayCircle,
  'message-circle': MessageCircle,
};

interface DraggableBlockProps {
  type: BlockType;
  label: string;
  icon: string;
  description: string;
  onQuickAdd?: (type: BlockType) => void;
}

function DraggableBlock({ type, label, icon, description, onQuickAdd }: DraggableBlockProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `new-${type}`,
    data: { type, isNew: true },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = iconMap[icon] || FileText;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-indigo-300 hover:shadow-sm transition-all group"
    >
      {/* Drag handle area */}
      <div
        {...listeners}
        {...attributes}
        className="p-2 bg-gray-100 rounded-lg cursor-grab active:cursor-grabbing group-hover:bg-indigo-100 transition-colors"
      >
        <Icon className="w-4 h-4 text-gray-600 group-hover:text-indigo-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 truncate">{description}</p>
      </div>
      {/* Quick add button */}
      {onQuickAdd && (
        <button
          onClick={() => onQuickAdd(type)}
          className="p-1.5 rounded-md text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 opacity-0 group-hover:opacity-100 transition-all"
          title="Click to add"
        >
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

interface BlockToolbarProps {
  className?: string;
  onQuickAdd?: (type: BlockType) => void;
}

export default function BlockToolbar({ className = '', onQuickAdd }: BlockToolbarProps) {
  return (
    <div className={`w-64 bg-gray-50 border-r border-gray-200 flex flex-col ${className}`}>
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">
          Add Blocks
        </h3>
        <p className="text-xs text-gray-500">
          Drag to canvas or click + to add
        </p>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-2">
          {BLOCK_TYPES.map((blockType) => (
            <DraggableBlock
              key={blockType.type}
              type={blockType.type}
              label={blockType.label}
              icon={blockType.icon}
              description={blockType.description}
              onQuickAdd={onQuickAdd}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
