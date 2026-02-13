import { useState } from 'react';
import { usePublicForm, useSubmitPageForm } from '../../lib/hooks/usePublicPage';
import type { FormField } from '../../lib/hooks/useForms';

interface PublicFormProps {
  formId: string;
  workspaceId: string;
  pageId?: string;
  primaryColor?: string;
}

export default function PublicForm({
  formId,
  workspaceId,
  pageId,
  primaryColor = '#6366f1',
}: PublicFormProps) {
  const { data: form, isLoading, error } = usePublicForm(formId, workspaceId);
  const submitMutation = useSubmitPageForm(pageId || '', workspaceId);

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Detect if form collects email or phone for consent display
  const hasEmailField = form?.fields.some(
    (f) => f.type === 'email' || f.map_to_contact_field === 'email'
  );
  const hasPhoneField = form?.fields.some(
    (f) => f.type === 'phone' || f.map_to_contact_field === 'phone'
  );

  const handleChange = (fieldName: string, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const submitData = { ...formData };
      // Include opt-in signals in form data for backend processing
      if (hasPhoneField) {
        submitData._sms_opt_in = smsOptIn ? 'true' : 'false';
      }
      if (hasEmailField) {
        submitData._email_opt_in = 'true';
      }

      const result = await submitMutation.mutateAsync({
        formId,
        data: submitData,
      });

      setSubmitted(true);
      // Handle cases where message might be boolean-like or empty
      const message = result.message;
      if (!message || message === 'true' || message === 'True' || message === 'false' || message === 'False') {
        setSuccessMessage('Thank you for your submission!');
      } else {
        setSuccessMessage(message);
      }

      if (result.redirect_url) {
        window.location.href = result.redirect_url;
      }
    } catch {
      // Error state handled by submitMutation.isError
    }
  };

  if (isLoading) {
    return (
      <div className="animate-pulse bg-gray-100 rounded-lg p-6">
        <div className="h-4 bg-gray-200 rounded w-1/4 mb-4" />
        <div className="space-y-3">
          <div className="h-10 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded w-1/3" />
        </div>
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="bg-red-50 text-red-600 rounded-lg p-4">
        Failed to load form
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="bg-green-50 text-green-800 rounded-lg p-6 text-center">
        <svg
          className="w-12 h-12 mx-auto mb-4 text-green-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
        <p className="text-lg font-medium">{successMessage}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {form.description && (
        <p className="text-gray-600 mb-4">{form.description}</p>
      )}

      {/* Honeypot field - hidden from users */}
      {form.honeypot_enabled && (
        <input
          type="text"
          name="_honeypot"
          style={{ display: 'none' }}
          tabIndex={-1}
          autoComplete="off"
        />
      )}

      {form.fields.map((field) => (
        <FormFieldComponent
          key={field.id}
          field={field}
          value={formData[field.name] || ''}
          onChange={(value) => handleChange(field.name, value)}
          primaryColor={primaryColor}
        />
      ))}

      {/* SMS opt-in checkbox (TCPA compliance) - shown when form has a phone field */}
      {hasPhoneField && (
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="_sms_opt_in"
            checked={smsOptIn}
            onChange={(e) => setSmsOptIn(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 mt-0.5"
            style={{ accentColor: primaryColor }}
          />
          <label htmlFor="_sms_opt_in" className="text-xs text-gray-600 leading-relaxed">
            I agree to receive SMS/text messages. Message and data rates may apply.
            Message frequency varies. Reply STOP to opt out at any time.
          </label>
        </div>
      )}

      {/* Consent notice (CAN-SPAM / GDPR compliance) */}
      {(hasEmailField || hasPhoneField) && (
        <p className="text-xs text-gray-400 leading-relaxed">
          By submitting this form, you consent to receive communications from us.
          {hasEmailField && ' You can unsubscribe from emails at any time.'}
          {hasPhoneField && !smsOptIn && ' Check the box above to also receive SMS messages.'}
          {' '}We respect your privacy and will not share your information with third parties.
        </p>
      )}

      <button
        type="submit"
        disabled={submitMutation.isPending}
        className="w-full py-3 px-4 rounded-lg text-white font-medium transition-colors disabled:opacity-50"
        style={{ backgroundColor: primaryColor }}
      >
        {submitMutation.isPending ? 'Submitting...' : form.submit_button_text}
      </button>

      {submitMutation.isError && (
        <p className="text-red-600 text-sm text-center">
          Something went wrong. Please try again.
        </p>
      )}
    </form>
  );
}

interface FormFieldComponentProps {
  field: FormField;
  value: string;
  onChange: (value: string) => void;
  primaryColor: string;
}

function FormFieldComponent({
  field,
  value,
  onChange,
  primaryColor,
}: FormFieldComponentProps) {
  const inputClasses =
    'w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent';

  const focusStyle = {
    '--tw-ring-color': primaryColor,
  } as React.CSSProperties;

  const label = (
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {field.label}
      {field.required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );

  switch (field.type) {
    case 'textarea':
      return (
        <div>
          {label}
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || ''}
            required={field.required}
            className={inputClasses}
            style={focusStyle}
            rows={4}
          />
        </div>
      );

    case 'select':
      return (
        <div>
          {label}
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            required={field.required}
            className={inputClasses}
            style={focusStyle}
          >
            <option value="">Select an option</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      );

    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value === 'true'}
            onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
            required={field.required}
            className="w-4 h-4 rounded border-gray-300"
            style={{ accentColor: primaryColor }}
          />
          <label className="text-sm text-gray-700">{field.label}</label>
        </div>
      );

    case 'radio':
      return (
        <div>
          {label}
          <div className="space-y-2">
            {field.options.map((option) => (
              <label key={option} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={field.name}
                  value={option}
                  checked={value === option}
                  onChange={(e) => onChange(e.target.value)}
                  required={field.required}
                  className="w-4 h-4 border-gray-300"
                  style={{ accentColor: primaryColor }}
                />
                <span className="text-sm text-gray-700">{option}</span>
              </label>
            ))}
          </div>
        </div>
      );

    case 'hidden':
      return (
        <input
          type="hidden"
          value={field.default_value || ''}
          name={field.name}
        />
      );

    default:
      return (
        <div>
          {label}
          <input
            type={field.type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || ''}
            required={field.required}
            className={inputClasses}
            style={focusStyle}
            pattern={field.validation_pattern || undefined}
          />
        </div>
      );
  }
}
