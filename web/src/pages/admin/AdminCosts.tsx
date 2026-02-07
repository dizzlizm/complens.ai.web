import { useState } from 'react';
import { useUsageMetrics, useActualCosts } from '@/lib/hooks/useAdmin';
import {
  DollarSign,
  Brain,
  Zap,
  Database,
  Globe,
  GitBranch,
  TrendingUp,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react';

type Period = '1h' | '24h' | '7d' | '30d';

const periodLabels: Record<Period, string> = {
  '1h': 'Last Hour',
  '24h': 'Last 24 Hours',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
};

export default function AdminCosts() {
  const [period, setPeriod] = useState<Period>('24h');
  const { data: usage, isLoading: usageLoading, error: usageError } = useUsageMetrics(period);
  const { data: costs, isLoading: costsLoading } = useActualCosts(period);

  // Show usage immediately while costs load
  if (usageLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
      </div>
    );
  }

  if (usageError) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-400">Failed to load usage metrics</p>
      </div>
    );
  }

  // Calculate cost breakdown from Cost Explorer data
  const hasCosts = costs && !costs.error && Object.keys(costs.services).length > 0;
  const totalCost = costs?.total_cost ?? 0;

  const costBreakdown = hasCosts ? [
    { name: 'Bedrock', cost: costs.services.bedrock?.cost ?? 0, color: 'bg-purple-500' },
    { name: 'Lambda', cost: costs.services.lambda?.cost ?? 0, color: 'bg-blue-500' },
    { name: 'DynamoDB', cost: costs.services.dynamodb?.cost ?? 0, color: 'bg-green-500' },
    { name: 'API Gateway', cost: costs.services.api_gateway?.cost ?? 0, color: 'bg-orange-500' },
    { name: 'Step Functions', cost: costs.services.step_functions?.cost ?? 0, color: 'bg-pink-500' },
    { name: 'Other', cost: Object.entries(costs.services)
      .filter(([k]) => !['bedrock', 'lambda', 'dynamodb', 'api_gateway', 'step_functions'].includes(k))
      .reduce((sum, [, v]) => sum + v.cost, 0), color: 'bg-gray-500' },
  ].filter(item => item.cost > 0) : [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">AWS Usage & Costs</h1>
          <p className="text-gray-400 mt-1">Real-time usage metrics with actual billing data</p>
        </div>

        {/* Period Selector */}
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as Period)}
          className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-red-500"
        >
          {Object.entries(periodLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Actual Cost Card (from Cost Explorer) */}
      <div className="bg-gradient-to-r from-red-600/20 to-orange-600/20 rounded-xl border border-red-600/30 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5 text-red-400" />
              <span className="text-gray-400">Actual AWS Cost</span>
              {costsLoading && (
                <Loader2 className="w-4 h-4 text-gray-500 animate-spin" />
              )}
            </div>

            {costsLoading ? (
              <p className="text-4xl font-bold text-gray-500">Loading...</p>
            ) : costs?.error ? (
              <div>
                <p className="text-xl font-bold text-yellow-400">Cost data unavailable</p>
                <p className="text-sm text-gray-500 mt-1">{costs.error}</p>
              </div>
            ) : hasCosts ? (
              <>
                <p className="text-4xl font-bold text-white">
                  {costs.total_cost_formatted}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  {periodLabels[period]} ({costs.start_date} to {costs.end_date})
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-gray-400">No cost data yet</p>
                <p className="text-sm text-gray-500 mt-1">Cost Explorer data may take 24-48 hours to appear</p>
              </>
            )}
          </div>

          {/* Cost Breakdown Bar */}
          {hasCosts && totalCost > 0 && (
            <div className="hidden md:block w-64">
              <div className="flex rounded-full overflow-hidden h-4 bg-gray-700">
                {costBreakdown.map((item) => {
                  const percentage = (item.cost / totalCost) * 100;
                  if (percentage < 1) return null;
                  return (
                    <div
                      key={item.name}
                      className={`${item.color}`}
                      style={{ width: `${percentage}%` }}
                      title={`${item.name}: $${item.cost.toFixed(2)}`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                {costBreakdown.map((item) => (
                  <div key={item.name} className="flex items-center gap-1 text-xs">
                    <div className={`w-2 h-2 rounded-full ${item.color}`} />
                    <span className="text-gray-400">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cost Explorer note */}
        <div className="mt-4 pt-4 border-t border-gray-700/50 flex items-start gap-2">
          <Info className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-gray-500">
            Costs are retrieved from AWS Cost Explorer and may have a 24-48 hour delay.
            Usage metrics below are real-time from CloudWatch.
          </p>
        </div>
      </div>

      {/* Service Cards Grid - Usage Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bedrock (AI) */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-400" />
              Amazon Bedrock
            </h2>
            {hasCosts && costs.services.bedrock && (
              <span className="text-lg font-bold text-purple-400">
                ${costs.services.bedrock.cost.toFixed(2)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <span className="text-sm text-gray-400">Invocations</span>
              <p className="text-xl font-bold text-white">
                {(usage?.bedrock?.total_invocations ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-400">Input Tokens</span>
              <p className="text-xl font-bold text-white">
                {(usage?.bedrock?.total_input_tokens ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-400">Output Tokens</span>
              <p className="text-xl font-bold text-white">
                {(usage?.bedrock?.total_output_tokens ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Per-Model Breakdown */}
          {usage?.bedrock?.models && Object.keys(usage.bedrock.models).length > 0 && (
            <div className="border-t border-gray-700 pt-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Per Model</h3>
              <div className="space-y-2">
                {Object.entries(usage.bedrock.models).map(([modelName, modelMetrics]) => (
                  <div key={modelName} className="flex items-center justify-between py-2 px-3 bg-gray-700/50 rounded-lg">
                    <span className="text-sm text-gray-300 truncate max-w-[200px]" title={modelName}>
                      {modelName.replace('us.anthropic.', '').replace('amazon.', '')}
                    </span>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-400">{modelMetrics.invocations} calls</span>
                      <span className="text-gray-400">
                        {modelMetrics.input_tokens.toLocaleString()} in / {modelMetrics.output_tokens.toLocaleString()} out
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Lambda */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-400" />
              AWS Lambda
            </h2>
            {hasCosts && costs.services.lambda && (
              <span className="text-lg font-bold text-blue-400">
                ${costs.services.lambda.cost.toFixed(2)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <span className="text-sm text-gray-400">Invocations</span>
              <p className="text-xl font-bold text-white">
                {(usage?.lambda?.total_invocations ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-400">Duration</span>
              <p className="text-xl font-bold text-white">
                {((usage?.lambda?.total_duration_ms ?? 0) / 1000).toFixed(1)}s
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-400">Errors</span>
              <p className={`text-xl font-bold ${(usage?.lambda?.total_errors ?? 0) > 0 ? 'text-red-400' : 'text-white'}`}>
                {(usage?.lambda?.total_errors ?? 0).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Top Functions */}
          {usage?.lambda?.functions && Object.keys(usage.lambda.functions).length > 0 && (
            <div className="border-t border-gray-700 pt-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Top Functions</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {Object.entries(usage.lambda.functions)
                  .sort(([, a], [, b]) => b.invocations - a.invocations)
                  .slice(0, 8)
                  .map(([funcName, funcMetrics]) => (
                    <div key={funcName} className="flex items-center justify-between py-2 px-3 bg-gray-700/50 rounded-lg">
                      <span className="text-sm text-gray-300 truncate max-w-[150px]" title={funcName}>
                        {funcName}
                      </span>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-gray-400">{funcMetrics.invocations} calls</span>
                        {funcMetrics.errors > 0 && (
                          <span className="text-red-400">{funcMetrics.errors} err</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* DynamoDB */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-green-400" />
              DynamoDB
            </h2>
            {hasCosts && costs.services.dynamodb && (
              <span className="text-lg font-bold text-green-400">
                ${costs.services.dynamodb.cost.toFixed(2)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="text-sm text-gray-400">Read Units Consumed</span>
              <p className="text-xl font-bold text-white">
                {(usage?.dynamodb?.consumed_read_units ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-400">Write Units Consumed</span>
              <p className="text-xl font-bold text-white">
                {(usage?.dynamodb?.consumed_write_units ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* API Gateway */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Globe className="w-5 h-5 text-orange-400" />
              API Gateway
            </h2>
            {hasCosts && costs.services.api_gateway && (
              <span className="text-lg font-bold text-orange-400">
                ${costs.services.api_gateway.cost.toFixed(2)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-sm text-gray-400">Requests</span>
              <p className="text-xl font-bold text-white">
                {(usage?.api_gateway?.request_count ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-400">4XX Errors</span>
              <p className={`text-xl font-bold ${(usage?.api_gateway?.['4xx_errors'] ?? 0) > 0 ? 'text-yellow-400' : 'text-white'}`}>
                {(usage?.api_gateway?.['4xx_errors'] ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-400">5XX Errors</span>
              <p className={`text-xl font-bold ${(usage?.api_gateway?.['5xx_errors'] ?? 0) > 0 ? 'text-red-400' : 'text-white'}`}>
                {(usage?.api_gateway?.['5xx_errors'] ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        {/* Step Functions */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-pink-400" />
              Step Functions
            </h2>
            {hasCosts && costs.services.step_functions && (
              <span className="text-lg font-bold text-pink-400">
                ${costs.services.step_functions.cost.toFixed(2)}
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <span className="text-sm text-gray-400">Executions Started</span>
              <p className="text-xl font-bold text-white">
                {(usage?.step_functions?.executions_started ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-400">Succeeded</span>
              <p className="text-xl font-bold text-green-400">
                {(usage?.step_functions?.executions_succeeded ?? 0).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-sm text-gray-400">Failed</span>
              <p className={`text-xl font-bold ${(usage?.step_functions?.executions_failed ?? 0) > 0 ? 'text-red-400' : 'text-white'}`}>
                {(usage?.step_functions?.executions_failed ?? 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Reference */}
      <div className="mt-8 bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <h3 className="text-sm font-medium text-gray-400 mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" />
          Pricing Reference (as of Jan 2025)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Claude Sonnet 4.5</span>
            <p className="text-gray-300">$3.00 / $15.00 per 1M tokens</p>
          </div>
          <div>
            <span className="text-gray-500">Claude Haiku 4.5</span>
            <p className="text-gray-300">$0.80 / $4.00 per 1M tokens</p>
          </div>
          <div>
            <span className="text-gray-500">Titan Image Gen v2</span>
            <p className="text-gray-300">$0.013 per image</p>
          </div>
          <div>
            <span className="text-gray-500">Lambda</span>
            <p className="text-gray-300">$0.0000166667 per GB-second</p>
          </div>
        </div>
      </div>
    </div>
  );
}
