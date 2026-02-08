import { Link } from 'react-router-dom';
import {
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  User,
  GitBranch,
  Activity,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { RecentActivityItem } from '@/lib/hooks/useAnalytics';

interface RecentActivityProps {
  activities: RecentActivityItem[];
  isLoading?: boolean;
}

const iconMap: Record<RecentActivityItem['type'], typeof GitBranch> = {
  workflow_run: GitBranch,
  form_submission: FileText,
  contact_created: User,
};

const statusColors = {
  success: 'text-green-500',
  failed: 'text-red-500',
  running: 'text-blue-500',
};

const statusIcons = {
  success: CheckCircle,
  failed: XCircle,
  running: Clock,
};

export default function RecentActivity({ activities, isLoading }: RecentActivityProps) {
  if (isLoading) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-start gap-3 animate-pulse">
              <div className="w-8 h-8 bg-gray-200 rounded-full" />
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        <div className="text-center py-8">
          <Activity className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No recent activity</p>
          <p className="text-sm text-gray-400 mt-1">
            Activity will appear here when workflows run or forms are submitted
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        <Link
          to="/workflows"
          className="text-sm text-primary-600 hover:text-primary-700"
        >
          View all
        </Link>
      </div>

      <div className="space-y-1">
        {activities.map((activity) => {
          const Icon = iconMap[activity.type];
          const StatusIcon = activity.status ? statusIcons[activity.status] : null;
          const statusColor = activity.status ? statusColors[activity.status] : '';

          const content = (
            <div className="flex items-start gap-3 p-2 -mx-2 rounded-lg hover:bg-gray-50 transition-colors">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {activity.title}
                  </p>
                  {StatusIcon && (
                    <StatusIcon className={`w-4 h-4 flex-shrink-0 ${statusColor}`} />
                  )}
                </div>
                {activity.description && (
                  <p className="text-sm text-gray-500 truncate">{activity.description}</p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                </p>
              </div>
            </div>
          );

          return activity.link ? (
            <Link key={activity.id} to={activity.link} className="block">
              {content}
            </Link>
          ) : (
            <div key={activity.id}>{content}</div>
          );
        })}
      </div>
    </div>
  );
}
