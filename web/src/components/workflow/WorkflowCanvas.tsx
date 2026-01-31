import { useCallback, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
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

export interface WorkflowCanvasRef {
  getNodes: () => Node[];
  getEdges: () => Edge[];
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
}

interface WorkflowCanvasProps {
  workflowId?: string;
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onChange?: (nodes: Node[], edges: Edge[]) => void;
}

const defaultNodes: Node[] = [
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

const WorkflowCanvasInner = forwardRef<WorkflowCanvasRef, WorkflowCanvasProps>(
  function WorkflowCanvasInner({ initialNodes, initialEdges, onChange }, ref) {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes || defaultNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges || []);
    const { screenToFlowPosition } = useReactFlow();

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      getNodes: () => nodes,
      getEdges: () => edges,
      setNodes: (newNodes: Node[]) => setNodes(newNodes),
      setEdges: (newEdges: Edge[]) => setEdges(newEdges),
    }), [nodes, edges, setNodes, setEdges]);

    // Notify parent of changes
    useEffect(() => {
      onChange?.(nodes, edges);
    }, [nodes, edges, onChange]);

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

    // Handle keyboard delete
    const onKeyDown = useCallback((event: React.KeyboardEvent) => {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        setNodes((nds) => nds.filter((node) => !node.selected));
        setEdges((eds) => eds.filter((edge) => !edge.selected));
      }
    }, [setNodes, setEdges]);

    return (
      <div
        ref={reactFlowWrapper}
        className="h-full w-full"
        onKeyDown={onKeyDown}
        tabIndex={0}
      >
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
          deleteKeyCode={['Backspace', 'Delete']}
          selectionKeyCode={['Shift']}
          multiSelectionKeyCode={['Meta', 'Control']}
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
);

const WorkflowCanvas = forwardRef<WorkflowCanvasRef, WorkflowCanvasProps>(
  function WorkflowCanvas(props, ref) {
    return (
      <ReactFlowProvider>
        <WorkflowCanvasInner {...props} ref={ref} />
      </ReactFlowProvider>
    );
  }
);

export default WorkflowCanvas;
