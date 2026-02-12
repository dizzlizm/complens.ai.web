import { useState, useRef, useEffect } from 'react';
import { Plus, Mail, MessageSquare, Tag, Clock, Sparkles, GitBranch, Webhook, Filter, Target, PlayCircle, Loader2 } from 'lucide-react';
import { useSuggestNextStep, type WorkflowStepSuggestion } from '../../lib/hooks/useAI';

interface QuickNodeOption {
  type: string;
  nodeType: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}

const quickNodes: QuickNodeOption[] = [
  { type: 'action', nodeType: 'action_send_email', label: 'Send Email', icon: <Mail className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100' },
  { type: 'action', nodeType: 'action_send_sms', label: 'Send SMS', icon: <MessageSquare className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100' },
  { type: 'action', nodeType: 'action_wait', label: 'Wait', icon: <Clock className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100' },
  { type: 'action', nodeType: 'action_webhook', label: 'Call Webhook', icon: <Webhook className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100' },
  { type: 'action', nodeType: 'action_update_contact', label: 'Update Contact', icon: <Tag className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100' },
  { type: 'action', nodeType: 'action_run_workflow', label: 'Run Workflow', icon: <PlayCircle className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100' },
  { type: 'logic', nodeType: 'logic_branch', label: 'If/Else', icon: <GitBranch className="w-4 h-4" />, color: 'text-amber-600', bg: 'bg-amber-100' },
  { type: 'logic', nodeType: 'logic_filter', label: 'Filter', icon: <Filter className="w-4 h-4" />, color: 'text-amber-600', bg: 'bg-amber-100' },
  { type: 'logic', nodeType: 'logic_goal', label: 'Goal', icon: <Target className="w-4 h-4" />, color: 'text-amber-600', bg: 'bg-amber-100' },
  { type: 'ai', nodeType: 'ai_respond', label: 'AI Respond', icon: <Sparkles className="w-4 h-4" />, color: 'text-violet-600', bg: 'bg-violet-100' },
  { type: 'ai', nodeType: 'ai_decision', label: 'AI Decision', icon: <Sparkles className="w-4 h-4" />, color: 'text-violet-600', bg: 'bg-violet-100' },
  { type: 'ai', nodeType: 'ai_generate', label: 'AI Generate', icon: <Sparkles className="w-4 h-4" />, color: 'text-violet-600', bg: 'bg-violet-100' },
];

interface AddNodeButtonProps {
  sourceNodeId: string;
  workspaceId: string;
  nodes: Array<{ id: string; type: string; label: string; config?: Record<string, unknown> }>;
  edges: Array<{ source: string; target: string }>;
  onAddNode: (suggestion: { node_type: string; label: string; description: string; config: Record<string, unknown> }, sourceNodeId: string) => void;
  style?: React.CSSProperties;
}

export default function AddNodeButton({
  sourceNodeId,
  workspaceId,
  nodes,
  edges,
  onAddNode,
  style,
}: AddNodeButtonProps) {
  const [showPopover, setShowPopover] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<WorkflowStepSuggestion[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const suggestNextStep = useSuggestNextStep(workspaceId);

  // Fetch AI suggestions when popover opens
  useEffect(() => {
    if (!showPopover || !workspaceId) return;
    setAiSuggestions([]);
    suggestNextStep
      .mutateAsync({ nodes, edges, source_node_id: sourceNodeId })
      .then((suggestions) => setAiSuggestions(suggestions))
      .catch(() => {/* graceful fallback: just show quickNodes */});
  }, [showPopover]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close popover on outside click or Escape
  useEffect(() => {
    if (!showPopover) return;

    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as HTMLElement)) {
        setShowPopover(false);
      }
    }

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowPopover(false);
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [showPopover]);

  const handleSelect = (node: QuickNodeOption) => {
    setShowPopover(false);
    onAddNode(
      { node_type: node.nodeType, label: node.label, description: '', config: {} },
      sourceNodeId,
    );
  };

  return (
    <div className="absolute flex flex-col items-center" style={style}>
      {/* Connecting line */}
      <div className="w-px h-5 bg-gray-300" />

      {/* The + button */}
      <button
        onClick={() => setShowPopover(!showPopover)}
        className={`
          w-7 h-7 rounded-full flex items-center justify-center
          border-2 border-dashed transition-all duration-200
          ${showPopover
            ? 'border-indigo-400 bg-indigo-50 text-indigo-600'
            : 'border-gray-300 bg-white text-gray-400 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600'
          }
          shadow-sm hover:shadow-md
        `}
        title="Add next step"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>

      {/* Node picker popover */}
      {showPopover && (
        <div
          ref={popoverRef}
          className="absolute top-14 z-50 w-64 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden"
        >
          {/* AI Suggestions Section */}
          <div className="px-3 py-2 border-b border-gray-100 bg-purple-50/50">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-purple-500" />
              <span className="text-xs font-medium text-purple-700">AI Suggested</span>
            </div>
          </div>
          <div className="border-b border-gray-100">
            {suggestNextStep.isPending ? (
              <div className="flex items-center justify-center gap-2 py-3 text-purple-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span className="text-xs">Thinking...</span>
              </div>
            ) : aiSuggestions.length > 0 ? (
              aiSuggestions.map((suggestion, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setShowPopover(false);
                    onAddNode(suggestion, sourceNodeId);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-purple-50 transition-colors flex items-center gap-2.5"
                >
                  <div className="p-1 rounded bg-purple-100 shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-900 block truncate">{suggestion.label}</span>
                    {suggestion.description && (
                      <span className="text-xs text-gray-500 block truncate">{suggestion.description}</span>
                    )}
                  </div>
                </button>
              ))
            ) : (
              <div className="py-2.5 px-3 text-xs text-gray-400 text-center">No suggestions</div>
            )}
          </div>

          {/* Quick Nodes */}
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="text-xs font-medium text-gray-500">All steps</span>
          </div>
          <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
            {quickNodes.map((node) => (
              <button
                key={node.nodeType}
                onClick={() => handleSelect(node)}
                className="w-full px-3 py-2 text-left hover:bg-gray-50 transition-colors flex items-center gap-2.5"
              >
                <div className={`p-1 rounded ${node.bg} shrink-0`}>
                  <span className={node.color}>{node.icon}</span>
                </div>
                <span className="text-sm font-medium text-gray-900">{node.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
