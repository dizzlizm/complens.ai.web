import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Zap, Play, GitBranch, Sparkles, Loader2, ChevronDown, Variable, Plus, Trash2, FileText, Eye, Settings, Wand2, Copy, Check } from 'lucide-react';
import { type Node, useReactFlow } from '@xyflow/react';
import { useAutofillNode } from '../../lib/hooks/useAI';
import { useForms, usePageForms } from '../../lib/hooks/useForms';
import { usePages, usePage } from '../../lib/hooks/usePages';
import { useWorkflows } from '../../lib/hooks/useWorkflows';
import { useContacts } from '../../lib/hooks/useContacts';
import { useListDomains } from '../../lib/hooks/useEmailWarmup';
import EmailPreview from '../workflow-builder/EmailPreview';

interface NodeData {
  label: string;
  nodeType: string;
  config: Record<string, unknown>;
}

interface NodeConfigPanelProps {
  node: Node | null;
  workspaceId: string | undefined;
  pageId?: string; // When provided, filters forms/pages to this page's context
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
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'dynamic_select' | 'multi_select' | 'tag_input' | 'conditions';
  placeholder?: string;
  options?: { value: string; label: string }[];
  dataSource?: 'forms' | 'pages' | 'workflows' | 'tags' | 'contact_fields' | 'domains';
  helperText?: string;
  defaultValue?: unknown;
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
  { value: 'variables.', label: 'Workflow Variable...' },
  { value: 'trigger.', label: 'Trigger Data...' },
];

// Variables available for insertion into text fields
const INSERTABLE_VARIABLES = [
  { category: 'Contact', items: [
    { value: '{{contact.email}}', label: 'Email Address' },
    { value: '{{contact.phone}}', label: 'Phone Number' },
    { value: '{{contact.first_name}}', label: 'First Name' },
    { value: '{{contact.last_name}}', label: 'Last Name' },
    { value: '{{contact.full_name}}', label: 'Full Name' },
  ]},
  { category: 'Form Data', items: [
    { value: '{{trigger_data.form_data.email}}', label: 'Submitted Email' },
    { value: '{{trigger_data.form_data.message}}', label: 'Submitted Message' },
    { value: '{{trigger_data.form_data}}', label: 'All Form Data' },
  ]},
  { category: 'Deal', items: [
    { value: '{{deal.title}}', label: 'Deal Title' },
    { value: '{{deal.value}}', label: 'Deal Value' },
    { value: '{{deal.stage}}', label: 'Deal Stage' },
    { value: '{{deal.priority}}', label: 'Deal Priority' },
    { value: '{{deal.contact_name}}', label: 'Deal Contact' },
    { value: '{{deal.expected_close_date}}', label: 'Expected Close' },
  ]},
  { category: 'Workflow', items: [
    { value: '{{owner.email}}', label: 'Owner Email' },
    { value: '{{workspace.name}}', label: 'Workspace Name' },
    { value: '{{variables.ai_response}}', label: 'Last AI Response' },
  ]},
];

// Variable picker dropdown component
function VariablePicker({ onInsert }: { onInsert: (variable: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as HTMLElement)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition-colors"
        title="Insert dynamic value"
      >
        <Variable className="w-3 h-3" />
        Insert
        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-1 max-h-64 overflow-y-auto">
          {INSERTABLE_VARIABLES.map((category) => (
            <div key={category.category}>
              <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                {category.category}
              </div>
              {category.items.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    onInsert(item.value);
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 flex items-center justify-between group"
                >
                  <span className="text-gray-700">{item.label}</span>
                  <code className="text-xs text-gray-400 group-hover:text-indigo-500 font-mono">
                    {item.value.replace(/\{\{|\}\}/g, '')}
                  </code>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// NODE CONFIGURATIONS - Aligned with Backend
// ============================================================================

const nodeConfigs: Record<string, { title: string; fields: FieldConfig[] }> = {
  // ==========================================================================
  // TRIGGERS
  // ==========================================================================
  trigger_form_submitted: {
    title: 'Form Submitted',
    fields: [
      { key: 'form_id', label: 'Select Form', type: 'dynamic_select', dataSource: 'forms', helperText: 'Triggers when this form is submitted' },
    ],
  },
  trigger_tag_added: {
    title: 'Tag Added',
    fields: [
      { key: 'tag', label: 'Tag Name', type: 'dynamic_select', dataSource: 'tags', helperText: 'Triggers when this tag is added to a contact' },
    ],
  },
  trigger_chat_started: {
    title: 'Chat Started',
    fields: [
      { key: 'page_id', label: 'On Page (optional)', type: 'dynamic_select', dataSource: 'pages', helperText: 'Filter to specific page, or leave empty for all' },
    ],
  },
  trigger_chat_message: {
    title: 'Chat Message',
    fields: [
      { key: 'page_id', label: 'On Page (optional)', type: 'dynamic_select', dataSource: 'pages', helperText: 'Filter to specific page' },
      { key: 'chat_keyword', label: 'Keyword Filter', type: 'text', placeholder: 'pricing, demo, help', helperText: 'Only trigger if message contains this keyword' },
    ],
  },
  trigger_page_visit: {
    title: 'Page Visit',
    fields: [
      { key: 'page_id', label: 'Select Page', type: 'dynamic_select', dataSource: 'pages', helperText: 'Triggers when visitor lands on this page' },
    ],
  },
  trigger_webhook: {
    title: 'Webhook',
    fields: [
      { key: 'webhook_path', label: 'Webhook Path', type: 'text', placeholder: '/my-webhook', helperText: 'The URL path for this webhook' },
      { key: 'secret', label: 'Secret (optional)', type: 'text', placeholder: 'HMAC secret for validation' },
    ],
  },
  trigger_schedule: {
    title: 'Schedule',
    fields: [
      { key: 'frequency', label: 'Frequency', type: 'select', options: [
        { value: 'hourly', label: 'Every hour' },
        { value: 'daily', label: 'Every day' },
        { value: 'weekly', label: 'Every week' },
        { value: 'monthly', label: 'Every month' },
      ]},
      { key: 'time', label: 'At time', type: 'text', placeholder: '09:00', helperText: 'HH:MM in 24-hour format' },
      { key: 'day_of_week', label: 'Day of week', type: 'select', options: [
        { value: 'MON', label: 'Monday' },
        { value: 'TUE', label: 'Tuesday' },
        { value: 'WED', label: 'Wednesday' },
        { value: 'THU', label: 'Thursday' },
        { value: 'FRI', label: 'Friday' },
        { value: 'SAT', label: 'Saturday' },
        { value: 'SUN', label: 'Sunday' },
      ]},
      { key: 'day_of_month', label: 'Day of month', type: 'number', placeholder: '1', helperText: '1-28 recommended' },
      { key: 'timezone', label: 'Timezone', type: 'select', options: [
        { value: 'UTC', label: 'UTC' },
        { value: 'America/New_York', label: 'Eastern Time' },
        { value: 'America/Chicago', label: 'Central Time' },
        { value: 'America/Denver', label: 'Mountain Time' },
        { value: 'America/Los_Angeles', label: 'Pacific Time' },
        { value: 'America/Anchorage', label: 'Alaska Time' },
        { value: 'Pacific/Honolulu', label: 'Hawaii Time' },
        { value: 'Europe/London', label: 'London' },
        { value: 'Europe/Paris', label: 'Central European' },
        { value: 'Asia/Tokyo', label: 'Tokyo' },
        { value: 'Australia/Sydney', label: 'Sydney' },
      ]},
    ],
  },
  trigger_sms_received: {
    title: 'SMS Received',
    fields: [
      { key: 'phone_filter', label: 'From Number (optional)', type: 'text', placeholder: '+1555...', helperText: 'Filter by sender phone number' },
    ],
  },
  trigger_email_received: {
    title: 'Email Received',
    fields: [
      { key: 'email_filter', label: 'From Email (optional)', type: 'text', placeholder: 'filter@example.com', helperText: 'Filter by sender email' },
    ],
  },
  trigger_segment_event: {
    title: 'Segment Event',
    fields: [
      { key: 'segment_event_name', label: 'Event Name', type: 'text', placeholder: 'Order Completed', helperText: 'Segment track event name (supports * wildcard)' },
    ],
  },
  trigger_appointment_booked: {
    title: 'Appointment Booked',
    fields: [
      { key: 'calendar_id', label: 'Calendar (optional)', type: 'text', placeholder: 'Filter by calendar ID' },
    ],
  },
  // Stripe triggers (no config needed, they receive data from webhooks)
  trigger_payment_received: { title: 'Payment Received', fields: [] },
  trigger_payment_failed: { title: 'Payment Failed', fields: [] },
  trigger_subscription_created: { title: 'Subscription Created', fields: [] },
  trigger_subscription_cancelled: { title: 'Subscription Cancelled', fields: [] },
  trigger_invoice_paid: { title: 'Invoice Paid', fields: [] },
  trigger_payment_refunded: { title: 'Payment Refunded', fields: [] },
  // Deal triggers
  trigger_deal_created: {
    title: 'Deal Created',
    fields: [
      { key: 'stage_filter', label: 'Stage Filter (optional)', type: 'select', options: [
        { value: '', label: 'Any Stage' },
        { value: 'New Lead', label: 'New Lead' },
        { value: 'Qualified', label: 'Qualified' },
        { value: 'Proposal', label: 'Proposal' },
        { value: 'Negotiation', label: 'Negotiation' },
      ], helperText: 'Only trigger for deals created in this stage' },
    ],
  },
  trigger_deal_stage_changed: {
    title: 'Deal Stage Changed',
    fields: [
      { key: 'from_stage', label: 'From Stage (optional)', type: 'select', options: [
        { value: '', label: 'Any Stage' },
        { value: 'New Lead', label: 'New Lead' },
        { value: 'Qualified', label: 'Qualified' },
        { value: 'Proposal', label: 'Proposal' },
        { value: 'Negotiation', label: 'Negotiation' },
        { value: 'Won', label: 'Won' },
        { value: 'Lost', label: 'Lost' },
      ], helperText: 'Filter by previous stage' },
      { key: 'to_stage', label: 'To Stage (optional)', type: 'select', options: [
        { value: '', label: 'Any Stage' },
        { value: 'New Lead', label: 'New Lead' },
        { value: 'Qualified', label: 'Qualified' },
        { value: 'Proposal', label: 'Proposal' },
        { value: 'Negotiation', label: 'Negotiation' },
        { value: 'Won', label: 'Won' },
        { value: 'Lost', label: 'Lost' },
      ], helperText: 'Filter by new stage' },
    ],
  },
  trigger_deal_won: { title: 'Deal Won', fields: [] },
  trigger_deal_lost: { title: 'Deal Lost', fields: [] },

  // ==========================================================================
  // ACTIONS
  // ==========================================================================
  action_send_email: {
    title: 'Send Email',
    fields: [
      { key: 'email_to', label: 'To', type: 'text', placeholder: '{{contact.email}}', helperText: 'Recipient email address' },
      { key: 'email_subject', label: 'Subject', type: 'text', placeholder: 'Thanks for reaching out!' },
      { key: 'email_body', label: 'Body', type: 'textarea', placeholder: 'Hi {{contact.first_name}},\n\nThanks for your message!\n\nBest regards' },
      { key: 'email_from', label: 'From Email', type: 'dynamic_select', dataSource: 'domains', helperText: 'Sender email address (uses workspace default if not set)' },
    ],
  },
  action_send_sms: {
    title: 'Send SMS',
    fields: [
      { key: 'sms_to', label: 'To', type: 'text', placeholder: '{{contact.phone}}', helperText: 'Recipient phone number' },
      { key: 'sms_message', label: 'Message', type: 'textarea', placeholder: 'Hi {{contact.first_name}}, thanks for reaching out!', helperText: '160 chars recommended' },
      { key: 'sms_from', label: 'From Number (optional)', type: 'text', placeholder: '+15551234567' },
    ],
  },
  action_ai_respond: {
    title: 'AI Respond',
    fields: [
      { key: 'ai_system_prompt', label: 'AI Persona', type: 'textarea', placeholder: 'You are a friendly customer service rep...', helperText: 'Tell the AI how to behave' },
      { key: 'ai_prompt', label: 'Task/Context', type: 'textarea', placeholder: 'Respond helpfully to the customer inquiry', helperText: 'What should AI do' },
      { key: 'ai_respond_via', label: 'Send Response Via', type: 'select', options: [
        { value: 'same_channel', label: 'Same as trigger' },
        { value: 'email', label: 'Email' },
        { value: 'sms', label: 'SMS' },
      ]},
      { key: 'ai_max_tokens', label: 'Max Length', type: 'number', placeholder: '500', helperText: 'Maximum response length' },
      { key: 'ai_email_subject', label: 'Email Subject (if email)', type: 'text', placeholder: 'Response from us' },
    ],
  },
  action_update_contact: {
    title: 'Update Contact',
    fields: [
      { key: 'add_tags', label: 'Add Tags', type: 'tag_input', dataSource: 'tags', helperText: 'Tags to add to the contact' },
      { key: 'remove_tags', label: 'Remove Tags', type: 'tag_input', dataSource: 'tags', helperText: 'Tags to remove from the contact' },
      { key: 'update_fields', label: 'Set Fields (JSON)', type: 'textarea', placeholder: '{"company": "Acme Inc"}', helperText: 'JSON object of field:value pairs' },
    ],
  },
  action_wait: {
    title: 'Wait',
    fields: [
      { key: 'wait_duration', label: 'Duration (seconds)', type: 'number', placeholder: '3600', helperText: 'Time to wait in seconds (3600 = 1 hour)' },
      { key: 'wait_until', label: 'Or Wait Until (ISO date)', type: 'text', placeholder: '2024-12-25T09:00:00Z', helperText: 'Alternative: wait until specific time' },
    ],
  },
  action_webhook: {
    title: 'Call Webhook',
    fields: [
      { key: 'webhook_url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/webhook' },
      { key: 'webhook_method', label: 'Method', type: 'select', options: [
        { value: 'POST', label: 'POST' },
        { value: 'GET', label: 'GET' },
        { value: 'PUT', label: 'PUT' },
        { value: 'PATCH', label: 'PATCH' },
        { value: 'DELETE', label: 'DELETE' },
      ], defaultValue: 'POST' },
      { key: 'webhook_headers', label: 'Headers (JSON)', type: 'textarea', placeholder: '{"Authorization": "Bearer token"}' },
      { key: 'webhook_body', label: 'Body (JSON)', type: 'textarea', placeholder: '{"contact_id": "{{contact.id}}"}' },
    ],
  },
  // Stripe actions
  action_stripe_checkout: {
    title: 'Stripe Checkout',
    fields: [
      { key: 'product_name', label: 'Product Name', type: 'text', placeholder: 'Premium Plan' },
      { key: 'amount', label: 'Amount ($)', type: 'number', placeholder: '49.99' },
      { key: 'currency', label: 'Currency', type: 'select', options: [
        { value: 'usd', label: 'USD' },
        { value: 'eur', label: 'EUR' },
        { value: 'gbp', label: 'GBP' },
      ], defaultValue: 'usd' },
      { key: 'description', label: 'Description', type: 'text', placeholder: 'Product description' },
      { key: 'success_url', label: 'Success URL', type: 'text', placeholder: 'https://yoursite.com/success' },
      { key: 'cancel_url', label: 'Cancel URL', type: 'text', placeholder: 'https://yoursite.com/cancel' },
    ],
  },
  action_stripe_subscription: {
    title: 'Stripe Subscription',
    fields: [
      { key: 'product_name', label: 'Product Name', type: 'text', placeholder: 'Pro Membership' },
      { key: 'amount', label: 'Amount ($)', type: 'number', placeholder: '29.99' },
      { key: 'currency', label: 'Currency', type: 'select', options: [
        { value: 'usd', label: 'USD' },
        { value: 'eur', label: 'EUR' },
        { value: 'gbp', label: 'GBP' },
      ], defaultValue: 'usd' },
      { key: 'interval', label: 'Billing Interval', type: 'select', options: [
        { value: 'month', label: 'Monthly' },
        { value: 'year', label: 'Yearly' },
        { value: 'week', label: 'Weekly' },
      ], defaultValue: 'month' },
      { key: 'success_url', label: 'Success URL', type: 'text', placeholder: 'https://yoursite.com/success' },
      { key: 'cancel_url', label: 'Cancel URL', type: 'text', placeholder: 'https://yoursite.com/cancel' },
    ],
  },
  action_stripe_cancel_subscription: {
    title: 'Cancel Subscription',
    fields: [
      { key: 'subscription_id', label: 'Subscription ID', type: 'text', placeholder: '{{variables.subscription_id}}', helperText: 'Stripe subscription ID to cancel' },
      { key: 'immediately', label: 'Cancel Immediately', type: 'checkbox', helperText: 'If unchecked, cancels at period end' },
    ],
  },
  // Deal actions
  action_create_deal: {
    title: 'Create Deal',
    fields: [
      { key: 'deal_title', label: 'Deal Title', type: 'text', placeholder: 'Deal for {{contact.first_name}}', helperText: 'Supports template variables' },
      { key: 'deal_value', label: 'Value ($)', type: 'number', placeholder: '0' },
      { key: 'deal_stage', label: 'Stage', type: 'select', options: [
        { value: 'New Lead', label: 'New Lead' },
        { value: 'Qualified', label: 'Qualified' },
        { value: 'Proposal', label: 'Proposal' },
        { value: 'Negotiation', label: 'Negotiation' },
      ], defaultValue: 'New Lead' },
      { key: 'deal_priority', label: 'Priority', type: 'select', options: [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ], defaultValue: 'medium' },
    ],
  },
  action_update_deal: {
    title: 'Update Deal',
    fields: [
      { key: 'deal_id', label: 'Deal ID', type: 'text', placeholder: '{{trigger_data.deal_id}}', helperText: 'Defaults to deal from trigger' },
      { key: 'deal_stage', label: 'New Stage (optional)', type: 'select', options: [
        { value: '', label: 'No change' },
        { value: 'New Lead', label: 'New Lead' },
        { value: 'Qualified', label: 'Qualified' },
        { value: 'Proposal', label: 'Proposal' },
        { value: 'Negotiation', label: 'Negotiation' },
        { value: 'Won', label: 'Won' },
        { value: 'Lost', label: 'Lost' },
      ] },
      { key: 'deal_value', label: 'New Value ($, optional)', type: 'number', placeholder: '' },
      { key: 'deal_priority', label: 'New Priority (optional)', type: 'select', options: [
        { value: '', label: 'No change' },
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ] },
      { key: 'add_tags', label: 'Add Tags', type: 'tag_input', dataSource: 'tags', helperText: 'Tags to add to the deal' },
    ],
  },

  // ==========================================================================
  // LOGIC
  // ==========================================================================
  logic_branch: {
    title: 'If/Else Branch',
    fields: [
      { key: 'conditions', label: 'Conditions', type: 'conditions', helperText: 'Add conditions to evaluate' },
      { key: 'default_output', label: 'Default Branch', type: 'text', placeholder: 'else', helperText: 'Output handle if no conditions match' },
    ],
  },
  logic_ab_split: {
    title: 'A/B Split',
    fields: [
      { key: 'split_percentages', label: 'Split Percentages (JSON)', type: 'textarea', placeholder: '{"a": 50, "b": 50}', helperText: 'Must sum to 100. Keys are output handles.' },
    ],
  },
  logic_filter: {
    title: 'Filter',
    fields: [
      { key: 'filter_conditions', label: 'Filter Conditions', type: 'conditions', helperText: 'Only continue if conditions are met' },
      { key: 'filter_operator', label: 'Match', type: 'select', options: [
        { value: 'and', label: 'ALL conditions (AND)' },
        { value: 'or', label: 'ANY condition (OR)' },
      ], defaultValue: 'and' },
    ],
  },
  logic_goal: {
    title: 'Goal',
    fields: [
      { key: 'goal_condition', label: 'Goal Condition (JSON)', type: 'textarea', placeholder: '{"field": "contact.tags", "operator": "contains", "value": "purchased"}', helperText: 'Condition that marks goal as achieved' },
      { key: 'goal_action', label: 'When Achieved', type: 'select', options: [
        { value: 'stop', label: 'Stop workflow' },
        { value: 'continue', label: 'Continue workflow' },
      ], defaultValue: 'stop' },
    ],
  },

  // ==========================================================================
  // AI
  // ==========================================================================
  ai_decision: {
    title: 'AI Decision',
    fields: [
      { key: 'decision_prompt', label: 'Decision Context', type: 'textarea', placeholder: 'Based on the customer inquiry, decide if they need sales or support...', helperText: 'Context for the AI to make a decision' },
      { key: 'decision_options', label: 'Options (JSON)', type: 'textarea', placeholder: '[{"label": "sales", "description": "Sales inquiry"}, {"label": "support", "description": "Support request"}]', helperText: 'Array of {label, description, output_handle}' },
      { key: 'max_tokens', label: 'Max Tokens', type: 'number', placeholder: '500' },
    ],
  },
  ai_generate: {
    title: 'AI Generate',
    fields: [
      { key: 'generate_prompt', label: 'Generation Prompt', type: 'textarea', placeholder: 'Write a personalized follow-up email for {{contact.first_name}}...' },
      { key: 'generate_output_variable', label: 'Save To Variable', type: 'text', placeholder: 'ai_output', helperText: 'Variable name for the generated content' },
      { key: 'generate_format', label: 'Output Format', type: 'select', options: [
        { value: 'text', label: 'Text' },
        { value: 'json', label: 'JSON' },
      ], defaultValue: 'text' },
      { key: 'system_prompt', label: 'System Prompt (optional)', type: 'textarea', placeholder: 'You are a professional copywriter...' },
      { key: 'max_tokens', label: 'Max Tokens', type: 'number', placeholder: '500' },
      { key: 'temperature', label: 'Temperature', type: 'number', placeholder: '0.7', helperText: '0-1, higher = more creative' },
    ],
  },
  ai_analyze: {
    title: 'AI Analyze',
    fields: [
      { key: 'analyze_type', label: 'Analysis Type', type: 'select', options: [
        { value: 'sentiment', label: 'Sentiment Analysis' },
        { value: 'intent', label: 'Intent Detection' },
        { value: 'summary', label: 'Summarize' },
        { value: 'custom', label: 'Custom Analysis' },
      ], defaultValue: 'sentiment' },
      { key: 'analyze_prompt', label: 'Custom Prompt (if custom)', type: 'textarea', placeholder: 'Analyze this message for...' },
      { key: 'analyze_output_variable', label: 'Save To Variable', type: 'text', placeholder: 'analysis', helperText: 'Variable name for the analysis result' },
      { key: 'max_tokens', label: 'Max Tokens', type: 'number', placeholder: '500' },
    ],
  },
  ai_conversation: {
    title: 'AI Conversation',
    fields: [
      { key: 'system_prompt', label: 'AI Persona', type: 'textarea', placeholder: 'You are a helpful marketing assistant...', helperText: 'System prompt for the AI' },
      { key: 'conversation_context_messages', label: 'History Length', type: 'number', placeholder: '10', helperText: 'Number of previous messages to include' },
      { key: 'max_tokens', label: 'Max Tokens', type: 'number', placeholder: '500' },
    ],
  },
};

// ============================================================================
// FIELD COMPONENTS
// ============================================================================

interface TagInputProps {
  value: string[];
  onChange: (value: string[]) => void;
  suggestions: string[];
  isLoading: boolean;
  placeholder?: string;
}

function TagInput({ value, onChange, suggestions, isLoading, placeholder }: TagInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = Array.isArray(value) ? value : [];

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInputValue('');
    setShowSuggestions(false);
  };

  const removeTag = (index: number) => {
    onChange(tags.filter((_, i) => i !== index));
  };

  const filteredSuggestions = suggestions.filter(
    s => s.toLowerCase().includes(inputValue.toLowerCase()) && !tags.includes(s)
  );

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-1 p-2 border border-gray-300 rounded-lg min-h-[42px] bg-white focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
        {tags.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-sm"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="hover:text-indigo-900"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && inputValue) {
              e.preventDefault();
              addTag(inputValue);
            } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
              removeTag(tags.length - 1);
            }
          }}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[100px] outline-none text-sm"
        />
      </div>

      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {isLoading ? (
            <div className="p-2 text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : (
            filteredSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => addTag(suggestion)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50"
              >
                {suggestion}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface ConditionBuilderProps {
  value: Array<{ field: string; operator: string; value: string; output_handle?: string }>;
  onChange: (value: Array<{ field: string; operator: string; value: string; output_handle?: string }>) => void;
  showOutputHandle?: boolean;
}

function ConditionBuilder({ value, onChange, showOutputHandle = false }: ConditionBuilderProps) {
  const conditions = Array.isArray(value) ? value : [];

  const addCondition = () => {
    onChange([...conditions, { field: '', operator: 'equals', value: '', output_handle: 'then' }]);
  };

  const updateCondition = (index: number, updates: Partial<typeof conditions[0]>) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    onChange(newConditions);
  };

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {conditions.map((condition, index) => (
        <div key={index} className="flex gap-2 items-start p-2 bg-gray-50 rounded-lg">
          <div className="flex-1 grid grid-cols-3 gap-2">
            <select
              value={condition.field}
              onChange={(e) => updateCondition(index, { field: e.target.value })}
              className="input text-sm"
            >
              <option value="">Field...</option>
              {CONTACT_FIELDS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
            <select
              value={condition.operator}
              onChange={(e) => updateCondition(index, { operator: e.target.value })}
              className="input text-sm"
            >
              <option value="equals">Equals</option>
              <option value="not_equals">Not Equals</option>
              <option value="contains">Contains</option>
              <option value="not_contains">Not Contains</option>
              <option value="greater_than">Greater Than</option>
              <option value="less_than">Less Than</option>
              <option value="is_empty">Is Empty</option>
              <option value="is_not_empty">Is Not Empty</option>
            </select>
            <input
              type="text"
              value={condition.value}
              onChange={(e) => updateCondition(index, { value: e.target.value })}
              placeholder="Value"
              className="input text-sm"
            />
          </div>
          {showOutputHandle && (
            <input
              type="text"
              value={condition.output_handle || ''}
              onChange={(e) => updateCondition(index, { output_handle: e.target.value })}
              placeholder="Output"
              className="input text-sm w-20"
            />
          )}
          <button
            type="button"
            onClick={() => removeCondition(index)}
            className="p-1 text-gray-400 hover:text-red-500"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addCondition}
        className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
      >
        <Plus className="w-4 h-4" /> Add Condition
      </button>
    </div>
  );
}

interface ConfigFieldProps {
  field: FieldConfig;
  value: unknown;
  onChange: (value: unknown) => void;
  dynamicOptions?: { value: string; label: string }[];
  isLoading?: boolean;
  contextNote?: string; // Additional context for the user
}

function ConfigField({ field, value, onChange, dynamicOptions, isLoading, contextNote }: ConfigFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const insertVariable = (variable: string, isTextarea: boolean) => {
    const ref = isTextarea ? textareaRef.current : inputRef.current;
    if (!ref) {
      onChange(((value as string) || '') + variable);
      return;
    }

    const start = ref.selectionStart || 0;
    const end = ref.selectionEnd || 0;
    const currentValue = (value as string) || '';
    const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end);
    onChange(newValue);

    setTimeout(() => {
      ref.focus();
      ref.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  switch (field.type) {
    case 'textarea':
      return (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">{field.label}</label>
            <VariablePicker onInsert={(v) => insertVariable(v, true)} />
          </div>
          <textarea
            ref={textareaRef}
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="input min-h-[80px] resize-y text-sm"
            rows={3}
          />
          {field.helperText && <p className="mt-1 text-xs text-gray-500">{field.helperText}</p>}
        </div>
      );

    case 'number':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
          <input
            type="number"
            value={(value as number) ?? ''}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : '')}
            placeholder={field.placeholder}
            className="input text-sm"
          />
          {field.helperText && <p className="mt-1 text-xs text-gray-500">{field.helperText}</p>}
        </div>
      );

    case 'select':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
          <select
            value={(value as string) || (typeof field.defaultValue === 'string' ? field.defaultValue : '')}
            onChange={(e) => onChange(e.target.value)}
            className="input text-sm"
          >
            <option value="">Select...</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {field.helperText && <p className="mt-1 text-xs text-gray-500">{field.helperText}</p>}
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
              className="input text-sm"
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
          {field.helperText && <p className="mt-1 text-xs text-gray-500">{field.helperText}</p>}
          {contextNote && (
            <p className="mt-1 text-xs text-indigo-600 flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {contextNote}
            </p>
          )}
          {!isLoading && dynamicOptions?.length === 0 && (
            <p className="mt-1 text-xs text-amber-600">No items found. Create one first.</p>
          )}
        </div>
      );

    case 'tag_input':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
          <TagInput
            value={(value as string[]) || []}
            onChange={onChange}
            suggestions={dynamicOptions?.map(o => o.value) || []}
            isLoading={isLoading || false}
            placeholder="Type and press Enter"
          />
          {field.helperText && <p className="mt-1 text-xs text-gray-500">{field.helperText}</p>}
        </div>
      );

    case 'conditions':
      return (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
          <ConditionBuilder
            value={(value as Array<{ field: string; operator: string; value: string }>) || []}
            onChange={onChange}
            showOutputHandle={field.key === 'conditions'} // Show output handle for branch conditions
          />
          {field.helperText && <p className="mt-1 text-xs text-gray-500">{field.helperText}</p>}
        </div>
      );

    case 'checkbox':
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label className="text-sm font-medium text-gray-700">{field.label}</label>
          {field.helperText && <span className="text-xs text-gray-500">({field.helperText})</span>}
        </div>
      );

    default: // text
      return (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">{field.label}</label>
            <VariablePicker onInsert={(v) => insertVariable(v, false)} />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={(value as string) || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="input text-sm"
          />
          {field.helperText && <p className="mt-1 text-xs text-gray-500">{field.helperText}</p>}
        </div>
      );
  }
}

// ============================================================================
// WEBHOOK URL DISPLAY
// ============================================================================

function WebhookUrlDisplay({ workspaceId, webhookPath }: { workspaceId: string; webhookPath: string }) {
  const [copied, setCopied] = useState(false);

  const apiUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
  const path = webhookPath ? webhookPath.replace(/^\//, '') : 'your-path';
  const fullUrl = `${apiUrl}/public/webhooks/${workspaceId}/${path}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = fullUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
      <label className="block text-xs font-medium text-gray-500 mb-1.5">Webhook URL</label>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs text-gray-700 bg-white px-2 py-1.5 rounded border border-gray-200 break-all select-all">
          {fullUrl}
        </code>
        <button
          type="button"
          onClick={handleCopy}
          className="shrink-0 p-1.5 rounded hover:bg-gray-200 transition-colors"
          title="Copy webhook URL"
        >
          {copied ? (
            <Check className="w-4 h-4 text-green-500" />
          ) : (
            <Copy className="w-4 h-4 text-gray-500" />
          )}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-gray-500">
        Send POST or GET requests to this URL to trigger the workflow.
      </p>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

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

export default function NodeConfigPanel({ node, workspaceId, pageId, onClose, onUpdate }: NodeConfigPanelProps) {
  const [localLabel, setLocalLabel] = useState('');
  const [localConfig, setLocalConfig] = useState<Record<string, unknown>>({});
  const [activeTab, setActiveTab] = useState<'config' | 'preview'>('config');
  const prevNodeIdRef = useRef<string | null>(null);

  // Determine if we're in page-specific context
  const isPageContext = !!pageId;

  // Fetch data for dynamic dropdowns
  // When pageId is provided (page-level workflow), only show forms for that page
  // When pageId is NOT provided (global workflow), show all workspace forms
  const { data: allForms, isLoading: isLoadingAllForms } = useForms(workspaceId);
  const { data: pageForms, isLoading: isLoadingPageForms } = usePageForms(workspaceId, pageId);

  // Use page-specific forms when in page context, otherwise all workspace forms
  const forms = isPageContext ? pageForms : allForms;
  const isLoadingForms = isPageContext ? isLoadingPageForms : isLoadingAllForms;

  // Fetch pages - in page context, we might still want to show other pages for reference
  const { data: pages, isLoading: isLoadingPages } = usePages(workspaceId);
  const { data: currentPage } = usePage(workspaceId, pageId);

  const { data: workflows, isLoading: isLoadingWorkflows } = useWorkflows(workspaceId || '');
  const { data: contactsData, isLoading: isLoadingContacts } = useContacts(workspaceId || '', { limit: 100 });
  const { data: domainsData, isLoading: isLoadingDomains } = useListDomains(workspaceId);

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
  const getDynamicOptions = useCallback((dataSource: string | undefined): { options: { value: string; label: string }[], isLoading: boolean, contextNote?: string } => {
    switch (dataSource) {
      case 'forms':
        return {
          options: forms?.map(f => ({ value: f.id, label: f.name })) || [],
          isLoading: isLoadingForms,
          contextNote: isPageContext && currentPage
            ? `Showing forms for "${currentPage.name}"`
            : 'Showing all workspace forms',
        };
      case 'pages':
        // In page context, show the current page first, then others
        if (isPageContext && currentPage) {
          const otherPages = pages?.filter(p => p.id !== pageId) || [];
          return {
            options: [
              { value: currentPage.id, label: `${currentPage.name} (this page)` },
              ...otherPages.map(p => ({ value: p.id, label: p.name })),
            ],
            isLoading: isLoadingPages,
            contextNote: 'Current page shown first',
          };
        }
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
      case 'domains': {
        const domainOptions = domainsData?.items
          ?.filter(d => d.ready)
          .flatMap(d => [
            { value: `noreply@${d.domain}`, label: `noreply@${d.domain}` },
            { value: `hello@${d.domain}`, label: `hello@${d.domain}` },
            { value: `info@${d.domain}`, label: `info@${d.domain}` },
          ]) || [];
        return {
          options: domainOptions,
          isLoading: isLoadingDomains,
          contextNote: domainOptions.length > 0 ? 'Showing verified domains' : undefined,
        };
      }
      default:
        return { options: [], isLoading: false };
    }
  }, [forms, pages, workflows, allTags, isLoadingForms, isLoadingPages, isLoadingWorkflows, isLoadingContacts, isPageContext, currentPage, pageId, domainsData, isLoadingDomains]);

  // Initialize local state when node changes
  useEffect(() => {
    if (node && node.id !== prevNodeIdRef.current) {
      const nodeData = node.data as unknown as NodeData;
      setLocalLabel(nodeData.label || '');
      setLocalConfig(nodeData.config || {});
      setActiveTab('config');
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

  const { getNodes, getEdges } = useReactFlow();
  const autofill = useAutofillNode(workspaceId || '');

  const handleAutofill = useCallback(async () => {
    if (!node || !workspaceId) return;
    const nodeType = (node.data as unknown as NodeData).nodeType;
    const currentConfig = (node.data as unknown as NodeData).config || {};
    try {
      const suggestedConfig = await autofill.mutateAsync({
        node_id: node.id,
        node_type: nodeType,
        current_config: currentConfig,
        nodes: getNodes().map(n => ({ id: n.id, type: n.type, data: n.data })),
        edges: getEdges().map(e => ({ source: e.source, target: e.target })),
      });
      if (suggestedConfig && Object.keys(suggestedConfig).length > 0) {
        const mergedConfig = { ...currentConfig };
        for (const [key, value] of Object.entries(suggestedConfig)) {
          const current = currentConfig[key];
          if (current === undefined || current === null || current === '') {
            mergedConfig[key] = value;
          }
        }
        onUpdate(node.id, { config: mergedConfig });
      }
    } catch {
      // Error state handled by autofill mutation
    }
  }, [node, workspaceId, autofill, getNodes, getEdges, onUpdate]);

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
        <p className="text-sm text-gray-500">No configuration available for: <code className="bg-gray-100 px-1 rounded">{nodeType}</code></p>
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
          <div className="flex items-center gap-1">
            <button
              onClick={handleAutofill}
              disabled={autofill.isPending}
              className="p-1 hover:bg-violet-100 rounded transition-colors"
              title="AI autofill empty fields"
            >
              {autofill.isPending ? (
                <Loader2 className="w-4 h-4 text-violet-500 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4 text-violet-500" />
              )}
            </button>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
        {/* Page context indicator */}
        {isPageContext && currentPage && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
            <FileText className="w-3 h-3" />
            <span>Page workflow: <strong>{currentPage.name}</strong></span>
          </div>
        )}
      </div>

      {/* Tab bar for email nodes */}
      {nodeType === 'action_send_email' && (
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('config')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'config'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Settings className="w-4 h-4" />
            Configure
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'preview'
                ? 'border-primary-600 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Eye className="w-4 h-4" />
            Preview
          </button>
        </div>
      )}

      {/* Config fields */}
      {activeTab === 'config' ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Node label */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Node Label</label>
            <input
              type="text"
              value={localLabel}
              onChange={(e) => handleLabelChange(e.target.value)}
              className="input text-sm"
              placeholder="Node name"
            />
          </div>

          {config.fields.length > 0 && <hr className="border-gray-200" />}

          {/* Webhook URL display */}
          {nodeType === 'trigger_webhook' && workspaceId && (
            <WebhookUrlDisplay
              workspaceId={workspaceId}
              webhookPath={(localConfig.webhook_path as string) || ''}
            />
          )}

          {/* Type-specific fields */}
          {config.fields.map((field) => {
            // Conditional schedule fields
            if (nodeType === 'trigger_schedule') {
              const freq = (localConfig.frequency as string) || '';
              if (field.key === 'time' && freq === 'hourly') return null;
              if (field.key === 'day_of_week' && freq !== 'weekly') return null;
              if (field.key === 'day_of_month' && freq !== 'monthly') return null;
            }

            const dynamicData = ['dynamic_select', 'tag_input'].includes(field.type)
              ? getDynamicOptions(field.dataSource)
              : { options: [], isLoading: false, contextNote: undefined };

            return (
              <ConfigField
                key={field.key}
                field={field}
                value={localConfig[field.key]}
                onChange={(value) => handleFieldChange(field.key, value)}
                dynamicOptions={dynamicData.options}
                isLoading={dynamicData.isLoading}
                contextNote={dynamicData.contextNote}
              />
            );
          })}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4">
          <EmailPreview
            workspaceId={workspaceId || ''}
            workflowId={node.id}
            subject={(localConfig.email_subject as string) || ''}
            bodyHtml={(localConfig.email_body as string) || ''}
            toEmail={(localConfig.email_to as string) || ''}
          />
        </div>
      )}

      {/* Footer hint */}
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500">
          Click <span className="inline-flex items-center gap-0.5 px-1 bg-indigo-100 text-indigo-600 rounded text-xs"><Variable className="w-3 h-3" /> Insert</span> to add dynamic values
        </p>
      </div>
    </div>
  );
}
