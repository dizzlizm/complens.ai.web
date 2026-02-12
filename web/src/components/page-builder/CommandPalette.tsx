import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Undo2, Redo2, Eye, Plus } from 'lucide-react';
import { PageBlock, BlockType, BLOCK_TYPES } from './types';
import { BLOCK_ICONS } from './LayoutSlot';

interface CommandPaletteProps {
  blocks: PageBlock[];
  onClose: () => void;
  onAddBlock: (type: BlockType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onTogglePreview: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

interface Command {
  id: string;
  label: string;
  description: string;
  category: 'add' | 'action' | 'navigate';
  icon?: React.ElementType;
  shortcut?: string;
  disabled?: boolean;
  action: () => void;
}

export default function CommandPalette({
  blocks,
  onClose,
  onAddBlock,
  onUndo,
  onRedo,
  onTogglePreview,
  canUndo,
  canRedo,
}: CommandPaletteProps) {
  // blocks prop reserved for future "navigate to block" commands
  void blocks;
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const commands = useMemo<Command[]>(() => {
    const cmds: Command[] = [];

    // Add block commands
    BLOCK_TYPES.forEach((bt) => {
      cmds.push({
        id: `add-${bt.type}`,
        label: `Add ${bt.label}`,
        description: bt.description,
        category: 'add',
        icon: BLOCK_ICONS[bt.type] || Plus,
        action: () => { onAddBlock(bt.type); onClose(); },
      });
    });

    // Action commands
    cmds.push({
      id: 'undo',
      label: 'Undo',
      description: 'Undo last change',
      category: 'action',
      icon: Undo2,
      shortcut: 'Cmd+Z',
      disabled: !canUndo,
      action: () => { onUndo(); onClose(); },
    });
    cmds.push({
      id: 'redo',
      label: 'Redo',
      description: 'Redo last change',
      category: 'action',
      icon: Redo2,
      shortcut: 'Cmd+Shift+Z',
      disabled: !canRedo,
      action: () => { onRedo(); onClose(); },
    });
    cmds.push({
      id: 'preview',
      label: 'Toggle Preview',
      description: 'Switch between edit and preview mode',
      category: 'action',
      icon: Eye,
      action: () => { onTogglePreview(); onClose(); },
    });

    return cmds;
  }, [onAddBlock, onUndo, onRedo, onTogglePreview, canUndo, canRedo, onClose]);

  const filtered = useMemo(() => {
    if (!search) return commands.filter(c => !c.disabled);
    const q = search.toLowerCase();
    return commands.filter(c =>
      !c.disabled &&
      (c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q))
    );
  }, [commands, search]);

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[selectedIndex]?.action();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <Search className="w-5 h-5 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type a command..."
            className="flex-1 text-sm outline-none bg-transparent placeholder:text-gray-400"
          />
          <kbd className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-6">No matching commands</p>
          )}
          {filtered.map((cmd, idx) => {
            const Icon = cmd.icon;
            const isSelected = idx === selectedIndex;

            return (
              <button
                key={cmd.id}
                onClick={cmd.action}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isSelected ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {Icon && <Icon className={`w-4 h-4 shrink-0 ${isSelected ? 'text-indigo-500' : 'text-gray-400'}`} />}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{cmd.label}</p>
                  <p className="text-xs text-gray-500 truncate">{cmd.description}</p>
                </div>
                {cmd.shortcut && (
                  <kbd className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono shrink-0">
                    {cmd.shortcut}
                  </kbd>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
