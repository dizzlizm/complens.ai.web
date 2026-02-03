import { useCallback } from 'react';
import { Plus, Trash2, GripVertical, SplitSquareVertical } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  PageBlock,
  BlockType,
  ColSpan,
  LayoutRow as LayoutRowType,
  BLOCK_TYPES,
  colSpanToClass,
  canSplitSlot,
  getAvailableWidths,
} from './types';
import LayoutSlot from './LayoutSlot';

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

interface LayoutRowProps {
  row: LayoutRowType;
  rowId: string; // For sortable identification
  selectedSlotIds: Set<string>;
  onSelectSlot: (slotId: string) => void;
  onUpdateSlot: (slotId: string, updates: Partial<PageBlock>) => void;
  onDeleteSlot: (slotId: string) => void;
  onAddSlot: (rowIndex: number, colSpan: ColSpan) => void;
  onSplitSlot: (slotId: string) => void;
  onDeleteRow: (rowIndex: number) => void;
  isOnlyRow: boolean;
  activeSlotId?: string | null; // Currently dragged slot
  forms?: FormInfo[];
  workspaceId?: string;
}

// Wrapper component for draggable slots - uses useDraggable (NOT sortable)
// This allows slots to be dropped INTO rows rather than reordering like sortable items
function DraggableSlot({
  slot,
  children,
}: {
  slot: PageBlock;
  children: React.ReactNode;
}) {
  const slotSpan = slot.colSpan ?? 12;
  const canBeMoved = slotSpan <= 8; // Only allow moving slots that could fit somewhere

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `slot-${slot.id}`,
    disabled: !canBeMoved,
    data: {
      type: 'slot',
      slot,
    },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: isDragging ? 1000 : 'auto',
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative ${isDragging ? 'opacity-50' : ''}`}
    >
      {/* Drag handle overlay - only show for moveable slots */}
      {canBeMoved && (
        <div
          {...attributes}
          {...listeners}
          className="absolute top-12 left-2 z-20 p-1.5 bg-white border border-gray-300 rounded-lg shadow-md cursor-grab active:cursor-grabbing hover:bg-gray-50 transition-colors"
          title="Drag to move to another row"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical className="w-4 h-4 text-gray-600" />
        </div>
      )}
      {children}
    </div>
  );
}

export default function LayoutRow({
  row,
  rowId,
  selectedSlotIds,
  onSelectSlot,
  onUpdateSlot,
  onDeleteSlot,
  onAddSlot,
  onSplitSlot,
  onDeleteRow,
  isOnlyRow,
  activeSlotId,
  forms = [],
  workspaceId,
}: LayoutRowProps) {
  const { rowIndex, slots, totalSpan } = row;
  const remainingSpace = 12 - totalSpan;
  const canAddSlot = remainingSpace >= 4;
  const availableWidths = getAvailableWidths(totalSpan);

  // Setup sortable for row drag-and-drop
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: rowId });

  // Setup droppable for receiving slots from other rows
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `row-dropzone-${rowIndex}`,
    data: {
      type: 'row',
      rowIndex,
      remainingSpace,
      accepts: 'slot',
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Check if a slot can be dropped here (has room)
  // Active slot must exist and there must be space for at least a 1/3 width slot
  const canAcceptSlot = !!activeSlotId && remainingSpace >= 4;

  // Check if the currently dragged slot is from this row
  const isDraggingFromThisRow = activeSlotId && slots.some(s => s.id === activeSlotId);

  // Handle slot type change
  const handleSlotTypeChange = useCallback(
    (slotId: string, type: BlockType | 'placeholder') => {
      const slot = slots.find((s) => s.id === slotId);
      if (!slot) return;

      if (type === 'placeholder') {
        onUpdateSlot(slotId, { type: 'placeholder', config: {} });
      } else {
        // Get default config for block type
        const blockTypeInfo = BLOCK_TYPES.find((b) => b.type === type);

        onUpdateSlot(slotId, {
          type,
          config: blockTypeInfo?.defaultConfig || {},
        });
      }
    },
    [slots, onUpdateSlot]
  );

  // Handle slot width change
  const handleSlotWidthChange = useCallback(
    (slotId: string, newColSpan: ColSpan) => {
      onUpdateSlot(slotId, { colSpan: newColSpan });
    },
    [onUpdateSlot]
  );

  // Handle slot config change (from inline editing)
  const handleSlotConfigChange = useCallback(
    (slotId: string, config: Record<string, unknown>) => {
      onUpdateSlot(slotId, { config });
    },
    [onUpdateSlot]
  );

  // Handle add slot with best available width
  const handleAddSlot = useCallback(() => {
    if (availableWidths.length === 0) return;
    // Prefer half-width if available, otherwise largest available
    const preferredWidth = availableWidths.includes(6)
      ? 6
      : availableWidths[0];
    onAddSlot(rowIndex, preferredWidth);
  }, [rowIndex, availableWidths, onAddSlot]);

  // Check if a slot can be split
  const canSlotBeSplit = (slot: PageBlock) => {
    const slotSpan = slot.colSpan ?? 12;
    // Can split if slot is 8 or 12 columns AND there's room for two halves
    return canSplitSlot(slotSpan) && (slotSpan === 12 || slotSpan === 8);
  };

  // Show drop indicator when: dragging over, can accept, and not from this row
  const showDropIndicator = isOver && canAcceptSlot && !isDraggingFromThisRow;

  // Highlight potential drop targets when dragging
  const showPotentialTarget = canAcceptSlot && !isDraggingFromThisRow && !isOver;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group/row relative ${isDragging ? 'z-50' : ''}`}
    >
      {/* Row controls on hover */}
      <div className="absolute -left-10 top-0 bottom-0 flex flex-col items-center justify-center opacity-0 group-hover/row:opacity-100 transition-opacity">
        {/* Drag handle for row - now functional */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1 touch-none"
          title="Drag to reorder row"
        >
          <GripVertical className="w-5 h-5" />
        </div>
        {/* Delete row button - only show if not the only row */}
        {!isOnlyRow && (
          <button
            onClick={() => onDeleteRow(rowIndex)}
            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            title="Delete row"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Droppable zone for receiving slots - separate from sortable row */}
      <div
        ref={setDropRef}
        className={`rounded-xl transition-all ${
          showDropIndicator ? 'ring-2 ring-indigo-400 ring-offset-2 bg-indigo-50/50' : ''
        } ${showPotentialTarget ? 'ring-1 ring-indigo-200 ring-offset-1 bg-indigo-50/20' : ''}`}
      >
        {/* Row content - 12 column grid */}
        <div className="grid grid-cols-12 gap-4 items-stretch">
        {slots.map((slot, slotIndex) => (
          <div
            key={slot.id}
            className={`${colSpanToClass(slot.colSpan ?? 12)} relative group/slot`}
          >
            <DraggableSlot slot={slot}>
              <LayoutSlot
                slot={slot}
                isSelected={selectedSlotIds.has(slot.id)}
                onSelect={() => onSelectSlot(slot.id)}
                onTypeChange={(type) => handleSlotTypeChange(slot.id, type)}
                onDelete={() => onDeleteSlot(slot.id)}
                onWidthChange={(width) => handleSlotWidthChange(slot.id, width)}
                onConfigChange={(config) => handleSlotConfigChange(slot.id, config)}
                showDeleteButton={slots.length > 1 || !isOnlyRow}
                isFirst={slotIndex === 0}
                isLast={slotIndex === slots.length - 1}
                forms={forms}
                workspaceId={workspaceId}
              />
            </DraggableSlot>

            {/* Split button - show on hover for wide slots */}
            {canSlotBeSplit(slot) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSplitSlot(slot.id);
                }}
                className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 p-1.5 bg-white border border-gray-200 rounded-full shadow-md text-gray-500 hover:text-indigo-600 hover:border-indigo-300 opacity-0 group-hover/slot:opacity-100 transition-all"
                title="Split into two columns"
              >
                <SplitSquareVertical className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}

        {/* Drop zone indicator when dragging a slot */}
        {showDropIndicator && (
          <div
            className={`${colSpanToClass(remainingSpace >= 6 ? 6 : 4 as ColSpan)} flex items-center justify-center`}
          >
            <div className="w-full min-h-[120px] rounded-xl border-2 border-dashed border-indigo-400 bg-indigo-50/50 flex flex-col items-center justify-center gap-2 text-indigo-500">
              <Plus className="w-6 h-6" />
              <span className="text-sm font-medium">Drop here</span>
            </div>
          </div>
        )}

        {/* Add slot button - shows when there's remaining space and not dragging */}
        {canAddSlot && !activeSlotId && (
          <div
            className={`${colSpanToClass(remainingSpace >= 6 ? 6 : 4 as ColSpan)} flex items-center justify-center`}
          >
            <button
              onClick={handleAddSlot}
              className="w-full min-h-[120px] rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-indigo-600"
            >
              <Plus className="w-6 h-6" />
              <span className="text-sm font-medium">Add Column</span>
              <span className="text-xs text-gray-400">
                {availableWidths.includes(6) ? 'Half' : availableWidths.includes(4) ? '1/3' : 'Full'} width
              </span>
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
