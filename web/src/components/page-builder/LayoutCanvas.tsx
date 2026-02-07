import { useState, useCallback, useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import {
  DndContext,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  rectIntersection,
  CollisionDetection,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  PageBlock,
  BlockType,
  ColSpan,
  LayoutRow as LayoutRowType,
  groupBlocksIntoRows,
  flattenRowsToBlocks,
  createPlaceholderSlot,
} from './types';
import LayoutRow from './LayoutRow';
import GenerateToolbar from './GenerateToolbar';

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

interface LayoutCanvasProps {
  blocks: PageBlock[];
  onChange: (blocks: PageBlock[]) => void;
  onSynthesizeBlocks: (blockTypes: BlockType[], slotIds: string[]) => void;
  forms?: FormInfo[];
  workspaceId?: string;
  pageId?: string;
}

export default function LayoutCanvas({
  blocks,
  onChange,
  onSynthesizeBlocks,
  forms = [],
  workspaceId,
  pageId,
}: LayoutCanvasProps) {
  const [selectedSlotIds, setSelectedSlotIds] = useState<Set<string>>(new Set());
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);

  // Setup drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px movement required before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Custom collision detection that prioritizes drop zones for slots
  const customCollisionDetection: CollisionDetection = useCallback((args) => {
    const { active } = args;
    const activeId = String(active.id);

    // If dragging a slot, use pointerWithin to find drop zones
    if (activeId.startsWith('slot-')) {
      const pointerCollisions = pointerWithin(args);
      // Filter to only row-dropzone targets
      const dropZoneCollisions = pointerCollisions.filter(
        collision => String(collision.id).startsWith('row-dropzone-')
      );
      if (dropZoneCollisions.length > 0) {
        return dropZoneCollisions;
      }
      // Fallback to rect intersection
      const rectCollisions = rectIntersection(args);
      return rectCollisions.filter(
        collision => String(collision.id).startsWith('row-dropzone-')
      );
    }

    // For rows, use rect intersection
    return rectIntersection(args);
  }, []);

  // Derive rows directly from blocks - blocks is the source of truth
  const rows: LayoutRowType[] = useMemo(() => {
    if (blocks.length > 0) {
      return groupBlocksIntoRows(blocks);
    }
    // Return a default row with placeholder when no blocks
    return [
      {
        rowIndex: 0,
        slots: [createPlaceholderSlot(0, 12, 0)],
        totalSpan: 12,
      },
    ];
  }, [blocks]);

  // Helper to update blocks through parent
  const updateBlocks = useCallback(
    (newRows: LayoutRowType[]) => {
      const newBlocks = flattenRowsToBlocks(newRows);
      onChange(newBlocks);
    },
    [onChange]
  );

  // Get selected slots for display
  const selectedSlots = useMemo(() => {
    const slots: PageBlock[] = [];
    rows.forEach((row) => {
      row.slots.forEach((slot) => {
        if (selectedSlotIds.has(slot.id)) {
          slots.push(slot);
        }
      });
    });
    return slots;
  }, [rows, selectedSlotIds]);

  // Get block types from selected slots (for synthesis)
  const selectedBlockTypes = useMemo(() => {
    return selectedSlots
      .map((slot) => slot.type)
      .filter((type): type is BlockType => type !== 'placeholder');
  }, [selectedSlots]);

  // Toggle slot selection
  const handleSelectSlot = useCallback((slotId: string) => {
    setSelectedSlotIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(slotId)) {
        newSet.delete(slotId);
      } else {
        newSet.add(slotId);
      }
      return newSet;
    });
  }, []);

  // Clear all selections
  const clearSelection = useCallback(() => {
    setSelectedSlotIds(new Set());
  }, []);

  // Update a slot
  const handleUpdateSlot = useCallback(
    (slotId: string, updates: Partial<PageBlock>) => {
      const newRows = rows.map((row) => ({
        ...row,
        slots: row.slots.map((slot) =>
          slot.id === slotId ? { ...slot, ...updates } : slot
        ),
        totalSpan: row.slots.reduce(
          (sum, slot) =>
            sum +
            (slot.id === slotId ? (updates.colSpan ?? slot.colSpan ?? 12) : (slot.colSpan ?? 12)),
          0
        ),
      }));
      updateBlocks(newRows);
    },
    [rows, updateBlocks]
  );

  // Delete a slot
  const handleDeleteSlot = useCallback(
    (slotId: string) => {
      // Remove from selection
      setSelectedSlotIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(slotId);
        return newSet;
      });

      // Find the row containing the slot
      let rowToRemove = -1;
      const newRows = rows.map((row, rowIdx) => {
        const newSlots = row.slots.filter((slot) => slot.id !== slotId);

        // If row is now empty, mark for removal
        if (newSlots.length === 0) {
          rowToRemove = rowIdx;
          return row;
        }

        return {
          ...row,
          slots: newSlots,
          totalSpan: newSlots.reduce((sum, slot) => sum + (slot.colSpan ?? 12), 0),
        };
      });

      // Remove empty row if needed, but keep at least one row
      let filteredRows = rowToRemove >= 0 && newRows.length > 1
        ? newRows.filter((_, idx) => idx !== rowToRemove)
        : newRows;

      // Ensure at least one row with one slot exists
      if (filteredRows.every((row) => row.slots.length === 0)) {
        filteredRows = [
          {
            rowIndex: 0,
            slots: [createPlaceholderSlot(0, 12, 0)],
            totalSpan: 12,
          },
        ];
      }

      // Re-index rows
      filteredRows = filteredRows.map((row, idx) => ({
        ...row,
        rowIndex: idx,
        slots: row.slots.map((slot) => ({ ...slot, row: idx })),
      }));

      updateBlocks(filteredRows);
    },
    [rows, updateBlocks]
  );

  // Add a slot to a row
  const handleAddSlot = useCallback(
    (rowIndex: number, colSpan: ColSpan) => {
      const newSlot = createPlaceholderSlot(rowIndex, colSpan);

      const newRows = rows.map((row) => {
        if (row.rowIndex === rowIndex) {
          const currentColStart = row.slots.reduce(
            (sum, slot) => sum + (slot.colSpan ?? 12),
            0
          );
          return {
            ...row,
            slots: [...row.slots, { ...newSlot, colStart: currentColStart }],
            totalSpan: row.totalSpan + colSpan,
          };
        }
        return row;
      });

      updateBlocks(newRows);
    },
    [rows, updateBlocks]
  );

  // Split a slot into two equal slots
  const handleSplitSlot = useCallback(
    (slotId: string) => {
      const newRows = rows.map((row) => {
        const slotIndex = row.slots.findIndex((s) => s.id === slotId);
        if (slotIndex === -1) return row;

        const slot = row.slots[slotIndex];
        const currentSpan = slot.colSpan ?? 12;

        // Can only split if span is 8 or 12
        if (currentSpan < 8) return row;

        const newSpan = (currentSpan === 12 ? 6 : 4) as ColSpan;
        const currentColStart = slot.colStart ?? 0;

        // Create two new slots
        const slot1: PageBlock = {
          ...slot,
          colSpan: newSpan,
          colStart: currentColStart,
        };
        const slot2 = createPlaceholderSlot(row.rowIndex, newSpan, currentColStart + newSpan);

        // Replace the original slot with two new slots
        const newSlots = [
          ...row.slots.slice(0, slotIndex),
          slot1,
          slot2,
          ...row.slots.slice(slotIndex + 1),
        ];

        return {
          ...row,
          slots: newSlots,
          totalSpan: newSlots.reduce((sum, s) => sum + (s.colSpan ?? 12), 0),
        };
      });

      updateBlocks(newRows);
    },
    [rows, updateBlocks]
  );

  // Delete a row
  const handleDeleteRow = useCallback(
    (rowIndex: number) => {
      // Remove selections from deleted row
      const rowToDelete = rows.find((r) => r.rowIndex === rowIndex);
      if (rowToDelete) {
        setSelectedSlotIds((prev) => {
          const newSet = new Set(prev);
          rowToDelete.slots.forEach((slot) => newSet.delete(slot.id));
          return newSet;
        });
      }

      // Filter out the row and re-index
      let newRows = rows.filter((row) => row.rowIndex !== rowIndex);

      // Ensure at least one row exists
      if (newRows.length === 0) {
        newRows = [
          {
            rowIndex: 0,
            slots: [createPlaceholderSlot(0, 12, 0)],
            totalSpan: 12,
          },
        ];
      }

      // Re-index
      newRows = newRows.map((row, idx) => ({
        ...row,
        rowIndex: idx,
        slots: row.slots.map((slot) => ({ ...slot, row: idx })),
      }));

      updateBlocks(newRows);
    },
    [rows, updateBlocks]
  );

  // Add a new row at the bottom
  const handleAddRow = useCallback(() => {
    const newRowIndex = rows.length;
    const newRow: LayoutRowType = {
      rowIndex: newRowIndex,
      slots: [createPlaceholderSlot(newRowIndex, 12, 0)],
      totalSpan: 12,
    };

    updateBlocks([...rows, newRow]);
  }, [rows, updateBlocks]);

  // Handle synthesis trigger
  const handleSynthesize = useCallback(() => {
    if (selectedSlotIds.size === 0) return;

    // Get all selected slot IDs and their block types
    const slotIds = Array.from(selectedSlotIds);
    const blockTypes: BlockType[] = [];

    rows.forEach((row) => {
      row.slots.forEach((slot) => {
        if (selectedSlotIds.has(slot.id)) {
          if (slot.type !== 'placeholder') {
            blockTypes.push(slot.type as BlockType);
          }
        }
      });
    });

    // If all selected slots are placeholders, we need to let AI decide
    // Pass the slot IDs so the parent can apply content to specific slots
    onSynthesizeBlocks(blockTypes, slotIds);
  }, [selectedSlotIds, rows, onSynthesizeBlocks]);

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    const activeId = String(active.id);

    // Check if dragging a slot (not a row)
    if (activeId.startsWith('slot-')) {
      setActiveSlotId(activeId.replace('slot-', ''));
    }
  }, []);

  // Handle drag end for both row reordering and slot movement
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      setActiveSlotId(null);

      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);

      // Case 1: Slot being dropped onto a row drop zone
      if (activeId.startsWith('slot-') && overId.startsWith('row-dropzone-')) {
        const slotId = activeId.replace('slot-', '');
        const targetRowIndex = parseInt(overId.replace('row-dropzone-', ''), 10);

        // Find the slot and its current row
        let sourceRowIndex = -1;
        let slotToMove: PageBlock | null = null;

        for (const row of rows) {
          const slot = row.slots.find(s => s.id === slotId);
          if (slot) {
            sourceRowIndex = row.rowIndex;
            slotToMove = slot;
            break;
          }
        }

        if (!slotToMove || sourceRowIndex === targetRowIndex) return;

        // Check if slot fits in target row
        const targetRow = rows.find(r => r.rowIndex === targetRowIndex);
        if (!targetRow) return;

        const slotSpan = slotToMove.colSpan ?? 12;
        const targetRemainingSpace = 12 - targetRow.totalSpan;

        if (slotSpan > targetRemainingSpace) {
          // Slot doesn't fit - could show a toast here
          return;
        }

        // Move slot from source row to target row
        let newRows = rows.map(row => {
          if (row.rowIndex === sourceRowIndex) {
            // Remove slot from source row
            const newSlots = row.slots.filter(s => s.id !== slotId);
            return {
              ...row,
              slots: newSlots,
              totalSpan: newSlots.reduce((sum, s) => sum + (s.colSpan ?? 12), 0),
            };
          }
          if (row.rowIndex === targetRowIndex) {
            // Add slot to target row
            const newColStart = row.slots.reduce((sum, s) => sum + (s.colSpan ?? 12), 0);
            const movedSlot = { ...slotToMove!, row: targetRowIndex, colStart: newColStart };
            return {
              ...row,
              slots: [...row.slots, movedSlot],
              totalSpan: row.totalSpan + slotSpan,
            };
          }
          return row;
        });

        // Remove empty rows (but keep at least one)
        newRows = newRows.filter(row => row.slots.length > 0);
        if (newRows.length === 0) {
          newRows = [{
            rowIndex: 0,
            slots: [createPlaceholderSlot(0, 12, 0)],
            totalSpan: 12,
          }];
        }

        // Re-index rows
        newRows = newRows.map((row, idx) => ({
          ...row,
          rowIndex: idx,
          slots: row.slots.map(slot => ({ ...slot, row: idx })),
        }));

        updateBlocks(newRows);
        return;
      }

      // Case 2: Row reordering
      if (activeId.startsWith('row-') && overId.startsWith('row-') && activeId !== overId) {
        const oldIndex = rows.findIndex((row) => `row-${row.rowIndex}` === activeId);
        const newIndex = rows.findIndex((row) => `row-${row.rowIndex}` === overId);

        if (oldIndex !== -1 && newIndex !== -1) {
          const reorderedRows = arrayMove(rows, oldIndex, newIndex);
          const updatedRows = reorderedRows.map((row, idx) => ({
            ...row,
            rowIndex: idx,
            slots: row.slots.map((slot) => ({ ...slot, row: idx })),
          }));
          updateBlocks(updatedRows);
        }
      }
    },
    [rows, updateBlocks]
  );

  // Row IDs for sortable context (rows only - slots use useDraggable separately)
  const rowIds = useMemo(() => rows.map((row) => `row-${row.rowIndex}`), [rows]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Page Layout</h3>
          <p className="text-sm text-gray-500">
            Build your page layout, then select slots for AI content generation
          </p>
        </div>

        {/* Selection indicator and clear button */}
        {selectedSlotIds.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-purple-600 font-medium">
              {selectedSlotIds.size} slot{selectedSlotIds.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={clearSelection}
              className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Canvas rows with drag-and-drop */}
      <DndContext
        sensors={sensors}
        collisionDetection={customCollisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-4 pl-10">
            {rows.map((row) => (
              <LayoutRow
                key={`row-${row.rowIndex}-${row.slots.map(s => s.id).join('-')}`}
                row={row}
                rowId={`row-${row.rowIndex}`}
                selectedSlotIds={selectedSlotIds}
                onSelectSlot={handleSelectSlot}
                onUpdateSlot={handleUpdateSlot}
                onDeleteSlot={handleDeleteSlot}
                onAddSlot={handleAddSlot}
                onSplitSlot={handleSplitSlot}
                onDeleteRow={handleDeleteRow}
                isOnlyRow={rows.length === 1}
                activeSlotId={activeSlotId}
                forms={forms}
                workspaceId={workspaceId}
                pageId={pageId}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Add row button */}
      <div className="mt-4 pl-10">
        <button
          onClick={handleAddRow}
          className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all flex items-center justify-center gap-2 text-gray-500 hover:text-indigo-600"
        >
          <Plus className="w-5 h-5" />
          <span className="font-medium">Add Row</span>
        </button>
      </div>

      {/* Generate toolbar - appears when slots are selected */}
      {selectedSlotIds.size > 0 && (
        <GenerateToolbar
          selectedCount={selectedSlotIds.size}
          selectedBlockTypes={selectedBlockTypes}
          selectedBlocks={rows.flatMap((r) => r.slots).filter((s) => selectedSlotIds.has(s.id))}
          workspaceId={workspaceId}
          onGenerate={handleSynthesize}
          onClear={clearSelection}
          onUpdateBlocks={(updatedBlocks) => {
            // Merge updated blocks back into the rows
            const blockMap = new Map(updatedBlocks.map((b) => [b.id, b]));
            const newRows = rows.map((row) => ({
              ...row,
              slots: row.slots.map((slot) => blockMap.get(slot.id) || slot),
            }));
            updateBlocks(newRows);
          }}
        />
      )}

      {/* Helper text */}
      <div className="mt-6 pt-4 border-t border-gray-100">
        <p className="text-xs text-gray-400 text-center">
          Click slots to select them for AI content generation. Use "Let AI Decide" for automatic block type selection.
        </p>
      </div>
    </div>
  );
}
