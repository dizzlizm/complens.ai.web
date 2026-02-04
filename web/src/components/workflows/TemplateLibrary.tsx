import { useState } from 'react';
import { GitBranch, Sparkles, Mail, Clock, Bell, Tag, Webhook, CreditCard, Trash2, User } from 'lucide-react';
import { workflowTemplates, TEMPLATE_CATEGORIES, type WorkflowTemplate } from '../../data/workflowTemplates';
import { useWorkflowTemplates, useDeleteWorkflowTemplate, type CustomWorkflowTemplate } from '../../lib/hooks/useWorkflowTemplates';
import TemplatePreviewModal from './TemplatePreviewModal';

interface TemplateLibraryProps {
  onUseTemplate: (template: WorkflowTemplate) => void;
  isCreating: boolean;
  workspaceId?: string;
}

const iconMap: Record<string, React.ReactNode> = {
  mail: <Mail className="w-6 h-6" />,
  sparkles: <Sparkles className="w-6 h-6" />,
  clock: <Clock className="w-6 h-6" />,
  bell: <Bell className="w-6 h-6" />,
  tag: <Tag className="w-6 h-6" />,
  webhook: <Webhook className="w-6 h-6" />,
  'credit-card': <CreditCard className="w-6 h-6" />,
  'git-branch': <GitBranch className="w-6 h-6" />,
};

const categoryColors: Record<string, string> = {
  'lead-gen': 'bg-green-100 text-green-800',
  communication: 'bg-blue-100 text-blue-800',
  ai: 'bg-violet-100 text-violet-800',
  automation: 'bg-orange-100 text-orange-800',
  analytics: 'bg-cyan-100 text-cyan-800',
};

const categoryLabels: Record<string, string> = {
  'lead-gen': 'Lead Gen',
  communication: 'Communication',
  ai: 'AI',
  automation: 'Automation',
  analytics: 'Analytics',
};

function customToWorkflowTemplate(t: CustomWorkflowTemplate): WorkflowTemplate {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category as WorkflowTemplate['category'],
    icon: t.icon,
    nodes: t.nodes as unknown as WorkflowTemplate['nodes'],
    edges: t.edges as unknown as WorkflowTemplate['edges'],
  };
}

export default function TemplateLibrary({ onUseTemplate, isCreating, workspaceId }: TemplateLibraryProps) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [activeTab, setActiveTab] = useState<'built-in' | 'my-templates'>('built-in');
  const [previewTemplate, setPreviewTemplate] = useState<WorkflowTemplate | null>(null);

  const { data: customTemplates = [] } = useWorkflowTemplates(workspaceId);
  const deleteTemplate = useDeleteWorkflowTemplate(workspaceId || '');

  const builtInFiltered = activeCategory === 'all'
    ? workflowTemplates
    : workflowTemplates.filter(t => t.category === activeCategory);

  const customFiltered = activeCategory === 'all'
    ? customTemplates
    : customTemplates.filter(t => t.category === activeCategory);

  const handleDeleteCustom = (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();
    if (confirm('Delete this template?')) {
      deleteTemplate.mutate(templateId);
    }
  };

  return (
    <div className="space-y-4">
      {/* Tab switcher */}
      <div className="flex gap-4 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('built-in')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'built-in'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Built-in Templates
        </button>
        <button
          onClick={() => setActiveTab('my-templates')}
          className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'my-templates'
              ? 'border-primary-600 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          My Templates {customTemplates.length > 0 && `(${customTemplates.length})`}
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeCategory === cat.id
                ? 'bg-primary-100 text-primary-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Template grid */}
      {activeTab === 'built-in' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {builtInFiltered.map((template) => (
            <button
              key={template.id}
              onClick={() => setPreviewTemplate(template)}
              className="card text-left hover:border-primary-300 hover:shadow-md transition-all p-4"
            >
              <div className="flex items-start gap-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  template.category === 'lead-gen'
                    ? 'bg-green-50 text-green-600'
                    : template.category === 'ai'
                    ? 'bg-violet-50 text-violet-600'
                    : template.category === 'automation'
                    ? 'bg-orange-50 text-orange-600'
                    : template.category === 'analytics'
                    ? 'bg-cyan-50 text-cyan-600'
                    : 'bg-blue-50 text-blue-600'
                }`}>
                  {iconMap[template.icon] || <GitBranch className="w-6 h-6" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 mb-1">{template.name}</h3>
                  <p className="text-sm text-gray-500 line-clamp-2">{template.description}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      categoryColors[template.category] || 'bg-gray-100 text-gray-800'
                    }`}>
                      {categoryLabels[template.category] || template.category}
                    </span>
                    <span className="text-xs text-gray-400">
                      {template.nodes.length} nodes
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {activeTab === 'my-templates' && (
        <>
          {customFiltered.length === 0 ? (
            <div className="text-center py-12">
              <User className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No custom templates yet</p>
              <p className="text-sm text-gray-400 mt-1">
                Save any workflow as a template from the workflow editor
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {customFiltered.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setPreviewTemplate(customToWorkflowTemplate(template))}
                  className="card text-left hover:border-primary-300 hover:shadow-md transition-all p-4 relative group"
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      template.category === 'lead-gen'
                        ? 'bg-green-50 text-green-600'
                        : template.category === 'ai'
                        ? 'bg-violet-50 text-violet-600'
                        : template.category === 'automation'
                        ? 'bg-orange-50 text-orange-600'
                        : 'bg-blue-50 text-blue-600'
                    }`}>
                      {iconMap[template.icon] || <GitBranch className="w-6 h-6" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 mb-1">{template.name}</h3>
                      <p className="text-sm text-gray-500 line-clamp-2">{template.description}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          categoryColors[template.category] || 'bg-gray-100 text-gray-800'
                        }`}>
                          {categoryLabels[template.category] || template.category}
                        </span>
                        <span className="text-xs text-gray-400">
                          {template.nodes.length} nodes
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteCustom(e, template.id)}
                    className="absolute top-2 right-2 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete template"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Preview modal */}
      {previewTemplate && (
        <TemplatePreviewModal
          template={previewTemplate}
          onUse={(t) => {
            onUseTemplate(t);
            setPreviewTemplate(null);
          }}
          onClose={() => setPreviewTemplate(null)}
          isCreating={isCreating}
        />
      )}
    </div>
  );
}
