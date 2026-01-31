import { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TriggerNode from './nodes/TriggerNode';
import ActionNode from './nodes/ActionNode';
import LogicNode from './nodes/LogicNode';
import AINode from './nodes/AINode';

const nodeTypes: NodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  logic: LogicNode,
  ai: AINode,
};

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'trigger',
    position: { x: 250, y: 50 },
    data: {
      label: 'Form Submitted',
      nodeType: 'trigger_form_submitted',
      config: { formId: '' }
    },
  },
];

const initialEdges: Edge[] = [];

interface WorkflowCanvasProps {
  workflowId?: string;
  onSave?: (nodes: Node[], edges: Edge[]) => void;
}

function WorkflowCanvasInner(_props: WorkflowCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const { screenToFlowPosition } = useReactFlow();

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow/type');
      const nodeType = event.dataTransfer.getData('application/reactflow/nodeType');
      const label = event.dataTransfer.getData('application/reactflow/label');

      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: { label, nodeType, config: {} },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  return (
    <div ref={reactFlowWrapper} className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#6366f1', strokeWidth: 2 },
        }}
      >
        <Background color="#e2e8f0" gap={15} />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            switch (node.type) {
              case 'trigger': return '#22c55e';
              case 'action': return '#3b82f6';
              case 'logic': return '#f59e0b';
              case 'ai': return '#8b5cf6';
              default: return '#6b7280';
            }
          }}
        />
      </ReactFlow>
    </div>
  );
}

export default function WorkflowCanvas(props: WorkflowCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
