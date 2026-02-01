import { useState, useCallback } from 'react';
import { Plus, Trash2, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import type { FormField } from '../lib/hooks/useForms';

const FIELD_TYPES = [
  { value: 'text', label: 'Text', icon: 'Aa' },
  { value: 'email', label: 'Email', icon: '@' },
  { value: 'phone', label: 'Phone', icon: '#' },
  { value: 'textarea', label: 'Long Text', icon: '...' },
  { value: 'select', label: 'Dropdown', icon: 'v' },
  { value: 'checkbox', label: 'Checkbox', icon: '[]' },
  { value: 'number', label: 'Number', icon: '123' },
  { value: 'date', label: 'Date', icon: 'cal' },
] as const;

const CONTACT_FIELD_MAPPINGS = [
  { value: '', label: 'None' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'company', label: 'Company' },
];

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

  const generateId = () => Math.random().toString(36).substring(2, 10);

  const addField = useCallback(() => {
    const newField: FormField = {
      id: generateId(),
      name: `field_${fields.length + 1}`,
      label: 'New Field',
      type: 'text',
      required: false,
      placeholder: null,
      options: [],
      validation_pattern: null,
      default_value: null,
      map_to_contact_field: null,
    };
    onChange([...fields, newField]);
    setExpandedFieldId(newField.id);
  }, [fields, onChange]);

  const updateField = useCallback((id: string, updates: Partial<FormField>) => {
    onChange(fields.map(f => f.id === id ? { ...f, ...updates } : f));
  }, [fields, onChange]);

  const deleteField = useCallback((id: string) => {
    onChange(fields.filter(f => f.id !== id));
    if (expandedFieldId === id) {
      setExpandedFieldId(null);
    }
  }, [fields, onChange, expandedFieldId]);

  const moveField = useCallback((fromIndex: number, toIndex: number) => {
    const newFields = [...fields];
    const [removed] = newFields.splice(fromIndex, 1);
    newFields.splice(toIndex, 0, removed);
    onChange(newFields);
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

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  return (
    <div className="space-y-6">
      {/* Form Fields */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-gray-900">Form Fields</h4>
          <button
            type="button"
            onClick={addField}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
          >
            <Plus className="w-4 h-4" />
            Add Field
          </button>
        </div>

        {fields.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
            <p className="text-gray-500 mb-2">No fields yet</p>
            <button
              type="button"
              onClick={addField}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Add your first field
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {fields.map((field, index) => (
              <div
                key={field.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`border rounded-lg bg-white transition-shadow ${
                  draggedIndex === index ? 'opacity-50' : ''
                } ${expandedFieldId === field.id ? 'ring-2 ring-indigo-500' : ''}`}
              >
                {/* Field Header */}
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer"
                  onClick={() => setExpandedFieldId(expandedFieldId === field.id ? null : field.id)}
                >
                  <div className="cursor-grab text-gray-400 hover:text-gray-600">
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{field.label}</span>
                      {field.required && (
                        <span className="text-red-500 text-sm">*</span>
                      )}
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                        {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{field.name}</p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteField(field.id);
                    }}
                    className="text-gray-400 hover:text-red-500 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  {expandedFieldId === field.id ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>

                {/* Expanded Field Settings */}
                {expandedFieldId === field.id && (
                  <div className="border-t p-4 space-y-4 bg-gray-50">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Label
                        </label>
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => updateField(field.id, { label: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Field Name
                        </label>
                        <input
                          type="text"
                          value={field.name}
                          onChange={(e) => updateField(field.id, {
                            name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Field Type
                        </label>
                        <select
                          value={field.type}
                          onChange={(e) => updateField(field.id, { type: e.target.value as FormField['type'] })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        >
                          {FIELD_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Map to Contact
                        </label>
                        <select
                          value={field.map_to_contact_field || ''}
                          onChange={(e) => updateField(field.id, {
                            map_to_contact_field: e.target.value || null
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        >
                          {CONTACT_FIELD_MAPPINGS.map((mapping) => (
                            <option key={mapping.value} value={mapping.value}>
                              {mapping.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Placeholder
                      </label>
                      <input
                        type="text"
                        value={field.placeholder || ''}
                        onChange={(e) => updateField(field.id, { placeholder: e.target.value || null })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                        placeholder="Enter placeholder text..."
                      />
                    </div>

                    {/* Options for select/radio/checkbox */}
                    {['select', 'radio', 'checkbox'].includes(field.type) && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Options (one per line)
                        </label>
                        <textarea
                          value={field.options.join('\n')}
                          onChange={(e) => updateField(field.id, {
                            options: e.target.value.split('\n').filter(Boolean)
                          })}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                          placeholder="Option 1&#10;Option 2&#10;Option 3"
                        />
                      </div>
                    )}

                    <div className="flex items-center gap-4">
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Submit Button Text
          </label>
          <input
            type="text"
            value={submitButtonText}
            onChange={(e) => onSubmitButtonTextChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Success Message
          </label>
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
