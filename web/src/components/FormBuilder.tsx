import { useState, useCallback } from 'react';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp, X, Mail, User, Phone, MessageSquare, Building2, List, Calendar, CheckSquare } from 'lucide-react';
import type { FormField } from '../lib/hooks/useForms';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'textarea', label: 'Long Text' },
  { value: 'select', label: 'Dropdown' },
  { value: 'radio', label: 'Radio' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
] as const;

const CONTACT_FIELD_MAPPINGS = [
  { value: '', label: 'None' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'company', label: 'Company' },
];

interface QuickAddPreset {
  label: string;
  icon: React.ReactNode;
  field: Omit<FormField, 'id'>;
}

const QUICK_ADD_PRESETS: QuickAddPreset[] = [
  {
    label: 'Email',
    icon: <Mail className="w-3.5 h-3.5" />,
    field: { name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'your@email.com', options: [], validation_pattern: null, default_value: null, map_to_contact_field: 'email' },
  },
  {
    label: 'Name',
    icon: <User className="w-3.5 h-3.5" />,
    field: { name: 'first_name', label: 'Name', type: 'text', required: true, placeholder: 'Your name', options: [], validation_pattern: null, default_value: null, map_to_contact_field: 'first_name' },
  },
  {
    label: 'Phone',
    icon: <Phone className="w-3.5 h-3.5" />,
    field: { name: 'phone', label: 'Phone', type: 'phone', required: false, placeholder: '(555) 555-5555', options: [], validation_pattern: null, default_value: null, map_to_contact_field: 'phone' },
  },
  {
    label: 'Message',
    icon: <MessageSquare className="w-3.5 h-3.5" />,
    field: { name: 'message', label: 'Message', type: 'textarea', required: false, placeholder: 'Your message...', options: [], validation_pattern: null, default_value: null, map_to_contact_field: null },
  },
  {
    label: 'Company',
    icon: <Building2 className="w-3.5 h-3.5" />,
    field: { name: 'company', label: 'Company', type: 'text', required: false, placeholder: 'Company name', options: [], validation_pattern: null, default_value: null, map_to_contact_field: 'company' },
  },
  {
    label: 'Dropdown',
    icon: <List className="w-3.5 h-3.5" />,
    field: { name: '', label: '', type: 'select', required: false, placeholder: 'Select an option', options: ['Option 1', 'Option 2', 'Option 3'], validation_pattern: null, default_value: null, map_to_contact_field: null },
  },
  {
    label: 'Date',
    icon: <Calendar className="w-3.5 h-3.5" />,
    field: { name: '', label: '', type: 'date', required: false, placeholder: null, options: [], validation_pattern: null, default_value: null, map_to_contact_field: null },
  },
  {
    label: 'Checkbox',
    icon: <CheckSquare className="w-3.5 h-3.5" />,
    field: { name: '', label: '', type: 'checkbox', required: false, placeholder: null, options: [], validation_pattern: null, default_value: null, map_to_contact_field: null },
  },
];

function labelToName(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

interface FormBuilderProps {
  fields: FormField[];
  onChange: (fields: FormField[]) => void;
  submitButtonText: string;
  onSubmitButtonTextChange: (text: string) => void;
  successMessage: string;
  onSuccessMessageChange: (message: string) => void;
}

export default function FormBuilder({
  fields,
  onChange,
  submitButtonText,
  onSubmitButtonTextChange,
  successMessage,
  onSuccessMessageChange,
}: FormBuilderProps) {
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [nameOverrides, setNameOverrides] = useState<Set<string>>(new Set());
  const [newOptionText, setNewOptionText] = useState<Record<string, string>>({});

  const generateId = () => Math.random().toString(36).substring(2, 10);

  const addField = useCallback((preset?: QuickAddPreset) => {
    const id = generateId();
    const fieldNum = fields.length + 1;

    let newField: FormField;
    if (preset) {
      newField = {
        ...preset.field,
        id,
        name: preset.field.name || `field_${fieldNum}`,
        label: preset.field.label || preset.label,
      };
    } else {
      newField = {
        id,
        name: `field_${fieldNum}`,
        label: '',
        type: 'text',
        required: false,
        placeholder: null,
        options: [],
        validation_pattern: null,
        default_value: null,
        map_to_contact_field: null,
      };
    }

    onChange([...fields, newField]);
    if (!preset || !preset.field.label) {
      setExpandedFieldId(id);
    }
  }, [fields, onChange]);

  const updateField = useCallback((id: string, updates: Partial<FormField>) => {
    onChange(fields.map(f => {
      if (f.id !== id) return f;
      const updated = { ...f, ...updates };
      // Auto-generate name from label unless user has manually overridden
      if ('label' in updates && !nameOverrides.has(id)) {
        updated.name = labelToName(updates.label || '');
      }
      return updated;
    }));
  }, [fields, onChange, nameOverrides]);

  const overrideName = useCallback((id: string, name: string) => {
    setNameOverrides(prev => new Set(prev).add(id));
    onChange(fields.map(f => f.id === id ? { ...f, name: name.toLowerCase().replace(/[^a-z0-9_]/g, '_') } : f));
  }, [fields, onChange]);

  const deleteField = useCallback((id: string) => {
    onChange(fields.filter(f => f.id !== id));
    if (expandedFieldId === id) setExpandedFieldId(null);
    setNameOverrides(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [fields, onChange, expandedFieldId]);

  const moveField = useCallback((fromIndex: number, toIndex: number) => {
    const newFields = [...fields];
    const [removed] = newFields.splice(fromIndex, 1);
    newFields.splice(toIndex, 0, removed);
    onChange(newFields);
  }, [fields, onChange]);

  const addOption = useCallback((fieldId: string) => {
    const text = (newOptionText[fieldId] || '').trim();
    if (!text) return;
    onChange(fields.map(f => f.id === fieldId ? { ...f, options: [...f.options, text] } : f));
    setNewOptionText(prev => ({ ...prev, [fieldId]: '' }));
  }, [fields, onChange, newOptionText]);

  const removeOption = useCallback((fieldId: string, optionIndex: number) => {
    onChange(fields.map(f => f.id === fieldId ? { ...f, options: f.options.filter((_, i) => i !== optionIndex) } : f));
  }, [fields, onChange]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    moveField(draggedIndex, index);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => setDraggedIndex(null);

  const hasOptions = (type: string) => ['select', 'radio', 'checkbox'].includes(type);

  return (
    <div className="space-y-6">
      {/* Quick-add chips */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Quick Add</label>
        <div className="flex flex-wrap gap-2">
          {QUICK_ADD_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => addField(preset)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-full hover:bg-gray-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors"
            >
              {preset.icon}
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Fields list */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-gray-900">
            Fields {fields.length > 0 && <span className="text-gray-400 font-normal">({fields.length})</span>}
          </h4>
          <button
            type="button"
            onClick={() => addField()}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-4 h-4" />
            Custom Field
          </button>
        </div>

        {fields.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
            <p className="text-gray-500 mb-2">No fields yet</p>
            <p className="text-sm text-gray-400">Use the quick-add buttons above or add a custom field</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-200">
            {fields.map((field, index) => (
              <div
                key={field.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`bg-white transition-shadow ${draggedIndex === index ? 'opacity-50' : ''}`}
              >
                {/* Inline row */}
                <div
                  className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedFieldId(expandedFieldId === field.id ? null : field.id)}
                >
                  <div className="cursor-grab text-gray-300 hover:text-gray-500 shrink-0" onClick={e => e.stopPropagation()}>
                    <GripVertical className="w-4 h-4" />
                  </div>

                  {/* Label */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-gray-900 truncate text-sm">
                        {field.label || <span className="text-gray-400 italic">Untitled</span>}
                      </span>
                      {field.required && <span className="text-red-500 text-xs">*</span>}
                    </div>
                    <p className="text-xs text-gray-400 font-mono truncate">{field.name || '—'}</p>
                  </div>

                  {/* Type badge */}
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded shrink-0">
                    {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                  </span>

                  {/* Contact mapping badge */}
                  {field.map_to_contact_field && (
                    <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded shrink-0">
                      {CONTACT_FIELD_MAPPINGS.find(m => m.value === field.map_to_contact_field)?.label || field.map_to_contact_field}
                    </span>
                  )}

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); deleteField(field.id); }}
                    className="text-gray-300 hover:text-red-500 p-1 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Expand toggle */}
                  {expandedFieldId === field.id
                    ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  }
                </div>

                {/* Expanded settings panel */}
                {expandedFieldId === field.id && (
                  <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50/70">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => updateField(field.id, { label: e.target.value })}
                          placeholder="Field label"
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Field Name
                          {!nameOverrides.has(field.id) && (
                            <span className="text-gray-400 font-normal ml-1">(auto)</span>
                          )}
                        </label>
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => overrideName(field.id, e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                        <select
                          value={field.type}
                          onChange={(e) => updateField(field.id, { type: e.target.value as FormField['type'] })}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        >
                          {FIELD_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>{type.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Map to Contact</label>
                        <select
                          value={field.map_to_contact_field || ''}
                          onChange={(e) => updateField(field.id, { map_to_contact_field: e.target.value || null })}
                          className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        >
                          {CONTACT_FIELD_MAPPINGS.map((mapping) => (
                            <option key={mapping.value} value={mapping.value}>{mapping.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Placeholder</label>
                      <input
                        type="text"
                        value={field.placeholder || ''}
                        onChange={(e) => updateField(field.id, { placeholder: e.target.value || null })}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Enter placeholder text..."
                      />
                    </div>

                    {/* Options editor for select/radio/checkbox */}
                    {hasOptions(field.type) && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">Options</label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {field.options.map((option, optIndex) => (
                            <span
                              key={optIndex}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-sm bg-white border border-gray-200 rounded-full"
                            >
                              {option}
                              <button
                                type="button"
                                onClick={() => removeOption(field.id, optIndex)}
                                className="text-gray-400 hover:text-red-500"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                          {field.options.length === 0 && (
                            <span className="text-xs text-gray-400 py-1">No options yet</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newOptionText[field.id] || ''}
                            onChange={(e) => setNewOptionText(prev => ({ ...prev, [field.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(field.id); } }}
                            placeholder="Add option..."
                            className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => addOption(field.id)}
                            className="px-3 py-1.5 text-sm text-indigo-600 border border-indigo-200 rounded-md hover:bg-indigo-50"
                          >
                            Add
                          </button>
                        </div>
                      </div>
                    )}

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateField(field.id, { required: e.target.checked })}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                      <span className="text-sm text-gray-700">Required</span>
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form Settings */}
      <div className="border-t pt-6 space-y-4">
        <h4 className="font-medium text-gray-900">Form Settings</h4>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Submit Button Text</label>
          <input
            type="text"
            value={submitButtonText}
            onChange={(e) => onSubmitButtonTextChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Success Message</label>
          <textarea
            value={successMessage}
            onChange={(e) => onSuccessMessageChange(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>
    </div>
  );
}
