import { useState } from 'react';
import { GitBranch, Sparkles, Mail, Clock, Bell, Tag } from 'lucide-react';
import { workflowTemplates, TEMPLATE_CATEGORIES, type WorkflowTemplate } from '../../data/workflowTemplates';
import TemplatePreviewModal from './TemplatePreviewModal';

interface TemplateLibraryProps {
  onUseTemplate: (template: WorkflowTemplate) => void;
  isCreating: boolean;
}

const iconMap: Record<string, React.ReactNode> = {
  mail: <Mail className="w-6 h-6" />,
  sparkles: <Sparkles className="w-6 h-6" />,
  clock: <Clock className="w-6 h-6" />,
  bell: <Bell className="w-6 h-6" />,
  tag: <Tag className="w-6 h-6" />,
};

const categoryColors: Record<string, string> = {
  'lead-gen': 'bg-green-100 text-green-800',
  communication: 'bg-blue-100 text-blue-800',
  ai: 'bg-violet-100 text-violet-800',
};

export default function TemplateLibrary({ onUseTemplate, isCreating }: TemplateLibraryProps) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [previewTemplate, setPreviewTemplate] = useState<WorkflowTemplate | null>(null);

  const filteredTemplates = activeCategory === 'all'
    ? workflowTemplates
    : workflowTemplates.filter(t => t.category === activeCategory);

  return (
    <div className="space-y-4">
      {/* Category filter */}
      <div className="flex gap-2">
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map((template) => (
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
                    {template.category === 'lead-gen' ? 'Lead Gen' : template.category === 'ai' ? 'AI' : 'Communication'}
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
