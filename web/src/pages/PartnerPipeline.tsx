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
  Users,
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
  usePartners,
  useCreatePartner,
  useUpdatePartner,
  useDeletePartner,
  useMovePartner,
  useUpdatePartnerPipeline,
  useContacts,
  type Partner,
  type CreatePartnerInput,
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

function formatPercent(value: number): string {
  return `${value}%`;
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
// Partner Card (Sortable) with inline editing
// =============================================================================

function PartnerCard({
  partner,
  onClick,
  onInlineUpdate,
}: {
  partner: Partner;
  onClick: () => void;
  onInlineUpdate: (partnerId: string, data: Record<string, unknown>) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: partner.id });

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
            value={partner.title}
            onSave={(title) => onInlineUpdate(partner.id, { title })}
            className="font-medium text-gray-900 text-sm truncate block"
          />
          <div className="mt-0.5">
            <InlineCurrencyEdit
              value={partner.value}
              onSave={(value) => onInlineUpdate(partner.id, { value })}
            />
          </div>
          {partner.contact_name && (
            <p className="text-xs text-gray-500 mt-1 truncate">{partner.contact_name}</p>
          )}
          <div className="flex items-center gap-2 mt-2">
            <InlinePrioritySelect
              value={partner.priority}
              onSave={(priority) => onInlineUpdate(partner.id, { priority })}
            />
            {partner.commission_pct != null && partner.commission_pct > 0 && (
              <span className="text-xs text-gray-400">
                {formatPercent(partner.commission_pct)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Overlay card shown during drag — enlarged with more shadow
function PartnerCardOverlay({ partner }: { partner: Partner }) {
  return (
    <div className="bg-white rounded-lg border-2 border-primary-400 p-4 shadow-2xl w-72 rotate-2">
      <p className="font-medium text-gray-900 text-sm truncate">{partner.title}</p>
      {partner.value > 0 && (
        <p className="text-sm font-semibold text-green-600 mt-1">
          {formatCurrency(partner.value)}
        </p>
      )}
      {partner.contact_name && (
        <p className="text-xs text-gray-500 mt-1">{partner.contact_name}</p>
      )}
      <span className={`text-xs px-1.5 py-0.5 rounded font-medium mt-2 inline-block ${priorityColors[partner.priority]}`}>
        {partner.priority}
      </span>
    </div>
  );
}

// =============================================================================
// Inline Add Partner Form (replaces modal for column-level add)
// =============================================================================

function InlineAddPartner({
  stage,
  onSubmit,
  onCancel,
  isSubmitting,
}: {
  stage: string;
  onSubmit: (data: CreatePartnerInput) => void;
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
        placeholder="Partner name..."
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
  partners,
  summary,
  onCardClick,
  onInlineUpdate,
  onAddPartner,
  isAddingPartner,
  isTerminal,
  isDragActive,
}: {
  stage: string;
  partners: Partner[];
  summary: { count: number; value: number };
  onCardClick: (partner: Partner) => void;
  onInlineUpdate: (partnerId: string, data: Record<string, unknown>) => void;
  onAddPartner: (data: CreatePartnerInput) => void;
  isAddingPartner: boolean;
  isTerminal: 'active' | 'inactive' | null;
  isDragActive: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const [showInlineAdd, setShowInlineAdd] = useState(false);

  const sortedPartners = useMemo(
    () => [...partners].sort((a, b) => a.position - b.position),
    [partners]
  );

  const borderClass = isTerminal === 'active'
    ? 'border-green-400'
    : isTerminal === 'inactive'
      ? 'border-gray-400'
      : 'border-gray-200';

  const bgClass = isTerminal === 'active'
    ? 'bg-green-50'
    : isTerminal === 'inactive'
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
                title="Add partner"
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
          <InlineAddPartner
            stage={stage}
            onSubmit={(data) => {
              onAddPartner(data);
              setShowInlineAdd(false);
            }}
            onCancel={() => setShowInlineAdd(false)}
            isSubmitting={isAddingPartner}
          />
        </div>
      )}

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 min-h-[100px] overflow-y-auto">
        <SortableContext
          items={sortedPartners.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          {sortedPartners.map((partner) => (
            <PartnerCard
              key={partner.id}
              partner={partner}
              onClick={() => onCardClick(partner)}
              onInlineUpdate={onInlineUpdate}
            />
          ))}
        </SortableContext>

        {sortedPartners.length === 0 && !showInlineAdd && (
          <div className="flex items-center justify-center h-20 text-gray-400 text-xs">
            {isDragActive ? (
              <span className="text-primary-500 font-medium">Drop here</span>
            ) : (
              'No partners'
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Partner Detail Side Panel (fixed right panel, no backdrop)
// =============================================================================

function PartnerDetailPanel({
  partner,
  stages,
  onClose,
  onSave,
  onDelete,
  isDeleting,
}: {
  partner: Partner;
  stages: string[];
  onClose: () => void;
  onSave: (data: Record<string, unknown>) => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [title, setTitle] = useState(partner.title);
  const [value, setValue] = useState(partner.value.toString());
  const [stage, setStage] = useState(partner.stage);
  const [priority, setPriority] = useState(partner.priority);
  const [contactName, setContactName] = useState(partner.contact_name || '');
  const [description, setDescription] = useState(partner.description || '');
  const [commissionPct, setCommissionPct] = useState((partner.commission_pct ?? 0).toString());
  const [partnerType, setPartnerType] = useState(partner.partner_type || '');
  const [introducedByName, setIntroducedByName] = useState(partner.introduced_by_name || '');
  const [lostReason, setLostReason] = useState(partner.lost_reason || '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Re-initialize when partner changes
  useEffect(() => {
    setTitle(partner.title);
    setValue(partner.value.toString());
    setStage(partner.stage);
    setPriority(partner.priority);
    setContactName(partner.contact_name || '');
    setDescription(partner.description || '');
    setCommissionPct((partner.commission_pct ?? 0).toString());
    setPartnerType(partner.partner_type || '');
    setIntroducedByName(partner.introduced_by_name || '');
    setLostReason(partner.lost_reason || '');
    setSaved(false);
  }, [partner.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      commission_pct: parseFloat(commissionPct) || 0,
      partner_type: partnerType || undefined,
      introduced_by_name: introducedByName || undefined,
      lost_reason: lostReason || undefined,
      ...overrides,
    });
  }, [title, value, stage, priority, contactName, description, commissionPct, partnerType, introducedByName, lostReason, debouncedSave]);

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
            <h2 className="text-base font-semibold text-gray-900">Partner Details</h2>
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Commission %</label>
              <input
                type="number"
                value={commissionPct}
                onChange={(e) => { setCommissionPct(e.target.value); triggerSave({ commission_pct: parseFloat(e.target.value) || 0 }); }}
                className="input w-full"
                min="0"
                max="100"
                step="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Partner Type</label>
              <select
                value={partnerType}
                onChange={(e) => { setPartnerType(e.target.value); triggerSave({ partner_type: e.target.value || undefined }); }}
                className="input w-full"
              >
                <option value="">Select type...</option>
                <option value="msp">MSP</option>
                <option value="referral">Referral</option>
                <option value="agency">Agency</option>
                <option value="affiliate">Affiliate</option>
                <option value="other">Other</option>
              </select>
            </div>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Introduced By</label>
            <input
              type="text"
              value={introducedByName}
              onChange={(e) => { setIntroducedByName(e.target.value); triggerSave({ introduced_by_name: e.target.value || undefined }); }}
              className="input w-full"
              placeholder="Who introduced this partner?"
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

          {stage === 'Inactive' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Inactive Reason</label>
              <textarea
                value={lostReason}
                onChange={(e) => { setLostReason(e.target.value); triggerSave({ lost_reason: e.target.value || undefined }); }}
                className="input w-full"
                rows={2}
                placeholder="Why is this partner inactive?"
              />
            </div>
          )}

          <div className="pt-2 text-xs text-gray-400 space-y-1">
            <p>Created: {formatDate(partner.created_at)}</p>
            <p>Updated: {formatDate(partner.updated_at)}</p>
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
        title="Delete Partner"
        message={`Are you sure you want to delete "${partner.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isDestructive
        isLoading={isDeleting}
      />
    </>
  );
}

// =============================================================================
// Add Partner Modal (kept for header-level "Add Partner" button)
// =============================================================================

function AddPartnerModal({
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
  onSubmit: (data: CreatePartnerInput) => void;
  isSubmitting: boolean;
  contacts: Array<{ id: string; name: string }>;
}) {
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [stage, setStage] = useState(stages[0] || 'New Lead');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [contactId, setContactId] = useState('');
  const [contactSearch, setContactSearch] = useState('');
  const [commissionPct, setCommissionPct] = useState('');
  const [partnerType, setPartnerType] = useState('');
  const [introducedByName, setIntroducedByName] = useState('');
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
      commission_pct: parseFloat(commissionPct) || 0,
      partner_type: partnerType || undefined,
      introduced_by_name: introducedByName || undefined,
      description: description || undefined,
    });
    // Reset form
    setTitle('');
    setValue('');
    setStage(stages[0] || 'New Lead');
    setPriority('medium');
    setContactId('');
    setContactSearch('');
    setCommissionPct('');
    setPartnerType('');
    setIntroducedByName('');
    setDescription('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Partner" size="lg">
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
            placeholder="e.g., Acme Marketing Agency"
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Commission %</label>
            <input
              type="number"
              value={commissionPct}
              onChange={(e) => setCommissionPct(e.target.value)}
              className="input w-full"
              placeholder="0"
              min="0"
              max="100"
              step="1"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Partner Type</label>
            <select
              value={partnerType}
              onChange={(e) => setPartnerType(e.target.value)}
              className="input w-full"
            >
              <option value="">Select type...</option>
              <option value="msp">MSP</option>
              <option value="referral">Referral</option>
              <option value="agency">Agency</option>
              <option value="affiliate">Affiliate</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Introduced By</label>
            <input
              type="text"
              value={introducedByName}
              onChange={(e) => setIntroducedByName(e.target.value)}
              className="input w-full"
              placeholder="Name"
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
            placeholder="Optional notes about this partner"
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
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Partner'}
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
  partnersByStage,
}: {
  isOpen: boolean;
  onClose: () => void;
  currentStages: string[];
  onSave: (stages: string[]) => void;
  isSaving: boolean;
  partnersByStage: Record<string, number>;
}) {
  const [stages, setStages] = useState<string[]>(currentStages);
  const [newStage, setNewStage] = useState('');

  const addStage = () => {
    const name = newStage.trim();
    if (name && !stages.includes(name)) {
      // Insert before terminal stages (Active/Inactive)
      const activeIdx = stages.indexOf('Active');
      const inactiveIdx = stages.indexOf('Inactive');
      const insertIdx = Math.min(
        activeIdx >= 0 ? activeIdx : stages.length,
        inactiveIdx >= 0 ? inactiveIdx : stages.length
      );
      const updated = [...stages];
      updated.splice(insertIdx, 0, name);
      setStages(updated);
      setNewStage('');
    }
  };

  const removeStage = (idx: number) => {
    const stageName = stages[idx];
    if (partnersByStage[stageName] && partnersByStage[stageName] > 0) return;
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
              {partnersByStage[stage] > 0 && (
                <span className="text-xs text-gray-400">{partnersByStage[stage]} partners</span>
              )}
            </div>
            <button
              onClick={() => removeStage(idx)}
              disabled={partnersByStage[stage] > 0 || stages.length <= 2}
              className="p-1 text-gray-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-gray-300"
              title={partnersByStage[stage] > 0 ? 'Cannot remove stage with partners' : 'Remove stage'}
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
  partners,
  onRowClick,
  sortField,
  sortDir,
  onSort,
}: {
  partners: Partner[];
  onRowClick: (partner: Partner) => void;
  sortField: string;
  sortDir: 'asc' | 'desc';
  onSort: (field: string) => void;
}) {
  const columns = [
    { key: 'title', label: 'Title' },
    { key: 'value', label: 'Value' },
    { key: 'commission_pct', label: 'Commission %' },
    { key: 'stage', label: 'Stage' },
    { key: 'contact_name', label: 'Contact' },
    { key: 'partner_type', label: 'Partner Type' },
    { key: 'priority', label: 'Priority' },
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
            {partners.map((partner) => (
              <tr
                key={partner.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => onRowClick(partner)}
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{partner.title}</td>
                <td className="px-4 py-3 text-sm text-green-600 font-medium">
                  {partner.value > 0 ? formatCurrency(partner.value) : '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {partner.commission_pct != null && partner.commission_pct > 0 ? formatPercent(partner.commission_pct) : '-'}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">
                    {partner.stage}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{partner.contact_name || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{partner.partner_type || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${priorityColors[partner.priority]}`}>
                    {partner.priority}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {formatDate(partner.created_at)}
                </td>
              </tr>
            ))}
            {partners.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                  No partners yet. Add your first partner to get started.
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

export default function PartnerPipeline() {
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const wsId = workspaceId || '';
  const { data: pipelineData, isLoading } = usePartners(wsId);
  const { data: contactsData } = useContacts(wsId, { limit: 100 });
  const createPartner = useCreatePartner(wsId);
  const updatePartner = useUpdatePartner(wsId);
  const deletePartner = useDeletePartner(wsId);
  const movePartner = useMovePartner(wsId);
  const updatePartnerPipeline = useUpdatePartnerPipeline(wsId);
  const toast = useToast();

  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPipelineSettingsOpen, setIsPipelineSettingsOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const stages = pipelineData?.stages || [];
  const partners = pipelineData?.partners || [];
  const summary = pipelineData?.summary;

  // Group partners by stage
  const partnersByStage = useMemo(() => {
    const grouped: Record<string, Partner[]> = {};
    for (const stage of stages) {
      grouped[stage] = [];
    }
    for (const partner of partners) {
      if (!searchQuery || partner.title.toLowerCase().includes(searchQuery.toLowerCase())) {
        if (grouped[partner.stage]) {
          grouped[partner.stage].push(partner);
        }
      }
    }
    return grouped;
  }, [stages, partners, searchQuery]);

  // Partners count by stage for pipeline settings
  const partnerCountByStage = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const partner of partners) {
      counts[partner.stage] = (counts[partner.stage] || 0) + 1;
    }
    return counts;
  }, [partners]);

  // Filtered stage summary: counts/values from filtered partners, not raw API summary
  const filteredStageSummary = useMemo(() => {
    const result: Record<string, { count: number; value: number }> = {};
    for (const stage of stages) {
      const stagePartners = partnersByStage[stage] || [];
      result[stage] = {
        count: stagePartners.length,
        value: stagePartners.reduce((sum, p) => sum + p.value, 0),
      };
    }
    return result;
  }, [stages, partnersByStage]);

  // Filtered + sorted partners for table view
  const filteredPartners = useMemo(() => {
    let result = partners;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.contact_name?.toLowerCase().includes(q) ||
          p.stage.toLowerCase().includes(q)
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
  }, [partners, searchQuery, sortField, sortDir]);

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

      const partnerId = active.id as string;
      const partner = partners.find((p) => p.id === partnerId);
      if (!partner) return;

      // Determine target stage
      let targetStage: string;
      const overPartner = partners.find((p) => p.id === over.id);
      if (overPartner) {
        targetStage = overPartner.stage;
      } else {
        // Dropped on a stage column
        targetStage = over.id as string;
      }

      // Only move if stage changed
      if (partner.stage !== targetStage) {
        movePartner.mutate(
          { partnerId, stage: targetStage, position: 0 },
          {
            onError: () => {
              toast.error('Failed to move partner');
            },
          }
        );
      }
    },
    [partners, movePartner, toast]
  );

  const activePartner = activeDragId ? partners.find((p) => p.id === activeDragId) : null;

  // Handlers
  const handleCreatePartner = (data: CreatePartnerInput) => {
    createPartner.mutate(data, {
      onSuccess: () => {
        setIsAddModalOpen(false);
        toast.success('Partner created');
      },
      onError: () => {
        toast.error('Failed to create partner');
      },
    });
  };

  const handleInlineAddPartner = (data: CreatePartnerInput) => {
    createPartner.mutate(data, {
      onSuccess: () => {
        toast.success('Partner created');
      },
      onError: () => {
        toast.error('Failed to create partner');
      },
    });
  };

  const handleUpdatePartner = (data: Record<string, unknown>) => {
    if (!selectedPartner) return;
    updatePartner.mutate(
      { partnerId: selectedPartner.id, ...data } as any,
      {
        onSuccess: (updatedPartner) => {
          // Keep panel open with updated data
          if (updatedPartner) setSelectedPartner(updatedPartner as Partner);
        },
        onError: () => {
          toast.error('Failed to update partner');
        },
      }
    );
  };

  const handleInlineUpdate = useCallback((partnerId: string, data: Record<string, unknown>) => {
    updatePartner.mutate(
      { partnerId, ...data } as any,
      {
        onError: () => {
          toast.error('Failed to update partner');
        },
      }
    );
  }, [updatePartner, toast]);

  const handleDeletePartner = () => {
    if (!selectedPartner) return;
    deletePartner.mutate(selectedPartner.id, {
      onSuccess: () => {
        setSelectedPartner(null);
        toast.success('Partner deleted');
      },
      onError: () => {
        toast.error('Failed to delete partner');
      },
    });
  };

  const handleSavePipeline = (newStages: string[]) => {
    updatePartnerPipeline.mutate(newStages, {
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

      if (e.key === 'n' && !selectedPartner && !isAddModalOpen) {
        e.preventDefault();
        setIsAddModalOpen(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectedPartner, isAddModalOpen]);

  if (isLoadingWorkspace || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  // Compute average commission for summary
  const avgCommission = useMemo(() => {
    const partnersWithCommission = partners.filter((p) => p.commission_pct != null && p.commission_pct > 0);
    if (partnersWithCommission.length === 0) return 0;
    const total = partnersWithCommission.reduce((sum, p) => sum + (p.commission_pct || 0), 0);
    return Math.round(total / partnersWithCommission.length);
  }, [partners]);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main content area */}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${selectedPartner ? 'pr-0' : ''}`}>
        {/* Header + Summary + Toolbar (non-shrinking) */}
        <div className="flex-shrink-0 space-y-6 p-0">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Partners</h1>
            <p className="text-sm text-gray-500 mt-1">
              Track your referral network and partner relationships
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
              Add Partner
            </button>
          </div>
        </div>

        {/* Summary bar */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500 uppercase font-medium">Total Partners</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{summary.total_partners}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500 uppercase font-medium">Pipeline Value</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{formatCurrency(summary.total_value)}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500 uppercase font-medium">Active</p>
              <p className="text-2xl font-bold text-green-600 mt-1">
                {summary.by_stage?.['Active']?.count || 0}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
              <p className="text-xs text-gray-500 uppercase font-medium">Total Commission</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatPercent(avgCommission)}
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
              placeholder="Search partners..."
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

        </div>{/* end flex-shrink-0 header/summary/toolbar */}

        {/* Main content — fills remaining space */}
        {view === 'kanban' ? (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 overflow-x-auto overflow-y-hidden flex-1 pb-4">
              {stages.map((stage) => (
                <StageColumn
                  key={stage}
                  stage={stage}
                  partners={partnersByStage[stage] || []}
                  summary={filteredStageSummary[stage] || { count: 0, value: 0 }}
                  onCardClick={setSelectedPartner}
                  onInlineUpdate={handleInlineUpdate}
                  onAddPartner={handleInlineAddPartner}
                  isAddingPartner={createPartner.isPending}
                  isTerminal={stage === 'Active' ? 'active' : stage === 'Inactive' ? 'inactive' : null}
                  isDragActive={!!activeDragId}
                />
              ))}
            </div>

            <DragOverlay>
              {activePartner ? <PartnerCardOverlay partner={activePartner} /> : null}
            </DragOverlay>
          </DndContext>
        ) : (
          <TableView
            partners={filteredPartners}
            onRowClick={setSelectedPartner}
            sortField={sortField}
            sortDir={sortDir}
            onSort={handleSort}
          />
        )}

        {/* Empty state — only when genuinely empty */}
        {!isLoading && partners.length === 0 && view === 'kanban' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center py-16">
              <Users className="w-12 h-12 text-gray-300 mx-auto" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">No partners yet</h3>
              <p className="mt-2 text-sm text-gray-500">
                Add your first partner to start tracking your referral network.
              </p>
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="btn btn-primary mt-4"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add Partner
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Side panel — no backdrop, board stays interactive */}
      {selectedPartner && (
        <PartnerDetailPanel
          partner={selectedPartner}
          stages={stages}
          onClose={() => setSelectedPartner(null)}
          onSave={handleUpdatePartner}
          onDelete={handleDeletePartner}
          isDeleting={deletePartner.isPending}
        />
      )}

      {/* Modals */}
      <AddPartnerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        stages={stages}
        onSubmit={handleCreatePartner}
        isSubmitting={createPartner.isPending}
        contacts={contactOptions}
      />

      {isPipelineSettingsOpen && (
        <PipelineSettingsModal
          isOpen={isPipelineSettingsOpen}
          onClose={() => setIsPipelineSettingsOpen(false)}
          currentStages={stages}
          onSave={handleSavePipeline}
          isSaving={updatePartnerPipeline.isPending}
          partnersByStage={partnerCountByStage}
        />
      )}
    </div>
  );
}
