import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Play } from 'lucide-react';

interface ActionNodeData {
  label: string;
  nodeType: string;
  config: Record<string, unknown>;
}

function ActionNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ActionNodeData;

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white shadow-sm min-w-[180px] ${
        selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-blue-400'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white"
      />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded bg-blue-100">
          <Play className="w-4 h-4 text-blue-600" />
        </div>
        <div>
          <div className="text-xs font-medium text-blue-600 uppercase tracking-wide">
            Action
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {nodeData.label}
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-blue-500 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(ActionNode);
