import { useSystemHealth } from '@/lib/hooks/useAdmin';
import { Activity, Server, AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';

export default function AdminSystem() {
  const { data, isLoading, error, refetch } = useSystemHealth();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-400" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-600/20 text-green-400 border-green-600/30';
      case 'degraded':
        return 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30';
      case 'unhealthy':
        return 'bg-red-600/20 text-red-400 border-red-600/30';
      default:
        return 'bg-gray-600/20 text-gray-400 border-gray-600/30';
    }
  };

  const getQueueHealthColor = (messages: number) => {
    if (messages === 0) return 'text-green-400';
    if (messages < 100) return 'text-yellow-400';
    if (messages < 1000) return 'text-orange-400';
    return 'text-red-400';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">Failed to load system health</p>
        <button
          onClick={() => refetch()}
          className="mt-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">System Health</h1>
          <p className="text-gray-400 mt-1">Monitor platform infrastructure</p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg flex items-center gap-2"
        >
          <Activity className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Overall Status */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {getStatusIcon(data.status)}
            <div>
              <h2 className="text-lg font-semibold text-white">System Status</h2>
              <p className="text-gray-400 text-sm">Overall platform health</p>
            </div>
          </div>
          <span className={`px-4 py-2 rounded-full border font-medium ${getStatusColor(data.status)}`}>
            {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
          </span>
        </div>
      </div>

      {/* Queue Status */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
          <Server className="w-5 h-5 text-gray-400" />
          Queue Status
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Object.entries(data.queues).map(([name, queue]) => (
            <div key={name} className="bg-gray-700/50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-white capitalize">
                  {name.replace(/_/g, ' ')}
                </h3>
                {queue.error ? (
                  <span className="text-red-400 text-sm">Error</span>
                ) : (
                  <span className={`text-sm ${getQueueHealthColor(queue.messages)}`}>
                    {queue.messages === 0 ? 'Clear' : `${queue.messages} pending`}
                  </span>
                )}
              </div>

              {queue.error ? (
                <p className="text-red-400 text-sm">{queue.error}</p>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Messages</span>
                    <span className={`font-mono ${getQueueHealthColor(queue.messages)}`}>
                      {queue.messages.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm">In Flight</span>
                    <span className="font-mono text-gray-300">
                      {queue.in_flight.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400 text-sm">Delayed</span>
                    <span className="font-mono text-gray-300">
                      {queue.delayed.toLocaleString()}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="h-2 bg-gray-600 rounded-full overflow-hidden mt-2">
                    <div
                      className={`h-full rounded-full transition-all ${
                        queue.messages === 0
                          ? 'bg-green-500'
                          : queue.messages < 100
                          ? 'bg-yellow-500'
                          : queue.messages < 1000
                          ? 'bg-orange-500'
                          : 'bg-red-500'
                      }`}
                      style={{
                        width: `${Math.min(100, (queue.messages / 1000) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {Object.keys(data.queues).length === 0 && (
          <div className="text-center py-8">
            <Server className="w-12 h-12 text-gray-600 mx-auto mb-2" />
            <p className="text-gray-400">No queue data available</p>
          </div>
        )}
      </div>

      {/* Auto-refresh notice */}
      <p className="text-center text-gray-500 text-sm mt-6">
        Data refreshes automatically every 30 seconds
      </p>
    </div>
  );
}
