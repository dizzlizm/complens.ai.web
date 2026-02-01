import { FileText } from 'lucide-react';
import { FormConfig } from '../types';

interface FormField {
  id: string;
  name: string;
  label: string;
  type: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

interface FormInfo {
  id: string;
  name: string;
  fields?: FormField[];
}

interface FormBlockProps {
  config: FormConfig;
  isEditing?: boolean;
  onConfigChange?: (config: FormConfig) => void;
  forms?: FormInfo[];
}

export default function FormBlock({ config, isEditing, onConfigChange, forms = [] }: FormBlockProps) {
  const {
    formId = '',
    title = 'Get in Touch',
    description = 'Fill out the form below and we\'ll get back to you.',
  } = config;

  const handleChange = (field: keyof FormConfig, value: string) => {
    if (onConfigChange) {
      onConfigChange({ ...config, [field]: value });
    }
  };

  const selectedForm = forms.find(f => f.id === formId);

  // Render a single form field preview
  const renderFieldPreview = (field: FormField) => {
    switch (field.type) {
      case 'textarea':
        return (
          <div key={field.id}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <textarea
              placeholder={field.placeholder || ''}
              disabled
              rows={3}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-400"
            />
          </div>
        );
      case 'select':
        return (
          <div key={field.id}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <select
              disabled
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-400"
            >
              <option>{field.placeholder || 'Select...'}</option>
              {field.options?.map((opt, i) => (
                <option key={i}>{opt}</option>
              ))}
            </select>
          </div>
        );
      case 'checkbox':
        return (
          <div key={field.id} className="flex items-center gap-2">
            <input type="checkbox" disabled className="w-4 h-4 rounded border-gray-300" />
            <label className="text-sm text-gray-700">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
          </div>
        );
      default:
        return (
          <div key={field.id}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>
            <input
              type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
              placeholder={field.placeholder || ''}
              disabled
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-400"
            />
          </div>
        );
    }
  };

  // Default placeholder fields when no form is selected or no fields defined
  const renderPlaceholderFields = () => (
    <div className="space-y-4 opacity-60">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <div className="w-full h-10 bg-gray-100 rounded-lg border border-gray-200" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <div className="w-full h-10 bg-gray-100 rounded-lg border border-gray-200" />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
        <div className="w-full h-24 bg-gray-100 rounded-lg border border-gray-200" />
      </div>
    </div>
  );

  return (
    <div className="py-16 px-8 bg-gray-50">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          {isEditing ? (
            <>
              <input
                type="text"
                value={title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="w-full text-2xl font-bold text-gray-900 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center mb-2"
                placeholder="Form title..."
              />
              <input
                type="text"
                value={description}
                onChange={(e) => handleChange('description', e.target.value)}
                className="w-full text-gray-600 bg-transparent border-none focus:outline-none focus:ring-2 focus:ring-indigo-200 rounded text-center"
                placeholder="Form description..."
              />
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
              <p className="text-gray-600">{description}</p>
            </>
          )}
        </div>

        {/* Form Preview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          {formId && selectedForm ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
                <FileText className="w-4 h-4" />
                <span>Form: {selectedForm.name}</span>
              </div>

              {/* Render actual form fields if available */}
              {selectedForm.fields && selectedForm.fields.length > 0 ? (
                <div className="space-y-4">
                  {selectedForm.fields.map(renderFieldPreview)}
                </div>
              ) : (
                renderPlaceholderFields()
              )}

              <button className="w-full py-3 bg-indigo-600 text-white font-medium rounded-lg mt-4">
                Submit
              </button>

              <p className="text-xs text-gray-400 text-center mt-4">
                Form preview - actual form will render on published page
              </p>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-lg mb-4">
                <FileText className="w-6 h-6 text-gray-400" />
              </div>
              <p className="text-gray-500 mb-2">No form selected</p>
              <p className="text-sm text-gray-400">
                Select a form in the block settings to embed it here
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
