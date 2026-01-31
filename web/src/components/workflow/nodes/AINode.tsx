import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Sparkles } from 'lucide-react';

interface AINodeData {
  label: string;
  nodeType: string;
  config: Record<string, unknown>;
}

function AINode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as AINodeData;

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white shadow-sm min-w-[180px] ${
        selected ? 'border-violet-500 ring-2 ring-violet-200' : 'border-violet-400'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-violet-500 !w-3 !h-3 !border-2 !border-white"
      />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded bg-violet-100">
          <Sparkles className="w-4 h-4 text-violet-600" />
        </div>
        <div>
          <div className="text-xs font-medium text-violet-600 uppercase tracking-wide">
            AI
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {nodeData.label}
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-violet-500 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(AINode);
