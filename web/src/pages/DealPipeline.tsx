import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Plus,
  Loader2,
  DollarSign,
  LayoutGrid,
  List,
  Search,
  ChevronRight,
  X,
  Trash2,
  GripVertical,
  Settings2,
  ArrowUpDown,
  Check,
} from 'lucide-react';
import {
  useCurrentWorkspace,
  useDeals,
  useCreateDeal,
  useUpdateDeal,
  useDeleteDeal,
  useMoveDeal,
  useUpdatePipeline,
  useContacts,
  type Deal,
  type CreateDealInput,
} from '../lib/hooks';
import Modal, { ModalFooter, ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../components/Toast';

// =============================================================================
// Helpers
// =============================================================================

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const priorityColors: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-red-100 text-red-700',
};

function useDebouncedCallback<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    }) as T,
    [callback, delay]
  );
}

// =============================================================================
// Inline Edit Components
// =============================================================================

function InlineTextEdit({
  value,
  onSave,
  className = '',
  placeholder = '',
}: {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocalValue(value); }, [value]);

  const commit = () => {
    setEditing(false);
    if (localValue.trim() && localValue !== value) {
      onSave(localValue.trim());
    } else {
      setLocalValue(value);
    }
  };

  if (!editing) {
    return (
      <span
        className={`cursor-text hover:bg-gray-100 rounded px-0.5 -mx-0.5 ${className}`}
        onClick={(e) => { e.stopPropagation(); setEditing(true); setTimeout(() => inputRef.current?.select(), 0); }}
      >
        {value || placeholder}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setLocalValue(value); setEditing(false); } }}
      className={`bg-white border border-primary-300 rounded px-1 outline-none text-sm w-full ${className}`}
      autoFocus
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function InlineCurrencyEdit({
  value,
  onSave,
}: {
  value: number;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setLocalValue(value.toString()); }, [value]);

  const commit = () => {
    setEditing(false);
    const parsed = parseFloat(localValue) || 0;
    if (parsed !== value) {
      onSave(parsed);
    }
  };

  if (!editing) {
    return (
      <span
        className="cursor-text hover:bg-green-50 rounded px-0.5 -mx-0.5 text-sm font-semibold text-green-600"
        onClick={(e) => { e.stopPropagation(); setEditing(true); setTimeout(() => inputRef.current?.select(), 0); }}
      >
        {value > 0 ? formatCurrency(value) : '$0'}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setLocalValue(value.toString()); setEditing(false); } }}
      className="bg-white border border-primary-300 rounded px-1 outline-none text-sm w-20 font-semibold text-green-600"
      autoFocus
      min="0"
      step="0.01"
      onClick={(e) => e.stopPropagation()}
    />
  );
}

function InlinePrioritySelect({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const options = ['low', 'medium', 'high'] as const;

  return (
    <div className="relative inline-block" ref={ref}>
      <span
        className={`text-xs px-1.5 py-0.5 rounded font-medium cursor-pointer hover:ring-2 hover:ring-primary-200 ${priorityColors[value]}`}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
      >
        {value}
      </span>
      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[100px]">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={(e) => {
                e.stopPropagation();
                if (opt !== value) onSave(opt);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${priorityColors[opt]}`}>{opt}</span>
              {opt === value && <Check className="w-3 h-3 text-primary-600 ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Deal Card (Sortable) with inline editing
// =============================================================================

function DealCard({
  deal,
  onClick,
  onInlineUpdate,
}: {
  deal: Deal;
  onClick: () => void;
  onInlineUpdate: (dealId: string, data: Record<string, unknown>) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: deal.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <button
          className="mt-0.5 p-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <InlineTextEdit
            value={deal.title}
            onSave={(title) => onInlineUpdate(deal.id, { title })}
            className="font-medium text-gray-900 text-sm truncate block"
          />
          <div className="mt-0.5">
            <InlineCurrencyEdit
              value={deal.value}
              onSave={(value) => onInlineUpdate(deal.id, { value })}
            />
          </div>
          {deal.contact_name && (
            <p className="text-xs text-gray-500 mt-1 truncate">{deal.contact_name}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <InlinePrioritySelect
              value={deal.priority}
              onSave={(priority) => onInlineUpdate(deal.id, { priority })}
            />
            {deal.expected_close_date && (
              <span className="text-xs text-gray-400">
                {formatDate(deal.expected_close_date)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Overlay card shown during drag — enlarged with more shadow
function DealCardOverlay({ deal }: { deal: Deal }) {
  return (
    <div className="bg-white rounded-lg border-2 border-primary-400 p-4 shadow-2xl w-72 rotate-2">
      <p className="font-medium text-gray-900 text-sm truncate">{deal.title}</p>
      {deal.value > 0 && (
        <p className="text-sm font-semibold text-green-600 mt-1">
          {formatCurrency(deal.value)}
        </p>
      )}
      {deal.contact_name && (
        <p className="text-xs text-gray-500 mt-1">{deal.contact_name}</p>
      )}
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium mt-2 inline-block ${priorityColors[deal.priority]}`}>
        {deal.priority}
      </span>
    </div>
  );
}

// =============================================================================
// Inline Add Deal Form (replaces modal for column-level add)
// =============================================================================

function InlineAddDeal({
  stage,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  stage: string;
  onSubmit: (data: CreateDealInput) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}) {
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      value: parseFloat(value) || 0,
      stage,
      priority: 'medium',
    });
    setTitle('');
    setValue('');
    inputRef.current?.focus();
  };

  return (
    <div className="bg-white rounded-lg border-2 border-dashed border-primary-300 p-3 space-y-2">
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && title.trim()) handleSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        className="input w-full text-sm"
        placeholder="Deal title..."
      />
      <input
        type="number"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && title.trim()) handleSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        className="input w-full text-sm"
        placeholder="Value ($)"
        min="0"
        step="0.01"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !title.trim()}
          className="btn btn-primary btn-sm flex-1"
        >
          {isSubmitting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
        </button>
        <button onClick={onCancel} className="btn btn-secondary btn-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Stage Column (Droppable) with inline add
// =============================================================================

function StageColumn({
  stage,
  deals,
  summary,
  onCardClick,
  onInlineUpdate,
  onAddDeal,
  isAddingDeal,
  isTerminal,
  isDragActive,
}: {
  stage: string;
  deals: Deal[];
  summary: { count: number; value: number };
  onCardClick: (deal: Deal) => void;
  onInlineUpdate: (dealId: string, data: Record<string, unknown>) => void;
  onAddDeal: (data: CreateDealInput) => void;
  isAddingDeal: boolean;
  isTerminal: 'won' | 'lost' | null;
  isDragActive: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const [showInlineAdd, setShowInlineAdd] = useState(false);

  const sortedDeals = useMemo(
    () => [...deals].sort((a, b) => a.position - b.position),
    [deals]
  );

  const borderClass = isTerminal === 'won'
    ? 'border-green-400'
    : isTerminal === 'lost'
      ? 'border-gray-400'
      : 'border-gray-200';

  const bgClass = isTerminal === 'won'
    ? 'bg-green-50'
    : isTerminal === 'lost'
      ? 'bg-gray-50'
      : 'bg-gray-50';

  const dropHighlight = isDragActive && isOver
    ? 'ring-2 ring-primary-400 bg-primary-50/30'
    : isDragActive
      ? 'ring-1 ring-gray-300 ring-dashed'
      : '';

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 flex-shrink-0 rounded-lg border-t-2 ${borderClass} ${dropHighlight} transition-all`}
    >
      {/* Column header */}
      <div className={`p-3 rounded-t-lg ${bgClass}`}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-gray-800">{stage}</h3>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 bg-white rounded-full px-2 py-0.5 font-medium">
              {summary.count}
            </span>
            {!isTerminal && (
              <button
                onClick={() => setShowInlineAdd(true)}
                className="p-0.5 text-gray-400 hover:text-primary-600 hover:bg-white rounded transition-colors"
                title="Add deal"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {summary.value > 0 && (
          <p className="text-xs text-gray-500 mt-1">{formatCurrency(summary.value)}</p>
        )}
      </div>

      {/* Inline add form at top */}
      {showInlineAdd && (
        <div className="p-2">
          <InlineAddDeal
            stage={stage}
            onSubmit={(data) => {
              onAddDeal(data);
              setShowInlineAdd(false);
            }}
            onCancel={() => setShowInlineAdd(false)}
            isSubmitting={isAddingDeal}
          />
        </div>
      )}

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 min-h-[100px] overflow-y-auto max-h-[calc(100vh-320px)]">
        <SortableContext
          items={sortedDeals.map((d) => d.id)}
          strategy={verticalListSortingStrategy}
        >
          {sortedDeals.map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              onClick={() => onCardClick(deal)}
              onInlineUpdate={onInlineUpdate}
            />
          ))}
        </SortableContext>

        {sortedDeals.length === 0 && !showInlineAdd && (
          <div className="flex items-center justify-center h-20 text-gray-400 text-xs">
            {isDragActive ? (
              <span className="text-primary-500 font-medium">Drop here</span>
            ) : (
              'No deals'
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Deal Detail Side Panel (fixed right panel, no backdrop)
// =============================================================================

function DealDetailPanel({
  deal,
  stages,
  onClose,
  onSave,
  onDelete,
  isDeleting,
}: {
  deal: Deal;
  stages: string[];
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [title, setTitle] = useState(deal.title);
  const [value, setValue] = useState(deal.value.toString());
  const [stage, setStage] = useState(deal.stage);
  const [priority, setPriority] = useState(deal.priority);
  const [contactName, setContactName] = useState(deal.contact_name || '');
  const [description, setDescription] = useState(deal.description || '');
  const [expectedCloseDate, setExpectedCloseDate] = useState(deal.expected_close_date || '');
  const [lostReason, setLostReason] = useState(deal.lost_reason || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Re-initialize when deal changes
  useEffect(() => {
    setTitle(deal.title);
    setValue(deal.value.toString());
    setStage(deal.stage);
    setPriority(deal.priority);
    setContactName(deal.contact_name || '');
    setDescription(deal.description || '');
    setExpectedCloseDate(deal.expected_close_date || '');
    setLostReason(deal.lost_reason || '');
    setSaved(false);
  }, [deal.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save with debounce
  const debouncedSave = useDebouncedCallback(
    (data: Record<string, unknown>) => {
      onSave(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    500
  );

  const triggerSave = useCallback((overrides: Record<string, unknown> = {}) => {
    debouncedSave({
      title,
      value: parseFloat(value) || 0,
      stage,
      priority,
      contact_name: contactName || undefined,
      description: description || undefined,
      expected_close_date: expectedCloseDate || undefined,
      lost_reason: lostReason || undefined,
      ...overrides,
    });
  }, [title, value, stage, priority, contactName, description, expectedCloseDate, lostReason, debouncedSave]);

  // Keyboard: Escape to close, Delete to delete
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Delete' && !showDeleteConfirm) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
        setShowDeleteConfirm(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, showDeleteConfirm]);

  // Click outside panel to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    };
    // Delay to avoid triggering on the click that opened the panel
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 100);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  return (
    <>
      <div
        ref={panelRef}
        className="w-[400px] bg-white border-l border-gray-200 flex flex-col h-full shadow-lg flex-shrink-0 animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-gray-900">Deal Details</h2>
            {saved && (
              <span className="text-xs text-green-600 flex items-center gap-1 animate-fade-in">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); triggerSave({ title: e.target.value }); }}
              className="input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Value ($)</label>
              <input
                type="number"
                value={value}
                onChange={(e) => { setValue(e.target.value); triggerSave({ value: parseFloat(e.target.value) || 0 }); }}
                className="input w-full"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => { setPriority(e.target.value as 'low' | 'medium' | 'high'); triggerSave({ priority: e.target.value }); }}
                className="input w-full"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
            <select
              value={stage}
              onChange={(e) => { setStage(e.target.value); triggerSave({ stage: e.target.value }); }}
              className="input w-full"
            >
              {stages.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => { setContactName(e.target.value); triggerSave({ contact_name: e.target.value || undefined }); }}
              className="input w-full"
              placeholder="Link to a contact"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected Close Date</label>
            <input
              type="date"
              value={expectedCloseDate}
              onChange={(e) => { setExpectedCloseDate(e.target.value); triggerSave({ expected_close_date: e.target.value || undefined }); }}
              className="input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => { setDescription(e.target.value); triggerSave({ description: e.target.value || undefined }); }}
              className="input w-full"
              rows={3}
            />
          </div>

          {stage === 'Lost' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Lost Reason</label>
              <textarea
                value={lostReason}
                onChange={(e) => { setLostReason(e.target.value); triggerSave({ lost_reason: e.target.value || undefined }); }}
                className="input w-full"
                rows={2}
                placeholder="Why was this deal lost?"
              />
            </div>
          )}

          <div className="pt-2 text-xs text-gray-400 space-y-1">
            <p>Created: {formatDate(deal.created_at)}</p>
            <p>Updated: {formatDate(deal.updated_at)}</p>
          </div>
        </div>

        {/* Footer — only delete, no Save/Cancel */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-red-600 hover:text-red-700 text-sm font-medium flex items-center gap-1"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
          <span className="text-xs text-gray-400">Esc to close</span>
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={onDelete}
        title="Delete Deal"
        message={`Are you sure you want to delete "${deal.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isDestructive
        isLoading={isDeleting}
      />
    </>
  );
}

// =============================================================================
// Add Deal Modal (kept for header-level "Add Deal" button)
// =============================================================================

function AddDealModal({
  isOpen,
  onClose,
  stages,
  onSubmit,
  isSubmitting,
  contacts,
}: {
  isOpen: boolean;
  onClose: () => void;
  stages: string[];
  onSubmit: (data: CreateDealInput) => void;
  isSubmitting: boolean;
  contacts: Array<{ id: string; name: string }>;
}) {
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [stage, setStage] = useState(stages[0] || 'New Lead');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [contactId, setContactId] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [description, setDescription] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);

  const filteredContacts = useMemo(() => {
    if (!contactSearch) return contacts.slice(0, 10);
    const q = contactSearch.toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 10);
  }, [contacts, contactSearch]);

  const selectedContact = contacts.find((c) => c.id === contactId);

  const handleSubmit = () => {
    onSubmit({
      title,
      value: parseFloat(value) || 0,
      stage,
      priority,
      contact_id: contactId || undefined,
      contact_name: selectedContact?.name || undefined,
      expected_close_date: expectedCloseDate || undefined,
      description: description || undefined,
    });
    // Reset form
    setTitle('');
    setValue('');
    setStage(stages[0] || 'New Lead');
    setPriority('medium');
    setContactId('');
    setContactSearch('');
    setExpectedCloseDate('');
    setDescription('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Deal" size="lg">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Title <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="input w-full"
            placeholder="e.g., Enterprise deal with Acme Corp"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Value ($)</label>
            <input
              type="number"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="input w-full"
              placeholder="0"
              min="0"
              step="0.01"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="input w-full"
            >
              {stages.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
              className="input w-full"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expected Close</label>
            <input
              type="date"
              value={expectedCloseDate}
              onChange={(e) => setExpectedCloseDate(e.target.value)}
              className="input w-full"
            />
          </div>
        </div>

        {/* Contact search */}
        <div className="relative">
          <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
          {contactId ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-sm text-gray-700 flex-1">{selectedContact?.name}</span>
              <button
                onClick={() => { setContactId(''); setContactSearch(''); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => {
                  setContactSearch(e.target.value);
                  setShowContactDropdown(true);
                }}
                onFocus={() => setShowContactDropdown(true)}
                className="input w-full"
                placeholder="Search contacts..."
              />
              {showContactDropdown && filteredContacts.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-auto">
                  {filteredContacts.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setContactId(c.id);
                        setContactSearch('');
                        setShowContactDropdown(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input w-full"
            rows={2}
            placeholder="Optional notes about this deal"
          />
        </div>
      </div>

      <ModalFooter>
        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button
          onClick={handleSubmit}
          className="btn btn-primary"
          disabled={isSubmitting || !title.trim()}
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Deal'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// =============================================================================
// Pipeline Settings Modal
// =============================================================================

function PipelineSettingsModal({
  isOpen,
  onClose,
  currentStages,
  onSave,
  isSaving,
  dealsByStage,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentStages: string[];
  onSave: (stages: string[]) => void;
  isSaving: boolean;
  dealsByStage: Record<string, number>;
}) {
  const [stages, setStages] = useState<string[]>(currentStages);
  const [newStage, setNewStage] = useState('');

  const addStage = () => {
    const name = newStage.trim();
    if (name && !stages.includes(name)) {
      // Insert before terminal stages (Won/Lost)
      const wonIdx = stages.indexOf('Won');
      const lostIdx = stages.indexOf('Lost');
      const insertIdx = Math.min(
        wonIdx >= 0 ? wonIdx : stages.length,
        lostIdx >= 0 ? lostIdx : stages.length
      );
      const updated = [...stages];
      updated.splice(insertIdx, 0, name);
      setStages(updated);
      setNewStage('');
    }
  };

  const removeStage = (idx: number) => {
    const stageName = stages[idx];
    if (dealsByStage[stageName] && dealsByStage[stageName] > 0) return;
    if (stages.length <= 2) return;
    setStages(stages.filter((_, i) => i !== idx));
  };

  const moveStage = (idx: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= stages.length) return;
    const updated = [...stages];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    setStages(updated);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Pipeline Settings" size="md">
      <div className="space-y-3">
        {stages.map((stage, idx) => (
          <div key={stage} className="flex items-center gap-2 group">
            <div className="flex flex-col">
              <button
                onClick={() => moveStage(idx, 'up')}
                disabled={idx === 0}
                className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-30"
              >
                <ChevronRight className="w-3 h-3 -rotate-90" />
              </button>
              <button
                onClick={() => moveStage(idx, 'down')}
                disabled={idx === stages.length - 1}
                className="p-0.5 text-gray-300 hover:text-gray-500 disabled:opacity-30"
              >
                <ChevronRight className="w-3 h-3 rotate-90" />
              </button>
            </div>
            <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-sm font-medium text-gray-700 flex-1">{stage}</span>
              {dealsByStage[stage] > 0 && (
                <span className="text-xs text-gray-400">{dealsByStage[stage]} deals</span>
              )}
            </div>
            <button
              onClick={() => removeStage(idx)}
              disabled={dealsByStage[stage] > 0 || stages.length <= 2}
              className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-300"
              title={dealsByStage[stage] > 0 ? 'Cannot remove stage with deals' : 'Remove stage'}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}

        <div className="flex gap-2 pt-2">
          <input
            type="text"
            value={newStage}
            onChange={(e) => setNewStage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addStage()}
            className="input flex-1"
            placeholder="Add new stage..."
          />
          <button onClick={addStage} className="btn btn-secondary" disabled={!newStage.trim()}>
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ModalFooter>
        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button
          onClick={() => onSave(stages)}
          className="btn btn-primary"
          disabled={isSaving || stages.length < 2}
        >
          {isSaving ? 'Saving...' : 'Save Pipeline'}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// =============================================================================
// Table View
// =============================================================================

function TableView({
  deals,
  onRowClick,
  sortField,
  sortDir,
  onSort,
}: {
  deals: Deal[];
  onRowClick: (deal: Deal) => void;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
}) {
  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'value', label: 'Value' },
    { key: 'stage', label: 'Stage' },
    { key: 'contact_name', label: 'Contact' },
    { key: 'priority', label: 'Priority' },
    { key: 'expected_close_date', label: 'Expected Close' },
    { key: 'created_at', label: 'Created' },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                  onClick={() => onSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {sortField === col.key && (
                      <ArrowUpDown className={`w-3 h-3 ${sortDir === 'desc' ? 'rotate-180' : ''}`} />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {deals.map((deal) => (
              <tr
                key={deal.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => onRowClick(deal)}
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{deal.title}</td>
                <td className="px-4 py-3 text-sm text-green-600 font-medium">
                  {deal.value > 0 ? formatCurrency(deal.value) : '-'}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
                    {deal.stage}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{deal.contact_name || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${priorityColors[deal.priority]}`}>
                    {deal.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {formatDate(deal.expected_close_date) || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {formatDate(deal.created_at)}
                </td>
              </tr>
            ))}
            {deals.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                  No deals yet. Create your first deal to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function DealPipeline() {
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const wsId = workspaceId || '';
  const { data: pipelineData, isLoading } = useDeals(wsId);
  const { data: contactsData } = useContacts(wsId, { limit: 100 });
  const createDeal = useCreateDeal(wsId);
  const updateDeal = useUpdateDeal(wsId);
  const deleteDeal = useDeleteDeal(wsId);
  const moveDeal = useMoveDeal(wsId);
  const updatePipeline = useUpdatePipeline(wsId);
  const toast = useToast();

  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPipelineSettingsOpen, setIsPipelineSettingsOpen] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const stages = pipelineData?.stages || [];
  const deals = pipelineData?.deals || [];
  const summary = pipelineData?.summary;

  // Group deals by stage
  const dealsByStage = useMemo(() => {
    const grouped: Record<string, Deal[]> = {};
    for (const stage of stages) {
      grouped[stage] = [];
    }
    for (const deal of deals) {
      if (!searchQuery || deal.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        if (grouped[deal.stage]) {
          grouped[deal.stage].push(deal);
        }
      }
    }
    return grouped;
  }, [stages, deals, searchQuery]);

  // Deals count by stage for pipeline settings
  const dealCountByStage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const deal of deals) {
      counts[deal.stage] = (counts[deal.stage] || 0) + 1;
    }
    return counts;
  }, [deals]);

  // Filtered + sorted deals for table view
  const filteredDeals = useMemo(() => {
    let result = deals;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.contact_name?.toLowerCase().includes(q) ||
          d.stage.toLowerCase().includes(q)
      );
    }
    result = [...result].sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sortField];
      const bVal = (b as unknown as Record<string, unknown>)[sortField];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return result;
  }, [deals, searchQuery, sortField, sortDir]);

  // Contacts formatted for dropdown
  const contactOptions = useMemo(() => {
    if (!contactsData?.contacts) return [];
    return contactsData.contacts.map((c) => ({
      id: c.id,
      name: c.full_name || c.email || c.phone || 'Unknown',
    }));
  }, [contactsData]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // DnD handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(event.active.id as string);
  }, []);

  const handleDragOver = useCallback((_event: DragOverEvent) => {
    // Visual feedback is handled by useDroppable isOver
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);

      if (!over) return;

      const dealId = active.id as string;
      const deal = deals.find((d) => d.id === dealId);
      if (!deal) return;

      // Determine target stage
      let targetStage: string;
      const overDeal = deals.find((d) => d.id === over.id);
      if (overDeal) {
        targetStage = overDeal.stage;
      } else {
        // Dropped on a stage column
        targetStage = over.id as string;
      }

      // Only move if stage changed
      if (deal.stage !== targetStage) {
        moveDeal.mutate(
          { dealId, stage: targetStage, position: 0 },
          {
            onError: () => {
              toast.error('Failed to move deal');
            },
          }
        );
      }
    },
    [deals, moveDeal, toast]
  );

  const activeDeal = activeDragId ? deals.find((d) => d.id === activeDragId) : null;

  // Handlers
  const handleCreateDeal = (data: CreateDealInput) => {
    createDeal.mutate(data, {
      onSuccess: () => {
        setIsAddModalOpen(false);
        toast.success('Deal created');
      },
      onError: () => {
        toast.error('Failed to create deal');
      },
    });
  };

  const handleInlineAddDeal = (data: CreateDealInput) => {
    createDeal.mutate(data, {
      onSuccess: () => {
        toast.success('Deal created');
      },
      onError: () => {
        toast.error('Failed to create deal');
      },
    });
  };

  const handleUpdateDeal = (data: Record<string, unknown>) => {
    if (!selectedDeal) return;
    updateDeal.mutate(
      { dealId: selectedDeal.id, ...data } as any,
      {
        onSuccess: (updatedDeal) => {
          // Keep panel open with updated data
          if (updatedDeal) setSelectedDeal(updatedDeal as Deal);
        },
        onError: () => {
          toast.error('Failed to update deal');
        },
      }
    );
  };

  const handleInlineUpdate = useCallback((dealId: string, data: Record<string, unknown>) => {
    updateDeal.mutate(
      { dealId, ...data } as any,
      {
        onError: () => {
          toast.error('Failed to update deal');
        },
      }
    );
  }, [updateDeal, toast]);

  const handleDeleteDeal = () => {
    if (!selectedDeal) return;
    deleteDeal.mutate(selectedDeal.id, {
      onSuccess: () => {
        setSelectedDeal(null);
        toast.success('Deal deleted');
      },
      onError: () => {
        toast.error('Failed to delete deal');
      },
    });
  };

  const handleSavePipeline = (newStages: string[]) => {
    updatePipeline.mutate(newStages, {
      onSuccess: () => {
        setIsPipelineSettingsOpen(false);
        toast.success('Pipeline updated');
      },
      onError: () => {
        toast.error('Failed to update pipeline');
      },
    });
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  // Keyboard shortcuts (global)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only when no panel is open and no input is focused
      const active = document.activeElement;
      const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
      if (isInput) return;

      if (e.key === 'n' && !selectedDeal && !isAddModalOpen) {
        e.preventDefault();
        setIsAddModalOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedDeal, isAddModalOpen]);

  if (isLoadingWorkspace || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main content area */}
      <div className={`flex-1 space-y-6 min-w-0 ${selectedDeal ? 'pr-0' : ''}`}>
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Deals</h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage your sales pipeline and track deals
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsPipelineSettingsOpen(true)}
              className="btn btn-secondary"
              title="Pipeline Settings"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="btn btn-primary"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Deal
            </button>
          </div>
        </div>

        {/* Summary bar */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500 uppercase font-medium">Total Deals</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{summary.total_deals}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500 uppercase font-medium">Pipeline Value</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(summary.total_value)}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500 uppercase font-medium">Won</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {formatCurrency(summary.by_stage?.['Won']?.value || 0)}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500 uppercase font-medium">Active Deals</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {summary.total_deals - (summary.by_stage?.['Won']?.count || 0) - (summary.by_stage?.['Lost']?.count || 0)}
              </p>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input w-full pl-9"
              placeholder="Search deals..."
            />
          </div>
          <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => setView('kanban')}
              className={`p-1.5 rounded ${view === 'kanban' ? 'bg-primary-100 text-primary-700' : 'text-gray-400 hover:text-gray-600'}`}
              title="Kanban view"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('table')}
              className={`p-1.5 rounded ${view === 'table' ? 'bg-primary-100 text-primary-700' : 'text-gray-400 hover:text-gray-600'}`}
              title="Table view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main content */}
        {view === 'kanban' ? (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 overflow-x-auto pb-4">
              {stages.map((stage) => (
                <StageColumn
                  key={stage}
                  stage={stage}
                  deals={dealsByStage[stage] || []}
                  summary={summary?.by_stage?.[stage] || { count: 0, value: 0 }}
                  onCardClick={setSelectedDeal}
                  onInlineUpdate={handleInlineUpdate}
                  onAddDeal={handleInlineAddDeal}
                  isAddingDeal={createDeal.isPending}
                  isTerminal={stage === 'Won' ? 'won' : stage === 'Lost' ? 'lost' : null}
                  isDragActive={!!activeDragId}
                />
              ))}
            </div>

            <DragOverlay>
              {activeDeal ? <DealCardOverlay deal={activeDeal} /> : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <TableView
            deals={filteredDeals}
            onRowClick={setSelectedDeal}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
          />
        )}

        {/* Empty state */}
        {!isLoading && deals.length === 0 && (
          <div className="text-center py-16">
            <DollarSign className="w-12 h-12 text-gray-300 mx-auto" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No deals yet</h3>
            <p className="mt-2 text-sm text-gray-500">
              Create your first deal to start tracking your sales pipeline.
            </p>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="btn btn-primary mt-4"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Deal
            </button>
          </div>
        )}
      </div>

      {/* Side panel — no backdrop, board stays interactive */}
      {selectedDeal && (
        <DealDetailPanel
          deal={selectedDeal}
          stages={stages}
          onClose={() => setSelectedDeal(null)}
          onSave={handleUpdateDeal}
          onDelete={handleDeleteDeal}
          isDeleting={deleteDeal.isPending}
        />
      )}

      {/* Modals */}
      <AddDealModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        stages={stages}
        onSubmit={handleCreateDeal}
        isSubmitting={createDeal.isPending}
        contacts={contactOptions}
      />

      {isPipelineSettingsOpen && (
        <PipelineSettingsModal
          isOpen={isPipelineSettingsOpen}
          onClose={() => setIsPipelineSettingsOpen(false)}
          currentStages={stages}
          onSave={handleSavePipeline}
          isSaving={updatePipeline.isPending}
          dealsByStage={dealCountByStage}
        />
      )}
    </div>
  );
}
