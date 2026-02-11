import { useCallback, useMemo, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnSelectionChangeParams,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TriggerNode from './nodes/TriggerNode';
import ActionNode from './nodes/ActionNode';
import LogicNode from './nodes/LogicNode';
import AINode from './nodes/AINode';
import AddNodeButton from './AddNodeButton';
import type { WorkflowStepSuggestion } from '../../lib/hooks/useAI';

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
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  getSelectedNode: () => Node | null;
  getViewport: () => { x: number; y: number; zoom: number };
}

interface WorkflowCanvasProps {
  workflowId?: string;
  workspaceId?: string;
  initialNodes?: Node[];
  initialEdges?: Edge[];
  onChange?: (nodes: Node[], edges: Edge[]) => void;
  onNodeSelect?: (node: Node | null) => void;
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
  function WorkflowCanvasInner({ initialNodes, initialEdges, workspaceId, onChange, onNodeSelect }, ref) {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes || defaultNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges || []);
    const { screenToFlowPosition, getViewport, flowToScreenPosition } = useReactFlow();

    // Track selected node
    const selectedNodeRef = useRef<Node | null>(null);

    // Update node data
    const updateNodeData = useCallback((nodeId: string, newData: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                ...newData,
              },
            };
          }
          return node;
        })
      );
    }, [setNodes]);

    // Get selected node
    const getSelectedNode = useCallback(() => {
      return nodes.find((n) => n.selected) || null;
    }, [nodes]);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      getNodes: () => nodes,
      getEdges: () => edges,
      setNodes: (newNodes: Node[]) => setNodes(newNodes),
      setEdges: (newEdges: Edge[]) => setEdges(newEdges),
      updateNodeData,
      getSelectedNode,
      getViewport,
    }), [nodes, edges, setNodes, setEdges, updateNodeData, getSelectedNode, getViewport]);

    // Notify parent of changes
    useEffect(() => {
      onChange?.(nodes, edges);
    }, [nodes, edges, onChange]);

    // Handle selection changes
    const onSelectionChange = useCallback(({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      const newSelectedNode = selectedNodes.length === 1 ? selectedNodes[0] : null;

      // Only notify if selection actually changed
      if (newSelectedNode?.id !== selectedNodeRef.current?.id) {
        selectedNodeRef.current = newSelectedNode;
        onNodeSelect?.(newSelectedNode);
      }
    }, [onNodeSelect]);

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
        // Don't delete if we're in an input field
        if ((event.target as HTMLElement).tagName === 'INPUT' ||
            (event.target as HTMLElement).tagName === 'TEXTAREA') {
          return;
        }
        setNodes((nds) => nds.filter((node) => !node.selected));
        setEdges((eds) => eds.filter((edge) => !edge.selected));
      }
    }, [setNodes, setEdges]);

    // Handle pane click (deselect)
    const onPaneClick = useCallback(() => {
      selectedNodeRef.current = null;
      onNodeSelect?.(null);
    }, [onNodeSelect]);

    // Handle adding a suggested node
    const handleAddSuggestedNode = useCallback((suggestion: WorkflowStepSuggestion, sourceNodeId: string) => {
      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      if (!sourceNode) return;

      // Derive React Flow type category from node_type
      let rfType = 'action';
      if (suggestion.node_type.startsWith('trigger_')) rfType = 'trigger';
      else if (suggestion.node_type.startsWith('action_')) rfType = 'action';
      else if (suggestion.node_type.startsWith('logic_')) rfType = 'logic';
      else if (suggestion.node_type.startsWith('ai_')) rfType = 'ai';

      const newNodeId = `${rfType}-${Date.now()}`;
      const newNode: Node = {
        id: newNodeId,
        type: rfType,
        position: {
          x: sourceNode.position.x,
          y: sourceNode.position.y + 150,
        },
        data: {
          label: suggestion.label,
          nodeType: suggestion.node_type,
          config: suggestion.config || {},
        },
        selected: true,
      };

      const newEdge: Edge = {
        id: `e-${sourceNodeId}-${newNodeId}`,
        source: sourceNodeId,
        target: newNodeId,
        animated: true,
      };

      // Deselect all existing nodes, add new node selected
      setNodes((nds) => [
        ...nds.map((n) => ({ ...n, selected: false })),
        newNode,
      ]);
      setEdges((eds) => [...eds, newEdge]);

      // Notify parent of selection change
      setTimeout(() => {
        selectedNodeRef.current = newNode;
        onNodeSelect?.(newNode);
      }, 0);
    }, [nodes, setNodes, setEdges, onNodeSelect]);

    // Find nodes without outgoing edges (excluding logic nodes)
    const nodesWithoutOutgoing = useMemo(() => {
      const sourceNodeIds = new Set(edges.map((e) => e.source));
      return nodes.filter(
        (n) => !sourceNodeIds.has(n.id) && n.type !== 'logic'
      );
    }, [nodes, edges]);

    // Build simplified node list for the AI API
    const simplifiedNodes = useMemo(() =>
      nodes.map((n) => ({
        id: n.id,
        type: (n.data as { nodeType?: string })?.nodeType || n.type || 'action',
        label: (n.data as { label?: string })?.label || 'Unnamed',
        config: (n.data as { config?: Record<string, unknown> })?.config,
      })),
      [nodes]
    );

    const simplifiedEdges = useMemo(() =>
      edges.map((e) => ({ source: e.source, target: e.target })),
      [edges]
    );

    // Calculate screen positions for AddNodeButtons
    const viewport = getViewport();
    const addButtonPositions = useMemo(() => {
      return nodesWithoutOutgoing.map((node) => {
        // Convert flow position to screen position
        const screenPos = flowToScreenPosition({
          x: node.position.x + 90, // Center of node (~180px wide)
          y: node.position.y + 60, // Bottom of node (~50px tall)
        });

        // Get wrapper position to make coordinates relative
        const wrapperRect = reactFlowWrapper.current?.getBoundingClientRect();
        const relX = screenPos.x - (wrapperRect?.left || 0);
        const relY = screenPos.y - (wrapperRect?.top || 0);

        return {
          nodeId: node.id,
          left: relX,
          top: relY,
        };
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [nodesWithoutOutgoing, flowToScreenPosition, viewport.x, viewport.y, viewport.zoom]);

    return (
      <div
        ref={reactFlowWrapper}
        className="h-full w-full relative"
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
          onSelectionChange={onSelectionChange}
          onPaneClick={onPaneClick}
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

        {/* AddNodeButton overlay */}
        {workspaceId && addButtonPositions.map(({ nodeId, left, top }) => (
          <AddNodeButton
            key={nodeId}
            sourceNodeId={nodeId}
            workspaceId={workspaceId}
            nodes={simplifiedNodes}
            edges={simplifiedEdges}
            onAddNode={handleAddSuggestedNode}
            style={{
              left: `${left}px`,
              top: `${top}px`,
              transform: 'translateX(-50%)',
              pointerEvents: 'auto',
            }}
          />
        ))}
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
