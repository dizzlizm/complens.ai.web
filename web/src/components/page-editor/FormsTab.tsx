import { useState } from 'react';
import { usePageForms, useCreatePageForm, useUpdatePageForm, useDeletePageForm, type Form, type FormField } from '../../lib/hooks/useForms';
import { useSynthesizePage } from '../../lib/hooks/useAI';
import { useToast } from '../Toast';
import FormBuilder from '../FormBuilder';
import FormSubmissions from '../FormSubmissions';
import { Plus, Trash2, Pencil, Sparkles, Loader2, Eye, X } from 'lucide-react';

export interface FormsTabProps {
  workspaceId: string;
  pageId: string;
}

export default function FormsTab({ workspaceId, pageId }: FormsTabProps) {
  const { data: pageForms } = usePageForms(workspaceId, pageId);
  const createForm = useCreatePageForm(workspaceId || '', pageId || '');
  const deleteForm = useDeletePageForm(workspaceId || '', pageId || '');
  const synthesizePage = useSynthesizePage(workspaceId || '');
  const toast = useToast();

  const [editingForm, setEditingForm] = useState<Form | null>(null);
  const [showFormBuilder, setShowFormBuilder] = useState(false);
  const [viewingSubmissionsForm, setViewingSubmissionsForm] = useState<Form | null>(null);
  const [aiFormDescription, setAiFormDescription] = useState('');
  const [formBuilderData, setFormBuilderData] = useState<{
    name: string;
    fields: FormField[];
    submitButtonText: string;
    successMessage: string;
  }>({
    name: 'New Form',
    fields: [],
    submitButtonText: 'Submit',
    successMessage: 'Thank you for your submission!',
  });

  const updateForm = useUpdatePageForm(
    workspaceId || '',
    pageId || '',
    editingForm?.id || '',
  );

  const createFormFieldId = () => crypto.randomUUID().slice(0, 8);

  const mapSynthesizedField = (field: Record<string, unknown>, index: number): FormField => {
    const allowedTypes: FormField['type'][] = [
      'text',
      'email',
      'phone',
      'textarea',
      'select',
      'checkbox',
      'radio',
      'date',
      'number',
      'hidden',
    ];

    const rawType = typeof field.type === 'string' ? field.type : 'text';
    const type = (allowedTypes.includes(rawType as FormField['type']) ? rawType : 'text') as FormField['type'];
    const name = typeof field.name === 'string' && field.name.trim() ? field.name : `field_${index + 1}`;

    return {
      id: createFormFieldId(),
      name,
      label: typeof field.label === 'string' && field.label.trim() ? field.label : name,
      type,
      required: typeof field.required === 'boolean' ? field.required : false,
      placeholder: typeof field.placeholder === 'string' ? field.placeholder : null,
      options: Array.isArray(field.options) ? field.options.filter((o) => typeof o === 'string') : [],
      validation_pattern: typeof field.validation_pattern === 'string' ? field.validation_pattern : null,
      default_value: typeof field.default_value === 'string' ? field.default_value : null,
      map_to_contact_field: typeof field.map_to_contact_field === 'string' ? field.map_to_contact_field : null,
    };
  };

  const resetBuilder = () => {
    setShowFormBuilder(false);
    setEditingForm(null);
    setAiFormDescription('');
    setFormBuilderData({
      name: 'New Form',
      fields: [],
      submitButtonText: 'Submit',
      successMessage: 'Thank you for your submission!',
    });
  };

  const handleSaveForm = async () => {
    if (editingForm) {
      try {
        await updateForm.mutateAsync({
          name: formBuilderData.name,
          fields: formBuilderData.fields,
          submit_button_text: formBuilderData.submitButtonText,
          success_message: formBuilderData.successMessage,
        });
        resetBuilder();
        toast.success('Form updated successfully');
      } catch {
        toast.error('Failed to update form');
      }
    } else {
      try {
        await createForm.mutateAsync({
          name: formBuilderData.name,
          fields: formBuilderData.fields,
          submit_button_text: formBuilderData.submitButtonText,
          success_message: formBuilderData.successMessage,
          create_contact: true,
          trigger_workflow: true,
        });
        resetBuilder();
        toast.success('Form created successfully');
      } catch {
        toast.error('Failed to create form');
      }
    }
  };

  const handleEditForm = (form: Form) => {
    setEditingForm(form);
    setFormBuilderData({
      name: form.name,
      fields: form.fields,
      submitButtonText: form.submit_button_text,
      successMessage: form.success_message,
    });
    setShowFormBuilder(true);
  };

  const handleAIGenerateForm = async () => {
    if (!aiFormDescription.trim()) {
      toast.warning('Please describe the form you want to create.');
      return;
    }

    try {
      const result = await synthesizePage.mutateAsync({
        description: aiFormDescription.trim(),
        include_form: true,
        include_chat: false,
        block_types: ['form'],
        page_id: pageId || undefined,
      });

      if (!result.form_config) {
        toast.error('AI did not return a form configuration. Please try again.');
        return;
      }

      const fallbackFields: FormField[] = [
        {
          id: createFormFieldId(),
          name: 'email',
          label: 'Email',
          type: 'email',
          required: true,
          placeholder: 'your@email.com',
          options: [],
          validation_pattern: null,
          default_value: null,
          map_to_contact_field: 'email',
        },
      ];

      const fields = result.form_config?.fields?.length
        ? result.form_config.fields.map(mapSynthesizedField)
        : fallbackFields;

      const name = formBuilderData.name.trim() || result.form_config?.name || 'New Form';

      setFormBuilderData((prev) => ({
        ...prev,
        name,
        fields,
        submitButtonText: result.form_config?.submit_button_text ?? 'Submit',
        successMessage: result.form_config?.success_message ?? 'Thank you for your submission!',
      }));

      toast.success('AI form draft ready. Review and save.');
    } catch {
      toast.error('Failed to generate form with AI');
    }
  };

  const handleDeleteForm = async (formId: string) => {
    if (!confirm('Are you sure you want to delete this form?')) return;
    try {
      await deleteForm.mutateAsync(formId);
      toast.success('Form deleted');
    } catch {
      toast.error('Failed to delete form');
    }
  };

  const isSaving = editingForm ? updateForm.isPending : createForm.isPending;

  return (
    <div className="space-y-6">
      {/* Form Builder Modal */}
      {showFormBuilder ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              {editingForm ? 'Edit Form' : 'Create New Form'}
            </h3>
            <button
              onClick={resetBuilder}
              className="text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Form Name
            </label>
            <input
              type="text"
              value={formBuilderData.name}
              onChange={(e) => setFormBuilderData(prev => ({ ...prev, name: e.target.value }))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {!editingForm && (
            <div className="border border-indigo-100 rounded-lg p-4 bg-indigo-50/40">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-indigo-900">Build with AI</p>
                  <p className="text-xs text-indigo-700">Describe the form and we'll draft the fields for you.</p>
                </div>
                <button
                  type="button"
                  onClick={handleAIGenerateForm}
                  disabled={synthesizePage.isPending}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 disabled:opacity-50"
                >
                  {synthesizePage.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Build with AI
                    </>
                  )}
                </button>
              </div>
              <div className="mt-3">
                <label className="block text-xs font-medium text-indigo-900 mb-1">
                  Form description
                </label>
                <textarea
                  value={aiFormDescription}
                  onChange={(e) => setAiFormDescription(e.target.value)}
                  rows={3}
                  placeholder="e.g., Intake form for a photography studio with name, email, event date, and budget."
                  className="w-full px-3 py-2 border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
            </div>
          )}

          <FormBuilder
            fields={formBuilderData.fields}
            onChange={(fields) => setFormBuilderData(prev => ({ ...prev, fields }))}
            submitButtonText={formBuilderData.submitButtonText}
            onSubmitButtonTextChange={(text) => setFormBuilderData(prev => ({ ...prev, submitButtonText: text }))}
            successMessage={formBuilderData.successMessage}
            onSuccessMessageChange={(msg) => setFormBuilderData(prev => ({ ...prev, successMessage: msg }))}
          />

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick={resetBuilder}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveForm}
              disabled={isSaving || synthesizePage.isPending || !formBuilderData.name.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {isSaving
                ? (editingForm ? 'Saving...' : 'Creating...')
                : (editingForm ? 'Save Changes' : 'Create Form')
              }
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <p className="text-gray-600">
              Forms capture visitor information and can trigger workflows.
            </p>
            <button
              onClick={() => setShowFormBuilder(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" />
              Add Form
            </button>
          </div>

          {pageForms && pageForms.length > 0 ? (
            <div className="space-y-3">
              {pageForms.map((form) => (
                <div
                  key={form.id}
                  className="flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-gray-300"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-900">{form.name}</p>
                    <p className="text-sm text-gray-500">
                      {form.fields.length} fields •{' '}
                      <button
                        onClick={() => setViewingSubmissionsForm(form)}
                        className="text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        {form.submission_count} submissions
                      </button>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewingSubmissionsForm(form)}
                      className="p-2 text-gray-400 hover:text-indigo-600"
                      title="View submissions"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleEditForm(form)}
                      className="p-2 text-gray-400 hover:text-indigo-600"
                      title="Edit form"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteForm(form.id)}
                      className="p-2 text-gray-400 hover:text-red-500"
                      title="Delete form"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
              <p className="text-gray-500 mb-2">No forms on this page yet</p>
              <button
                onClick={() => setShowFormBuilder(true)}
                className="text-indigo-600 hover:text-indigo-700 font-medium"
              >
                Create your first form
              </button>
            </div>
          )}
        </>
      )}

      {/* Form Submissions Modal */}
      {viewingSubmissionsForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {viewingSubmissionsForm.name}
                </h2>
                <p className="text-sm text-gray-500">Form Submissions</p>
              </div>
              <button
                onClick={() => setViewingSubmissionsForm(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <FormSubmissions
                workspaceId={workspaceId}
                formId={viewingSubmissionsForm.id}
                fields={viewingSubmissionsForm.fields}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
