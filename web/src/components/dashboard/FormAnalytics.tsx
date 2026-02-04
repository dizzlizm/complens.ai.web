import { FileText } from 'lucide-react';

export interface FormPerformance {
  id: string;
  name: string;
  page_name: string;
  submissions: number;
}

export interface FormAnalyticsData {
  total_submissions: number;
  top_forms: FormPerformance[];
}

interface FormAnalyticsProps {
  data: FormAnalyticsData;
}

export default function FormAnalytics({ data }: FormAnalyticsProps) {
  const maxSubmissions = data.top_forms.length > 0
    ? Math.max(...data.top_forms.map(f => f.submissions))
    : 0;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Form Performance</h2>
        <span className="text-sm text-gray-500">{data.total_submissions} total submissions</span>
      </div>

      {data.top_forms.length > 0 ? (
        <div className="space-y-3">
          {data.top_forms.map((form) => (
            <div key={form.id} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{form.name}</p>
                <p className="text-xs text-gray-400 truncate">{form.page_name}</p>
              </div>
              <div className="w-32 flex items-center gap-2">
                <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-primary-500 h-full rounded-full"
                    style={{ width: `${maxSubmissions > 0 ? (form.submissions / maxSubmissions) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-gray-600 font-medium w-8 text-right">
                  {form.submissions}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No form submissions yet</p>
        </div>
      )}
    </div>
  );
}
