import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm, useUpdateForm, type FormField, type UpdateFormInput } from '../lib/hooks/useForms';
import { useCurrentWorkspace } from '../lib/hooks/useWorkspaces';
import { useToast } from '../components/Toast';
import FormSubmissions from '../components/FormSubmissions';
import Tabs from '../components/ui/Tabs';

type EditorTab = 'fields' | 'submissions';

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'radio', label: 'Radio Buttons' },
  { value: 'date', label: 'Date' },
  { value: 'number', label: 'Number' },
] as const;

const CONTACT_FIELD_MAPPINGS = [
  { value: '', label: 'None' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
];

export default function FormEditor() {
  const { id: formId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { workspaceId } = useCurrentWorkspace();
  const toast = useToast();

  const { data: form, isLoading } = useForm(workspaceId, formId);
  const updateForm = useUpdateForm(workspaceId || '', formId || '');

  const [formData, setFormData] = useState<UpdateFormInput>({});
  const [fields, setFields] = useState<FormField[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>('fields');

  useEffect(() => {
    if (form) {
      setFormData({
        name: form.name,
        description: form.description ?? undefined,
        submit_button_text: form.submit_button_text,
        success_message: form.success_message,
        redirect_url: form.redirect_url ?? undefined,
        create_contact: form.create_contact,
        add_tags: form.add_tags,
        trigger_workflow: form.trigger_workflow,
        honeypot_enabled: form.honeypot_enabled,
      });
      setFields(form.fields);
    }
  }, [form]);

  const handleChange = <K extends keyof UpdateFormInput>(
    key: K,
    value: UpdateFormInput[K]
  ) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      await updateForm.mutateAsync({ ...formData, fields });
      setHasChanges(false);
      toast.success('Form saved successfully');
    } catch (err) {
      console.error('Failed to save form:', err);
      toast.error('Failed to save form. Please try again.');
    }
  };

  const addField = () => {
    const newField: FormField = {
      id: `field-${Date.now()}`,
      name: `field_${fields.length + 1}`,
      label: `Field ${fields.length + 1}`,
      type: 'text',
      required: false,
      placeholder: null,
      options: [],
      validation_pattern: null,
      default_value: null,
      map_to_contact_field: null,
    };
    setFields([...fields, newField]);
    setEditingField(newField.id);
    setHasChanges(true);
  };

  const updateField = (fieldId: string, updates: Partial<FormField>) => {
    setFields(fields.map((f) => (f.id === fieldId ? { ...f, ...updates } : f)));
    setHasChanges(true);
  };

  const removeField = (fieldId: string) => {
    setFields(fields.filter((f) => f.id !== fieldId));
    setHasChanges(true);
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;

    const newFields = [...fields];
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    setFields(newFields);
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-1/4" />
        <div className="h-64 bg-gray-200 rounded" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="bg-red-50 text-red-600 rounded-lg p-4">
        Form not found.{' '}
        <Link to="/forms" className="underline">
          Go back to forms
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/forms')}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{form.name}</h1>
            <p className="text-gray-500 text-sm">{form.submission_count} submissions</p>
          </div>
        </div>
        {activeTab === 'fields' && (
          <button
            onClick={handleSave}
            disabled={!hasChanges || updateForm.isPending}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {updateForm.isPending ? 'Saving...' : 'Save Changes'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'fields' as EditorTab, label: 'Fields' },
          { id: 'submissions' as EditorTab, label: `Submissions (${form.submission_count})` },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
        size="sm"
      />

      {/* Tab Content */}
      {activeTab === 'submissions' ? (
        <FormSubmissions workspaceId={workspaceId!} formId={formId!} fields={fields} />
      ) : (
      <div className="grid grid-cols-3 gap-6">
        {/* Form Fields */}
        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">Form Fields</h2>
              <button
                onClick={addField}
                className="px-3 py-1 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
              >
                Add Field
              </button>
            </div>

            {fields.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No fields yet. Click "Add Field" to get started.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div
                    key={field.id}
                    className={`border rounded-lg p-4 ${
                      editingField === field.id ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => moveField(index, 'up')}
                          disabled={index === 0}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => moveField(index, 'down')}
                          disabled={index === fields.length - 1}
                          className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <span className="font-medium">{field.label}</span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                          {field.type}
                        </span>
                        {field.required && (
                          <span className="text-xs text-red-600">Required</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingField(editingField === field.id ? null : field.id)}
                          className="text-indigo-600 hover:text-indigo-800 text-sm"
                        >
                          {editingField === field.id ? 'Close' : 'Edit'}
                        </button>
                        <button
                          onClick={() => removeField(field.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {editingField === field.id && (
                      <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Label
                          </label>
                          <input
                            type="text"
                            value={field.label}
                            onChange={(e) => updateField(field.id, { label: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Field Name
                          </label>
                          <input
                            type="text"
                            value={field.name}
                            onChange={(e) =>
                              updateField(field.id, {
                                name: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Type
                          </label>
                          <select
                            value={field.type}
                            onChange={(e) => updateField(field.id, { type: e.target.value as FormField['type'] })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
                            onChange={(e) =>
                              updateField(field.id, {
                                map_to_contact_field: e.target.value || null,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            {CONTACT_FIELD_MAPPINGS.map((mapping) => (
                              <option key={mapping.value} value={mapping.value}>
                                {mapping.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Placeholder
                          </label>
                          <input
                            type="text"
                            value={field.placeholder || ''}
                            onChange={(e) =>
                              updateField(field.id, { placeholder: e.target.value || null })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                        <div className="flex items-center gap-4">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={field.required}
                              onChange={(e) => updateField(field.id, { required: e.target.checked })}
                              className="w-4 h-4 text-indigo-600"
                            />
                            <span className="text-sm text-gray-700">Required</span>
                          </label>
                        </div>

                        {(field.type === 'select' || field.type === 'radio') && (
                          <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Options (one per line)
                            </label>
                            <textarea
                              value={field.options.join('\n')}
                              onChange={(e) =>
                                updateField(field.id, {
                                  options: e.target.value.split('\n').filter(Boolean),
                                })
                              }
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              placeholder="Option 1&#10;Option 2&#10;Option 3"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Settings Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Form Settings</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Form Name
                </label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description || ''}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Submit Button Text
                </label>
                <input
                  type="text"
                  value={formData.submit_button_text || ''}
                  onChange={(e) => handleChange('submit_button_text', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Success Message
                </label>
                <textarea
                  value={formData.success_message || ''}
                  onChange={(e) => handleChange('success_message', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Redirect URL (optional)
                </label>
                <input
                  type="url"
                  value={formData.redirect_url || ''}
                  onChange={(e) => handleChange('redirect_url', e.target.value || undefined)}
                  placeholder="https://example.com/thank-you"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Integrations</h2>

            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Create/Update Contact</span>
                <input
                  type="checkbox"
                  checked={formData.create_contact ?? true}
                  onChange={(e) => handleChange('create_contact', e.target.checked)}
                  className="w-4 h-4 text-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Trigger Workflow</span>
                <input
                  type="checkbox"
                  checked={formData.trigger_workflow ?? true}
                  onChange={(e) => handleChange('trigger_workflow', e.target.checked)}
                  className="w-4 h-4 text-indigo-600"
                />
              </label>

              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700">Honeypot Protection</span>
                <input
                  type="checkbox"
                  checked={formData.honeypot_enabled ?? true}
                  onChange={(e) => handleChange('honeypot_enabled', e.target.checked)}
                  className="w-4 h-4 text-indigo-600"
                />
              </label>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
