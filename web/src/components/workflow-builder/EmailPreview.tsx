import { useState, useMemo } from 'react';
import { Send, Loader2, Check, AlertCircle, Eye, Code } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useSendTestEmail } from '../../lib/hooks/useEmailTest';

interface EmailPreviewProps {
  workspaceId: string;
  workflowId: string;
  subject: string;
  bodyHtml: string;
  toEmail?: string;
}

// Sample data for template variable replacement in preview
const SAMPLE_DATA: Record<string, string> = {
  '{{contact.email}}': 'jane@example.com',
  '{{contact.phone}}': '+1 555-123-4567',
  '{{contact.first_name}}': 'Jane',
  '{{contact.last_name}}': 'Doe',
  '{{contact.full_name}}': 'Jane Doe',
  '{{trigger_data.form_data.email}}': 'jane@example.com',
  '{{trigger_data.form_data.message}}': 'I\'d like to learn more about your services.',
  '{{trigger_data.form_data}}': '{"email": "jane@example.com", "message": "Hello"}',
  '{{owner.email}}': 'owner@company.com',
  '{{workspace.name}}': 'My Workspace',
  '{{variables.ai_response}}': 'Thank you for your interest! We\'d love to help you.',
};

function replaceVariables(text: string): string {
  let result = text;
  for (const [variable, value] of Object.entries(SAMPLE_DATA)) {
    result = result.split(variable).join(value);
  }
  return result;
}

export default function EmailPreview({
  workspaceId,
  workflowId,
  subject,
  bodyHtml,
  toEmail,
}: EmailPreviewProps) {
  void toEmail; // available for future use (pre-filling test recipient)
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');
  const [testEmail, setTestEmail] = useState('');
  const sendTestEmail = useSendTestEmail(workspaceId, workflowId);

  const previewSubject = useMemo(() => replaceVariables(subject || ''), [subject]);
  const previewBody = useMemo(() => replaceVariables(bodyHtml || ''), [bodyHtml]);
  const sanitizedBody = useMemo(() => DOMPurify.sanitize(previewBody), [previewBody]);

  const handleSendTest = async () => {
    if (!testEmail) return;
    try {
      await sendTestEmail.mutateAsync({
        to_email: testEmail,
        subject: subject || 'Test Email',
        body_html: bodyHtml || '<p>No content</p>',
      });
    } catch {
      // error handled by mutation state
    }
  };

  return (
    <div className="space-y-4">
      {/* View mode toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setViewMode('preview')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            viewMode === 'preview'
              ? 'bg-primary-100 text-primary-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Eye className="w-4 h-4" />
          Preview
        </button>
        <button
          onClick={() => setViewMode('source')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            viewMode === 'source'
              ? 'bg-primary-100 text-primary-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Code className="w-4 h-4" />
          Source
        </button>
      </div>

      {/* Subject preview */}
      <div className="bg-gray-50 rounded-lg p-3 border">
        <p className="text-xs text-gray-500 mb-1">Subject</p>
        <p className="text-sm font-medium text-gray-900">{previewSubject || '(no subject)'}</p>
      </div>

      {/* Preview / Source */}
      <div className="border rounded-lg overflow-hidden bg-white" style={{ minHeight: 200 }}>
        {viewMode === 'preview' ? (
          bodyHtml ? (
            <iframe
              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;padding:16px;margin:0;font-size:14px;color:#333;line-height:1.6}img{max-width:100%}</style></head><body>${sanitizedBody}</body></html>`}
              className="w-full border-0"
              style={{ minHeight: 200 }}
              title="Email preview"
              sandbox="allow-same-origin"
            />
          ) : (
            <div className="flex items-center justify-center py-12 text-gray-400 text-sm">
              No email body content to preview
            </div>
          )
        ) : (
          <pre className="p-4 text-xs font-mono text-gray-700 whitespace-pre-wrap overflow-auto max-h-64">
            {previewBody || '(no content)'}
          </pre>
        )}
      </div>

      {/* Sample data note */}
      <p className="text-xs text-gray-500">
        Template variables are replaced with sample data in the preview. Actual values will be used at runtime.
      </p>

      {/* Send test email */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Send Test Email</h4>
        <div className="flex items-center gap-2">
          <input
            type="email"
            className="input flex-1 text-sm"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="Enter email address"
          />
          <button
            onClick={handleSendTest}
            disabled={!testEmail || sendTestEmail.isPending}
            className="btn btn-primary inline-flex items-center gap-2 flex-shrink-0"
          >
            {sendTestEmail.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {sendTestEmail.isPending ? 'Sending...' : 'Send Test'}
          </button>
        </div>
        {sendTestEmail.isSuccess && (
          <div className="mt-2 flex items-center gap-2 text-sm text-green-700">
            <Check className="w-4 h-4" />
            Test email sent successfully
          </div>
        )}
        {sendTestEmail.isError && (
          <div className="mt-2 flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4" />
            Failed to send test email
          </div>
        )}
      </div>
    </div>
  );
}
