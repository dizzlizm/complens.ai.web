import { X, Loader2, GitBranch, Zap, Play, Sparkles, ArrowRight } from 'lucide-react';
import type { WorkflowTemplate } from '../../data/workflowTemplates';

interface TemplatePreviewModalProps {
  template: WorkflowTemplate;
  onUse: (template: WorkflowTemplate) => void;
  onClose: () => void;
  isCreating: boolean;
}

function getNodeTypeIcon(type: string) {
  if (type.startsWith('trigger_')) return <Zap className="w-4 h-4 text-green-600" />;
  if (type.startsWith('action_')) return <Play className="w-4 h-4 text-blue-600" />;
  if (type.startsWith('logic_')) return <GitBranch className="w-4 h-4 text-amber-600" />;
  if (type.startsWith('ai_')) return <Sparkles className="w-4 h-4 text-violet-600" />;
  return null;
}

function formatNodeType(type: string): string {
  return type
    .replace(/^(trigger_|action_|logic_|ai_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

export default function TemplatePreviewModal({
  template,
  onUse,
  onClose,
  isCreating,
}: TemplatePreviewModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{template.name}</h2>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium mt-1 ${
              template.category === 'lead-gen'
                ? 'bg-green-100 text-green-800'
                : template.category === 'ai'
                ? 'bg-violet-100 text-violet-800'
                : 'bg-blue-100 text-blue-800'
            }`}>
              {template.category === 'lead-gen' ? 'Lead Gen' : template.category === 'ai' ? 'AI' : 'Communication'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <p className="text-gray-600">{template.description}</p>

          {/* Node flow */}
          <div>
            <h3 className="text-sm font-medium text-gray-900 mb-3">Workflow Steps</h3>
            <div className="space-y-2">
              {template.nodes.map((node, index) => (
                <div key={node.id}>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    {getNodeTypeIcon(node.data.nodeType)}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{node.data.label}</p>
                      <p className="text-xs text-gray-500">{formatNodeType(node.data.nodeType)}</p>
                    </div>
                    <span className="text-xs text-gray-400">#{index + 1}</span>
                  </div>
                  {index < template.nodes.length - 1 && (
                    <div className="flex justify-center py-1">
                      <ArrowRight className="w-4 h-4 text-gray-300 rotate-90" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button
            onClick={() => onUse(template)}
            disabled={isCreating}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <GitBranch className="w-4 h-4" />
            )}
            {isCreating ? 'Creating...' : 'Use Template'}
          </button>
        </div>
      </div>
    </div>
  );
}
