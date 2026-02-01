import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Settings, Trash2, Copy } from 'lucide-react';
import { PageBlock, getBlockTypeInfo } from './types';

interface BlockWrapperProps {
  block: PageBlock;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  children: React.ReactNode;
}

export default function BlockWrapper({
  block,
  isSelected,
  onSelect,
  onDelete,
  onDuplicate,
  children,
}: BlockWrapperProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const typeInfo = getBlockTypeInfo(block.type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group ${isDragging ? 'z-50' : ''}`}
    >
      {/* Block container */}
      <div
        onClick={onSelect}
        className={`relative border-2 rounded-lg transition-all cursor-pointer ${
          isDragging
            ? 'opacity-50 shadow-2xl'
            : isSelected
            ? 'border-indigo-500 shadow-lg'
            : 'border-transparent hover:border-gray-300'
        } ${isSelected ? 'ring-2 ring-indigo-200' : ''}`}
      >
        {/* Top bar with controls */}
        <div
          className={`absolute -top-8 left-0 right-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity ${
            isSelected ? 'opacity-100' : ''
          }`}
        >
          {/* Drag handle */}
          <button
            {...attributes}
            {...listeners}
            className="p-1.5 bg-gray-800 text-white rounded cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>

          {/* Block type label */}
          <span className="px-2 py-1 bg-gray-800 text-white text-xs font-medium rounded">
            {typeInfo?.label || block.type}
          </span>

          <div className="flex-1" />

          {/* Action buttons */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            className="p-1.5 bg-gray-800 text-white rounded hover:bg-gray-700"
            title="Duplicate block"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
            className="p-1.5 bg-gray-800 text-white rounded hover:bg-gray-700"
            title="Configure block"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1.5 bg-red-600 text-white rounded hover:bg-red-700"
            title="Delete block"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Block content */}
        <div className="overflow-hidden rounded-lg">
          {children}
        </div>
      </div>
    </div>
  );
}
