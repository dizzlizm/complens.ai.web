import { type LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  trend?: number;
  trendLabel?: string;
  isLoading?: boolean;
}

export default function StatCard({ label, value, icon: Icon, trend, trendLabel, isLoading }: StatCardProps) {
  return (
    <div className="card">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <Icon className="h-6 w-6 text-primary-600" />
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <p className="text-2xl font-semibold text-gray-900">
            {isLoading ? '-' : value}
          </p>
        </div>
      </div>
      {trend !== undefined && !isLoading && (
        <div className="mt-2 flex items-center gap-1">
          {trend > 0 ? (
            <TrendingUp className="w-4 h-4 text-green-600" />
          ) : trend < 0 ? (
            <TrendingDown className="w-4 h-4 text-red-600" />
          ) : null}
          <span className={`text-sm font-medium ${
            trend > 0 ? 'text-green-600' : trend < 0 ? 'text-red-600' : 'text-gray-500'
          }`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
          {trendLabel && (
            <span className="text-sm text-gray-500">{trendLabel}</span>
          )}
        </div>
      )}
      {trend === undefined && trendLabel && !isLoading && (
        <p className="mt-2 text-sm text-gray-500">{trendLabel}</p>
      )}
    </div>
  );
}
