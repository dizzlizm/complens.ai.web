import { Eye, FileText, MessageSquare, TrendingUp } from 'lucide-react';

export interface PagePerformance {
  id: string;
  name: string;
  slug: string;
  views: number;
  submissions: number;
  chats: number;
  conversion_rate: number;
}

export interface PageAnalyticsData {
  total_page_views: number;
  total_form_submissions: number;
  total_chat_sessions: number;
  overall_conversion_rate: number;
  top_pages: PagePerformance[];
}

interface PageAnalyticsProps {
  data: PageAnalyticsData;
}

export default function PageAnalytics({ data }: PageAnalyticsProps) {
  return (
    <div className="card">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Page Performance</h2>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Eye className="w-4 h-4" />
            <span className="text-xs font-medium">Page Views</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{data.total_page_views.toLocaleString()}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <FileText className="w-4 h-4" />
            <span className="text-xs font-medium">Submissions</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{data.total_form_submissions.toLocaleString()}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <MessageSquare className="w-4 h-4" />
            <span className="text-xs font-medium">Chat Sessions</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{data.total_chat_sessions.toLocaleString()}</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs font-medium">Conversion Rate</span>
          </div>
          <p className="text-xl font-bold text-gray-900">{data.overall_conversion_rate}%</p>
        </div>
      </div>

      {/* Top pages table */}
      {data.top_pages.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="pb-2 font-medium">Page</th>
                <th className="pb-2 font-medium text-right">Views</th>
                <th className="pb-2 font-medium text-right">Submissions</th>
                <th className="pb-2 font-medium text-right">Chats</th>
                <th className="pb-2 font-medium text-right">Conv. Rate</th>
              </tr>
            </thead>
            <tbody>
              {data.top_pages.map((page) => (
                <tr key={page.id} className="border-b border-gray-50">
                  <td className="py-2.5">
                    <p className="font-medium text-gray-900">{page.name}</p>
                    <p className="text-xs text-gray-400">/{page.slug}</p>
                  </td>
                  <td className="py-2.5 text-right text-gray-700">{page.views.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-gray-700">{page.submissions.toLocaleString()}</td>
                  <td className="py-2.5 text-right text-gray-700">{page.chats.toLocaleString()}</td>
                  <td className="py-2.5 text-right">
                    <span className={`font-medium ${page.conversion_rate > 5 ? 'text-green-600' : 'text-gray-700'}`}>
                      {page.conversion_rate}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-6">
          <Eye className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-gray-500 text-sm">No page data yet</p>
        </div>
      )}
    </div>
  );
}
