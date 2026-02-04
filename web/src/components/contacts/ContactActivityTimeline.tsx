import { useState } from 'react';
import {
  MessageSquare, Zap, FileText, StickyNote,
  ChevronDown, ChevronRight, Loader2,
} from 'lucide-react';
import type { ActivityItem } from '../../lib/hooks/useContacts';

interface ContactActivityTimelineProps {
  activities: ActivityItem[];
  isLoading: boolean;
}

const typeConfig: Record<string, { icon: typeof MessageSquare; color: string; bgColor: string }> = {
  conversation: { icon: MessageSquare, color: 'text-blue-600', bgColor: 'bg-blue-100' },
  workflow_run: { icon: Zap, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  form_submission: { icon: FileText, color: 'text-green-600', bgColor: 'bg-green-100' },
  note: { icon: StickyNote, color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
};

const typeLabels: Record<string, string> = {
  conversation: 'Conversation',
  workflow_run: 'Workflow Run',
  form_submission: 'Form Submission',
  note: 'Note',
};

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ActivityItemCard({ activity }: { activity: ActivityItem }) {
  const [expanded, setExpanded] = useState(false);
  const config = typeConfig[activity.type] || typeConfig.note;
  const Icon = config.icon;

  return (
    <div className="relative flex gap-3 pb-6 last:pb-0">
      {/* Timeline line */}
      <div className="absolute left-[15px] top-8 bottom-0 w-px bg-gray-200 last:hidden" />

      {/* Icon */}
      <div className={`relative z-10 w-8 h-8 rounded-full ${config.bgColor} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${config.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase">
              {typeLabels[activity.type]}
            </span>
            <p className="text-sm text-gray-900 mt-0.5">{activity.summary}</p>
          </div>
          <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">
            {formatRelativeTime(activity.timestamp)}
          </span>
        </div>

        {/* Expandable details */}
        {activity.data && Object.keys(activity.data).length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            Details
          </button>
        )}

        {expanded && (
          <div className="mt-2 bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
            {Object.entries(activity.data).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="font-medium text-gray-500 min-w-[80px]">{key}:</span>
                <span className="break-all">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ContactActivityTimeline({ activities, isLoading }: ContactActivityTimelineProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12">
        <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">No activity yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {activities.map((activity, index) => (
        <ActivityItemCard key={`${activity.type}-${activity.timestamp}-${index}`} activity={activity} />
      ))}
    </div>
  );
}
