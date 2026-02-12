import { X } from 'lucide-react';
import { PageBlock, BLOCK_TYPES, groupBlocksIntoRows, getWidthLabel } from './types';
import { BLOCK_ICONS } from './LayoutSlot';

interface BlockOutlinePanelProps {
  blocks: PageBlock[];
  onClose: () => void;
  onSelectSlot?: (slotId: string) => void;
}

export default function BlockOutlinePanel({ blocks, onClose, onSelectSlot }: BlockOutlinePanelProps) {
  const rows = groupBlocksIntoRows(blocks);

  return (
    <div className="w-64 shrink-0 bg-white border border-gray-200 rounded-xl mr-3 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
        <h4 className="text-sm font-semibold text-gray-700">Block Outline</h4>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Block list */}
      <div className="flex-1 overflow-y-auto py-1">
        {rows.map((row) => (
          <div key={`outline-row-${row.rowIndex}`}>
            {/* Row header */}
            <div className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Row {row.rowIndex + 1}
            </div>

            {/* Slots */}
            {row.slots.map((slot) => {
              const typeInfo = BLOCK_TYPES.find(b => b.type === slot.type);
              const Icon = BLOCK_ICONS[slot.type];
              const label = typeInfo?.label || slot.type;
              // Try to get a preview text from config
              const config = slot.config as Record<string, unknown>;
              const preview = (config.headline || config.title || config.content || '') as string;
              const truncated = typeof preview === 'string' ? preview.slice(0, 30) : '';

              return (
                <button
                  key={slot.id}
                  onClick={() => onSelectSlot?.(slot.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-indigo-50 transition-colors group"
                >
                  {Icon && <Icon className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-500 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate">
                      {label}
                    </p>
                    {truncated && (
                      <p className="text-[10px] text-gray-400 truncate">{truncated}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">
                    {getWidthLabel(slot.colSpan ?? 12).replace(' Width', '')}
                  </span>
                </button>
              );
            })}
          </div>
        ))}

        {blocks.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No blocks yet</p>
        )}
      </div>
    </div>
  );
}
