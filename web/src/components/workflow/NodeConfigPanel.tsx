import { X, Zap, Play, GitBranch, Sparkles } from 'lucide-react';
import { type Node } from '@xyflow/react';

interface NodeData {
  label: string;
  nodeType: string;
  config: Record<string, unknown>;
}

interface NodeConfigPanelProps {
  node: Node | null;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Partial<NodeData>) => void;
}

// Config field definitions for each node type
const nodeConfigs: Record<string, { title: string; fields: FieldConfig[] }> = {
  // Triggers
  trigger_form_submitted: {
    title: 'Form Submitted Trigger',
    fields: [
      { key: 'formId', label: 'Form ID', type: 'text', placeholder: 'Enter form ID' },
      { key: 'formName', label: 'Form Name', type: 'text', placeholder: 'Optional form name filter' },
    ],
  },
  trigger_tag_added: {
    title: 'Tag Added Trigger',
    fields: [
      { key: 'tagName', label: 'Tag Name', type: 'text', placeholder: 'Tag to watch for' },
    ],
  },
  trigger_webhook: {
    title: 'Webhook Trigger',
    fields: [
      { key: 'webhookPath', label: 'Webhook Path', type: 'text', placeholder: '/my-webhook' },
      { key: 'secret', label: 'Secret (optional)', type: 'text', placeholder: 'HMAC secret for validation' },
    ],
  },
  trigger_schedule: {
    title: 'Schedule Trigger',
    fields: [
      { key: 'schedule', label: 'Cron Expression', type: 'text', placeholder: '0 9 * * *' },
      { key: 'timezone', label: 'Timezone', type: 'select', options: [
        { value: 'UTC', label: 'UTC' },
        { value: 'America/New_York', label: 'Eastern Time' },
        { value: 'America/Chicago', label: 'Central Time' },
        { value: 'America/Denver', label: 'Mountain Time' },
        { value: 'America/Los_Angeles', label: 'Pacific Time' },
      ]},
    ],
  },

  // Actions
  action_send_email: {
    title: 'Send Email',
    fields: [
      { key: 'to', label: 'To', type: 'text', placeholder: '{{contact.email}}' },
      { key: 'subject', label: 'Subject', type: 'text', placeholder: 'Email subject line' },
      { key: 'body', label: 'Body', type: 'textarea', placeholder: 'Email body content...\n\nUse {{contact.name}} for personalization' },
      { key: 'fromName', label: 'From Name', type: 'text', placeholder: 'Your Company' },
    ],
  },
  action_send_sms: {
    title: 'Send SMS',
    fields: [
      { key: 'to', label: 'To', type: 'text', placeholder: '{{contact.phone}}' },
      { key: 'message', label: 'Message', type: 'textarea', placeholder: 'SMS message content (160 chars recommended)' },
    ],
  },
  action_wait: {
    title: 'Wait',
    fields: [
      { key: 'duration', label: 'Duration', type: 'number', placeholder: '1' },
      { key: 'unit', label: 'Unit', type: 'select', options: [
        { value: 'minutes', label: 'Minutes' },
        { value: 'hours', label: 'Hours' },
        { value: 'days', label: 'Days' },
      ]},
    ],
  },
  action_webhook: {
    title: 'Call Webhook',
    fields: [
      { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/webhook' },
      { key: 'method', label: 'Method', type: 'select', options: [
        { value: 'POST', label: 'POST' },
        { value: 'GET', label: 'GET' },
        { value: 'PUT', label: 'PUT' },
        { value: 'PATCH', label: 'PATCH' },
      ]},
      { key: 'headers', label: 'Headers (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer token"}' },
      { key: 'body', label: 'Body (JSON)', type: 'textarea', placeholder: '{"contact_id": "{{contact.id}}"}' },
    ],
  },
  action_update_contact: {
    title: 'Update Contact',
    fields: [
      { key: 'addTags', label: 'Add Tags', type: 'text', placeholder: 'tag1, tag2' },
      { key: 'removeTags', label: 'Remove Tags', type: 'text', placeholder: 'tag3, tag4' },
      { key: 'setFields', label: 'Set Fields (JSON)', type: 'textarea', placeholder: '{"custom_field": "value"}' },
    ],
  },
  action_run_workflow: {
    title: 'Run Workflow',
    fields: [
      { key: 'workflowId', label: 'Workflow ID', type: 'text', placeholder: 'Target workflow ID' },
      { key: 'passData', label: 'Pass Contact Data', type: 'checkbox' },
    ],
  },

  // Logic
  logic_branch: {
    title: 'If/Else Branch',
    fields: [
      { key: 'field', label: 'Field to Check', type: 'text', placeholder: 'contact.tags' },
      { key: 'operator', label: 'Operator', type: 'select', options: [
        { value: 'equals', label: 'Equals' },
        { value: 'not_equals', label: 'Not Equals' },
        { value: 'contains', label: 'Contains' },
        { value: 'not_contains', label: 'Does Not Contain' },
        { value: 'greater_than', label: 'Greater Than' },
        { value: 'less_than', label: 'Less Than' },
        { value: 'is_empty', label: 'Is Empty' },
        { value: 'is_not_empty', label: 'Is Not Empty' },
      ]},
      { key: 'value', label: 'Value', type: 'text', placeholder: 'Value to compare' },
    ],
  },
  logic_filter: {
    title: 'Filter',
    fields: [
      { key: 'field', label: 'Field to Check', type: 'text', placeholder: 'contact.email' },
      { key: 'operator', label: 'Operator', type: 'select', options: [
        { value: 'equals', label: 'Equals' },
        { value: 'not_equals', label: 'Not Equals' },
        { value: 'contains', label: 'Contains' },
        { value: 'not_contains', label: 'Does Not Contain' },
        { value: 'is_empty', label: 'Is Empty' },
        { value: 'is_not_empty', label: 'Is Not Empty' },
      ]},
      { key: 'value', label: 'Value', type: 'text', placeholder: 'Value to match' },
    ],
  },
  logic_goal: {
    title: 'Goal',
    fields: [
      { key: 'goalName', label: 'Goal Name', type: 'text', placeholder: 'e.g., Purchased' },
      { key: 'field', label: 'Field to Check', type: 'text', placeholder: 'contact.has_purchased' },
      { key: 'value', label: 'Expected Value', type: 'text', placeholder: 'true' },
    ],
  },

  // AI
  ai_respond: {
    title: 'AI Respond',
    fields: [
      { key: 'prompt', label: 'System Prompt', type: 'textarea', placeholder: 'You are a helpful assistant...' },
      { key: 'channel', label: 'Response Channel', type: 'select', options: [
        { value: 'email', label: 'Email' },
        { value: 'sms', label: 'SMS' },
        { value: 'both', label: 'Both' },
      ]},
      { key: 'maxTokens', label: 'Max Tokens', type: 'number', placeholder: '500' },
    ],
  },
  ai_decision: {
    title: 'AI Decision',
    fields: [
      { key: 'prompt', label: 'Decision Prompt', type: 'textarea', placeholder: 'Based on the contact data, decide which path to take...' },
      { key: 'options', label: 'Options (comma-separated)', type: 'text', placeholder: 'sales, support, marketing' },
    ],
  },
  ai_generate: {
    title: 'AI Generate',
    fields: [
      { key: 'prompt', label: 'Generation Prompt', type: 'textarea', placeholder: 'Generate a personalized message for {{contact.name}}...' },
      { key: 'outputVariable', label: 'Output Variable', type: 'text', placeholder: 'generated_content' },
      { key: 'maxTokens', label: 'Max Tokens', type: 'number', placeholder: '1000' },
    ],
  },
};

interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
  placeholder?: string;
  options?: { value: string; label: string }[];
}

function ConfigField({
  field,
  value,
  onChange,
}: {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  switch (field.type) {
    case 'textarea':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
          <textarea
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="input min-h-[100px] resize-y"
            rows={4}
          />
        </div>
      );
    case 'number':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
          <input
            type="number"
            value={(value as number) || ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
            placeholder={field.placeholder}
            className="input"
          />
        </div>
      );
    case 'select':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
          <select
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            className="input"
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      );
    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <label className="text-sm font-medium text-gray-700">{field.label}</label>
        </div>
      );
    default:
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
          <input
            type="text"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="input"
          />
        </div>
      );
  }
}

function getNodeIcon(type: string) {
  switch (type) {
    case 'trigger': return <Zap className="w-5 h-5 text-green-600" />;
    case 'action': return <Play className="w-5 h-5 text-blue-600" />;
    case 'logic': return <GitBranch className="w-5 h-5 text-amber-600" />;
    case 'ai': return <Sparkles className="w-5 h-5 text-violet-600" />;
    default: return null;
  }
}

function getNodeColor(type: string) {
  switch (type) {
    case 'trigger': return 'border-green-500';
    case 'action': return 'border-blue-500';
    case 'logic': return 'border-amber-500';
    case 'ai': return 'border-violet-500';
    default: return 'border-gray-500';
  }
}

export default function NodeConfigPanel({ node, onClose, onUpdate }: NodeConfigPanelProps) {
  if (!node) return null;

  const nodeData = node.data as unknown as NodeData;
  const nodeType = nodeData.nodeType;
  const config = nodeConfigs[nodeType];

  if (!config) {
    return (
      <div className="w-80 bg-white border-l border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">Node Configuration</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <p className="text-sm text-gray-500">No configuration available for this node type.</p>
      </div>
    );
  }

  const handleFieldChange = (key: string, value: unknown) => {
    onUpdate(node.id, {
      config: {
        ...nodeData.config,
        [key]: value,
      },
    });
  };

  const handleLabelChange = (label: string) => {
    onUpdate(node.id, { label });
  };

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className={`p-4 border-b border-gray-200 border-l-4 ${getNodeColor(node.type || '')}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getNodeIcon(node.type || '')}
            <h3 className="font-semibold text-gray-900">{config.title}</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Config fields */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Node label */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Node Label</label>
          <input
            type="text"
            value={nodeData.label}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="input"
            placeholder="Node name"
          />
        </div>

        <hr className="border-gray-200" />

        {/* Type-specific fields */}
        {config.fields.map((field) => (
          <ConfigField
            key={field.key}
            field={field}
            value={nodeData.config[field.key]}
            onChange={(value) => handleFieldChange(field.key, value)}
          />
        ))}
      </div>

      {/* Footer hint */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500">
          Use <code className="bg-gray-200 px-1 rounded">{'{{contact.field}}'}</code> for dynamic values
        </p>
      </div>
    </div>
  );
}
