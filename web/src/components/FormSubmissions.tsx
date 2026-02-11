import { useState } from 'react';
import { useFormSubmissions, type FormField } from '../lib/hooks/useForms';
import { formatDistanceToNow } from 'date-fns';
import { useFormatDate } from '../lib/hooks/useFormatDate';

interface FormSubmissionsProps {
  workspaceId: string;
  formId: string;
  fields: FormField[];
}

export default function FormSubmissions({ workspaceId, formId, fields }: FormSubmissionsProps) {
  const { data: submissions, isLoading, error } = useFormSubmissions(workspaceId, formId);
  const { formatDateTime } = useFormatDate();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const exportToCSV = () => {
    if (!submissions || submissions.length === 0) return;

    // Get all unique field names from submissions
    const allFieldNames = new Set<string>();
    submissions.forEach(sub => {
      Object.keys(sub.data).forEach(key => allFieldNames.add(key));
    });
    const fieldNames = Array.from(allFieldNames);

    // Build CSV content
    const headers = ['Submitted At', 'Contact ID', ...fieldNames, 'Workflow Triggered'];
    const rows = submissions.map(sub => [
      formatDateTime(sub.created_at),
      sub.contact_id || '',
      ...fieldNames.map(name => sub.data[name] || ''),
      sub.workflow_triggered ? 'Yes' : 'No',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `form-submissions-${formId}.csv`;
    link.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-600">
        Failed to load submissions. Please try again.
      </div>
    );
  }

  if (!submissions || submissions.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No submissions yet</h3>
        <p className="mt-1 text-sm text-gray-500">Submissions will appear here when users fill out your form.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">
            {submissions.length} Submission{submissions.length !== 1 ? 's' : ''}
          </h3>
          <p className="text-sm text-gray-500">
            Latest: {formatDistanceToNow(new Date(submissions[0].created_at), { addSuffix: true })}
          </p>
        </div>
        <button
          onClick={exportToCSV}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Submissions list */}
      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
        {submissions.map((submission) => (
          <div key={submission.id} className="p-4">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setExpandedId(expandedId === submission.id ? null : submission.id)}
            >
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {submission.data.email || submission.data.name || submission.data.first_name || 'Anonymous'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatDistanceToNow(new Date(submission.created_at), { addSuffix: true })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {submission.workflow_triggered && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    Workflow triggered
                  </span>
                )}
                {submission.contact_id && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                    Contact created
                  </span>
                )}
                <svg
                  className={`w-5 h-5 text-gray-400 transition-transform ${expandedId === submission.id ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Expanded details */}
            {expandedId === submission.id && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(submission.data).map(([key, value]) => {
                    const field = fields.find(f => f.name === key);
                    const label = field?.label || key;
                    return (
                      <div key={key}>
                        <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
                        <dd className="mt-1 text-sm text-gray-900">{value || '-'}</dd>
                      </div>
                    );
                  })}
                </div>

                {/* Metadata */}
                <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 space-y-1">
                  <p><span className="font-medium">Submitted:</span> {formatDateTime(submission.created_at)}</p>
                  {submission.visitor_ip && <p><span className="font-medium">IP:</span> {submission.visitor_ip}</p>}
                  {submission.referrer && <p><span className="font-medium">Referrer:</span> {submission.referrer}</p>}
                  {submission.contact_id && (
                    <p>
                      <span className="font-medium">Contact:</span>{' '}
                      <a href={`/contacts/${submission.contact_id}`} className="text-indigo-600 hover:underline">
                        {submission.contact_id}
                      </a>
                    </p>
                  )}
                  {submission.workflow_run_id && (
                    <p>
                      <span className="font-medium">Workflow Run:</span>{' '}
                      <span className="font-mono">{submission.workflow_run_id}</span>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
