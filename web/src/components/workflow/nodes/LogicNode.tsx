import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { GitBranch } from 'lucide-react';

interface LogicNodeData {
  label: string;
  nodeType: string;
  config: Record<string, unknown>;
}

function LogicNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as LogicNodeData;

  return (
    <div
      className={`px-4 py-3 rounded-lg border-2 bg-white shadow-sm min-w-[180px] ${
        selected ? 'border-amber-500 ring-2 ring-amber-200' : 'border-amber-400'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-amber-500 !w-3 !h-3 !border-2 !border-white"
      />
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded bg-amber-100">
          <GitBranch className="w-4 h-4 text-amber-600" />
        </div>
        <div>
          <div className="text-xs font-medium text-amber-600 uppercase tracking-wide">
            Logic
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {nodeData.label}
          </div>
        </div>
      </div>
      {/* Multiple outputs for branching */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{ left: '30%' }}
        className="!bg-green-500 !w-3 !h-3 !border-2 !border-white"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{ left: '70%' }}
        className="!bg-red-500 !w-3 !h-3 !border-2 !border-white"
      />
    </div>
  );
}

export default memo(LogicNode);
