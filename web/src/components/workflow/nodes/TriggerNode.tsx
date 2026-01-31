import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Zap } from 'lucide-react';

interface TriggerNodeData {
  label: string;
  nodeType: string;
  config: Record<string, unknown>;
}

function TriggerNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as TriggerNodeData;

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white shadow-sm min-w-[180px] ${
        selected ? 'border-green-500 ring-2 ring-green-200' : 'border-green-400'
      }`}
    >
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded bg-green-100">
          <Zap className="w-4 h-4 text-green-600" />
        </div>
        <div>
          <div className="text-xs font-medium text-green-600 uppercase tracking-wide">
            Trigger
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {nodeData.label}
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-green-500 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(TriggerNode);
