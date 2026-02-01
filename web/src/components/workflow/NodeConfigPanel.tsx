import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Zap, Play, GitBranch, Sparkles, Loader2 } from 'lucide-react';
import { type Node } from '@xyflow/react';
import { useForms } from '../../lib/hooks/useForms';
import { usePages } from '../../lib/hooks/usePages';
import { useWorkflows } from '../../lib/hooks/useWorkflows';
import { useContacts } from '../../lib/hooks/useContacts';

interface NodeData {
  label: string;
  nodeType: string;
  config: Record<string, unknown>;
}

interface NodeConfigPanelProps {
  node: Node | null;
  workspaceId: string | undefined;
  onClose: () => void;
  onUpdate: (nodeId: string, data: Partial<NodeData>) => void;
}

// Debounce hook for smoother editing
function useDebouncedCallback<T extends (...args: Parameters<T>) => void>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return useCallback(
    ((...args: Parameters<T>) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(...args);
      }, delay);
    }) as T,
    [callback, delay]
  );
}

interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'dynamic_select';
  placeholder?: string;
  options?: { value: string; label: string }[];
  // For dynamic_select: which data source to use
  dataSource?: 'forms' | 'pages' | 'workflows' | 'tags' | 'contact_fields';
  // Optional helper text below the field
  helperText?: string;
}

// Standard contact fields for condition builders
const CONTACT_FIELDS = [
  { value: 'contact.email', label: 'Email' },
  { value: 'contact.phone', label: 'Phone' },
  { value: 'contact.first_name', label: 'First Name' },
  { value: 'contact.last_name', label: 'Last Name' },
  { value: 'contact.full_name', label: 'Full Name' },
  { value: 'contact.tags', label: 'Tags (contains)' },
  { value: 'contact.source', label: 'Source' },
  { value: 'contact.created_at', label: 'Created Date' },
];

// Config field definitions for each node type
const nodeConfigs: Record<string, { title: string; fields: FieldConfig[] }> = {
  // Triggers
  trigger_form_submitted: {
    title: 'Form Submitted Trigger',
    fields: [
      {
        key: 'formId',
        label: 'Select Form',
        type: 'dynamic_select',
        dataSource: 'forms',
        helperText: 'Workflow triggers when this form is submitted'
      },
    ],
  },
  trigger_tag_added: {
    title: 'Tag Added Trigger',
    fields: [
      {
        key: 'tagName',
        label: 'Select Tag',
        type: 'dynamic_select',
        dataSource: 'tags',
        helperText: 'Triggers when this tag is added to a contact'
      },
    ],
  },
  trigger_chat_started: {
    title: 'Chat Started Trigger',
    fields: [
      {
        key: 'pageId',
        label: 'On Page (optional)',
        type: 'dynamic_select',
        dataSource: 'pages',
        helperText: 'Trigger only on this page, or leave empty for all pages'
      },
    ],
  },
  trigger_chat_message: {
    title: 'Chat Message Trigger',
    fields: [
      {
        key: 'pageId',
        label: 'On Page (optional)',
        type: 'dynamic_select',
        dataSource: 'pages',
        helperText: 'Filter to specific page'
      },
      {
        key: 'chat_keyword',
        label: 'Keyword Filter (optional)',
        type: 'text',
        placeholder: 'e.g., pricing, demo, help',
        helperText: 'Only trigger if message contains this keyword'
      },
    ],
  },
  trigger_page_visit: {
    title: 'Page Visit Trigger',
    fields: [
      {
        key: 'pageId',
        label: 'Select Page',
        type: 'dynamic_select',
        dataSource: 'pages',
        helperText: 'Triggers when visitor lands on this page'
      },
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
      { key: 'schedule', label: 'Cron Expression', type: 'text', placeholder: '0 9 * * *', helperText: 'e.g., "0 9 * * *" for 9 AM daily' },
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
      {
        key: 'addTags',
        label: 'Add Tags',
        type: 'dynamic_select',
        dataSource: 'tags',
        helperText: 'Select existing tag or type new one'
      },
      {
        key: 'removeTags',
        label: 'Remove Tags',
        type: 'dynamic_select',
        dataSource: 'tags'
      },
      { key: 'setFields', label: 'Set Fields (JSON)', type: 'textarea', placeholder: '{"custom_field": "value"}' },
    ],
  },
  action_run_workflow: {
    title: 'Run Workflow',
    fields: [
      {
        key: 'workflowId',
        label: 'Select Workflow',
        type: 'dynamic_select',
        dataSource: 'workflows',
        helperText: 'The workflow to trigger'
      },
      { key: 'passData', label: 'Pass Contact Data', type: 'checkbox' },
    ],
  },

  // Logic
  logic_branch: {
    title: 'If/Else Branch',
    fields: [
      {
        key: 'field',
        label: 'Field to Check',
        type: 'dynamic_select',
        dataSource: 'contact_fields'
      },
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
      {
        key: 'field',
        label: 'Field to Check',
        type: 'dynamic_select',
        dataSource: 'contact_fields'
      },
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
      {
        key: 'field',
        label: 'Field to Check',
        type: 'dynamic_select',
        dataSource: 'contact_fields'
      },
      { key: 'value', label: 'Expected Value', type: 'text', placeholder: 'true' },
    ],
  },

  // AI
  ai_respond: {
    title: 'AI Respond',
    fields: [
      { key: 'prompt', label: 'System Prompt', type: 'textarea', placeholder: 'You are a helpful assistant...' },
      { key: 'channel', label: 'Response Channel', type: 'select', options: [
        { value: 'same_channel', label: 'Same as trigger' },
        { value: 'email', label: 'Email' },
        { value: 'sms', label: 'SMS' },
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

interface ConfigFieldProps {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  dynamicOptions?: { value: string; label: string }[];
  isLoading?: boolean;
}

function ConfigField({
  field,
  value,
  onChange,
  dynamicOptions,
  isLoading,
}: ConfigFieldProps) {
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
          {field.helperText && (
            <p className="mt-1 text-xs text-gray-500">{field.helperText}</p>
          )}
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
          {field.helperText && (
            <p className="mt-1 text-xs text-gray-500">{field.helperText}</p>
          )}
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
          {field.helperText && (
            <p className="mt-1 text-xs text-gray-500">{field.helperText}</p>
          )}
        </div>
      );
    case 'dynamic_select':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
          <div className="relative">
            <select
              value={(value as string) || ''}
              onChange={(e) => onChange(e.target.value)}
              className="input"
              disabled={isLoading}
            >
              <option value="">{isLoading ? 'Loading...' : 'Select...'}</option>
              {dynamicOptions?.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {isLoading && (
              <div className="absolute right-8 top-1/2 -translate-y-1/2">
                <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
              </div>
            )}
          </div>
          {field.helperText && (
            <p className="mt-1 text-xs text-gray-500">{field.helperText}</p>
          )}
          {!isLoading && dynamicOptions?.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">No items found. Create one first.</p>
          )}
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
          {field.helperText && (
            <p className="mt-1 text-xs text-gray-500">{field.helperText}</p>
          )}
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

export default function NodeConfigPanel({ node, workspaceId, onClose, onUpdate }: NodeConfigPanelProps) {
  // Local state for smooth editing
  const [localLabel, setLocalLabel] = useState('');
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});
  const prevNodeIdRef = useRef<string | null>(null);

  // Fetch workspace data for dynamic dropdowns
  const { data: forms, isLoading: isLoadingForms } = useForms(workspaceId);
  const { data: pages, isLoading: isLoadingPages } = usePages(workspaceId);
  const { data: workflows, isLoading: isLoadingWorkflows } = useWorkflows(workspaceId || '');
  const { data: contactsData, isLoading: isLoadingContacts } = useContacts(workspaceId || '', { limit: 100 });

  // Extract unique tags from contacts
  const allTags = useMemo(() => {
    if (!contactsData?.contacts) return [];
    const tagSet = new Set<string>();
    contactsData.contacts.forEach(contact => {
      contact.tags?.forEach(tag => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [contactsData]);

  // Build dynamic options based on data source
  const getDynamicOptions = useCallback((dataSource: string | undefined): { options: { value: string; label: string }[], isLoading: boolean } => {
    switch (dataSource) {
      case 'forms':
        return {
          options: forms?.map(f => ({ value: f.id, label: f.name })) || [],
          isLoading: isLoadingForms,
        };
      case 'pages':
        return {
          options: pages?.map(p => ({ value: p.id, label: p.name })) || [],
          isLoading: isLoadingPages,
        };
      case 'workflows':
        return {
          options: workflows?.map(w => ({ value: w.id, label: w.name })) || [],
          isLoading: isLoadingWorkflows,
        };
      case 'tags':
        return {
          options: allTags.map(t => ({ value: t, label: t })),
          isLoading: isLoadingContacts,
        };
      case 'contact_fields':
        return {
          options: CONTACT_FIELDS,
          isLoading: false,
        };
      default:
        return { options: [], isLoading: false };
    }
  }, [forms, pages, workflows, allTags, isLoadingForms, isLoadingPages, isLoadingWorkflows, isLoadingContacts]);

  // Initialize local state when node changes
  useEffect(() => {
    if (node && node.id !== prevNodeIdRef.current) {
      const nodeData = node.data as unknown as NodeData;
      setLocalLabel(nodeData.label || '');
      setLocalConfig(nodeData.config || {});
      prevNodeIdRef.current = node.id;
    }
  }, [node]);

  // Debounced update to canvas
  const debouncedUpdate = useDebouncedCallback(
    (nodeId: string, data: Partial<NodeData>) => {
      onUpdate(nodeId, data);
    },
    150
  );

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
        <p className="text-sm text-gray-500">No configuration available for this node type: {nodeType}</p>
      </div>
    );
  }

  const handleFieldChange = (key: string, value: unknown) => {
    const newConfig = { ...localConfig, [key]: value };
    setLocalConfig(newConfig);
    debouncedUpdate(node.id, { config: newConfig });
  };

  const handleLabelChange = (label: string) => {
    setLocalLabel(label);
    debouncedUpdate(node.id, { label });
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
            value={localLabel}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="input"
            placeholder="Node name"
          />
        </div>

        <hr className="border-gray-200" />

        {/* Type-specific fields */}
        {config.fields.map((field) => {
          const dynamicData = field.type === 'dynamic_select'
            ? getDynamicOptions(field.dataSource)
            : { options: [], isLoading: false };

          return (
            <ConfigField
              key={field.key}
              field={field}
              value={localConfig[field.key]}
              onChange={(value) => handleFieldChange(field.key, value)}
              dynamicOptions={field.type === 'dynamic_select' ? dynamicData.options : undefined}
              isLoading={field.type === 'dynamic_select' ? dynamicData.isLoading : undefined}
            />
          );
        })}
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
