import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Plus, Mail, MessageSquare, Tag, Clock, Sparkles, GitBranch, Webhook, Brain, BarChart3 } from 'lucide-react';
import { useSuggestNextStep, type WorkflowStepSuggestion } from '../../lib/hooks/useAI';

// Map node types to icons and colors
function getNodeMeta(nodeType: string): { icon: React.ReactNode; color: string; bg: string } {
  if (nodeType.startsWith('action_send_email')) {
    return { icon: <Mail className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100' };
  }
  if (nodeType.startsWith('action_send_sms')) {
    return { icon: <MessageSquare className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100' };
  }
  if (nodeType.startsWith('action_update_contact')) {
    return { icon: <Tag className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100' };
  }
  if (nodeType.startsWith('action_wait')) {
    return { icon: <Clock className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100' };
  }
  if (nodeType.startsWith('action_webhook')) {
    return { icon: <Webhook className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100' };
  }
  if (nodeType.startsWith('action_ai_respond')) {
    return { icon: <Sparkles className="w-4 h-4" />, color: 'text-violet-600', bg: 'bg-violet-100' };
  }
  if (nodeType.startsWith('ai_')) {
    return { icon: <Brain className="w-4 h-4" />, color: 'text-violet-600', bg: 'bg-violet-100' };
  }
  if (nodeType.startsWith('logic_')) {
    return { icon: <GitBranch className="w-4 h-4" />, color: 'text-amber-600', bg: 'bg-amber-100' };
  }
  if (nodeType.startsWith('action_')) {
    return { icon: <BarChart3 className="w-4 h-4" />, color: 'text-blue-600', bg: 'bg-blue-100' };
  }
  return { icon: <Plus className="w-4 h-4" />, color: 'text-gray-600', bg: 'bg-gray-100' };
}

interface AddNodeButtonProps {
  sourceNodeId: string;
  workspaceId: string;
  nodes: Array<{ id: string; type: string; label: string; config?: Record<string, unknown> }>;
  edges: Array<{ source: string; target: string }>;
  onAddNode: (suggestion: WorkflowStepSuggestion, sourceNodeId: string) => void;
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
  const [suggestions, setSuggestions] = useState<WorkflowStepSuggestion[]>([]);
  const popoverRef = useRef<HTMLDivElement>(null);
  const suggestMutation = useSuggestNextStep(workspaceId);

  const handleClick = useCallback(async () => {
    if (showPopover) {
      setShowPopover(false);
      return;
    }

    setShowPopover(true);
    setSuggestions([]);

    try {
      const result = await suggestMutation.mutateAsync({
        nodes,
        edges,
        source_node_id: sourceNodeId,
      });
      setSuggestions(result);
    } catch {
      // Keep popover open with empty state to show error
    }
  }, [showPopover, nodes, edges, sourceNodeId, suggestMutation]);

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

  const handleSelectSuggestion = (suggestion: WorkflowStepSuggestion) => {
    setShowPopover(false);
    onAddNode(suggestion, sourceNodeId);
  };

  return (
    <div className="absolute flex flex-col items-center" style={style}>
      {/* Connecting line */}
      <div className="w-px h-5 bg-gray-300" />

      {/* The + button */}
      <button
        onClick={handleClick}
        className={`
          w-7 h-7 rounded-full flex items-center justify-center
          border-2 border-dashed transition-all duration-200
          ${showPopover
            ? 'border-indigo-400 bg-indigo-50 text-indigo-600'
            : 'border-gray-300 bg-white text-gray-400 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600 animate-pulse hover:animate-none'
          }
          shadow-sm hover:shadow-md
        `}
        title="Add next step (AI-powered)"
      >
        {suggestMutation.isPending ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Plus className="w-3.5 h-3.5" />
        )}
      </button>

      {/* Suggestion popover */}
      {showPopover && (
        <div
          ref={popoverRef}
          className="absolute top-14 z-50 w-72 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden"
        >
          <div className="px-3 py-2 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-gray-100">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              <span className="text-xs font-medium text-indigo-700">AI Suggestions</span>
            </div>
          </div>

          {suggestMutation.isPending && (
            <div className="px-4 py-6 flex flex-col items-center gap-2">
              <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
              <span className="text-xs text-gray-500">Thinking...</span>
            </div>
          )}

          {suggestMutation.isError && (
            <div className="px-4 py-4 text-center">
              <p className="text-xs text-red-500 mb-2">Failed to get suggestions</p>
              <button
                onClick={handleClick}
                className="text-xs text-indigo-600 hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {!suggestMutation.isPending && !suggestMutation.isError && suggestions.length === 0 && (
            <div className="px-4 py-4 text-center">
              <p className="text-xs text-gray-500">No suggestions available</p>
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="divide-y divide-gray-50">
              {suggestions.map((suggestion, idx) => {
                const meta = getNodeMeta(suggestion.node_type);
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className="w-full px-3 py-2.5 text-left hover:bg-gray-50 transition-colors flex items-start gap-2.5"
                  >
                    <div className={`p-1.5 rounded-lg ${meta.bg} mt-0.5 shrink-0`}>
                      <span className={meta.color}>{meta.icon}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {suggestion.label}
                      </div>
                      <div className="text-xs text-gray-500 line-clamp-2">
                        {suggestion.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
