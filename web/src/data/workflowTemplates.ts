import type { WorkflowNode, WorkflowEdge } from '../lib/hooks/useWorkflows';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'lead-gen' | 'communication' | 'ai';
  icon: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export const TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'lead-gen', label: 'Lead Gen' },
  { id: 'communication', label: 'Communication' },
  { id: 'ai', label: 'AI' },
] as const;

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: 'welcome-email',
    name: 'Welcome Email',
    description: 'Send a welcome email when a form is submitted. Great for lead capture forms and newsletter signups.',
    category: 'lead-gen',
    icon: 'mail',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: {
          label: 'Form Submitted',
          nodeType: 'trigger_form_submitted',
          config: {},
        },
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 250, y: 200 },
        data: {
          label: 'Send Welcome Email',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{contact.email}}',
            email_subject: 'Welcome! Thanks for signing up',
            email_body: '<h2>Welcome, {{contact.first_name}}!</h2><p>Thank you for signing up. We\'re excited to have you on board.</p><p>If you have any questions, feel free to reply to this email.</p><p>Best regards,<br>The Team</p>',
          },
        },
      },
    ],
    edges: [
      { id: 'e-trigger-action', source: 'trigger-1', target: 'action-1' },
    ],
  },
  {
    id: 'lead-qualification',
    name: 'Lead Qualification',
    description: 'Automatically analyze and qualify leads using AI. Routes qualified leads to sales and sends nurture emails to others.',
    category: 'lead-gen',
    icon: 'sparkles',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 300, y: 50 },
        data: {
          label: 'Form Submitted',
          nodeType: 'trigger_form_submitted',
          config: {},
        },
      },
      {
        id: 'ai-1',
        type: 'ai',
        position: { x: 300, y: 200 },
        data: {
          label: 'Analyze Lead',
          nodeType: 'ai_analyze',
          config: {
            analyze_type: 'intent',
            analyze_output_variable: 'lead_score',
          },
        },
      },
      {
        id: 'logic-1',
        type: 'logic',
        position: { x: 300, y: 350 },
        data: {
          label: 'Qualified?',
          nodeType: 'logic_branch',
          config: {
            conditions: [
              { field: 'variables.lead_score', operator: 'contains', value: 'high', output_handle: 'qualified' },
            ],
            default_output: 'nurture',
          },
        },
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 100, y: 500 },
        data: {
          label: 'Notify Sales',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{owner.email}}',
            email_subject: 'New Qualified Lead: {{contact.full_name}}',
            email_body: '<h3>New qualified lead!</h3><p><strong>Name:</strong> {{contact.full_name}}</p><p><strong>Email:</strong> {{contact.email}}</p><p><strong>Message:</strong> {{trigger_data.form_data.message}}</p>',
          },
        },
      },
      {
        id: 'action-2',
        type: 'action',
        position: { x: 500, y: 500 },
        data: {
          label: 'Tag as Nurture',
          nodeType: 'action_update_contact',
          config: {
            add_tags: ['nurture'],
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'ai-1' },
      { id: 'e2', source: 'ai-1', target: 'logic-1' },
      { id: 'e3', source: 'logic-1', target: 'action-1', source_handle: 'qualified' },
      { id: 'e4', source: 'logic-1', target: 'action-2', source_handle: 'nurture' },
    ],
  },
  {
    id: 'abandoned-followup',
    name: 'Abandoned Follow-up',
    description: 'Wait 24 hours after form submission, then send a follow-up email if the contact hasn\'t converted.',
    category: 'communication',
    icon: 'clock',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: {
          label: 'Form Submitted',
          nodeType: 'trigger_form_submitted',
          config: {},
        },
      },
      {
        id: 'action-wait',
        type: 'action',
        position: { x: 250, y: 200 },
        data: {
          label: 'Wait 24 Hours',
          nodeType: 'action_wait',
          config: {
            wait_duration: 86400,
          },
        },
      },
      {
        id: 'logic-1',
        type: 'logic',
        position: { x: 250, y: 350 },
        data: {
          label: 'Has Converted?',
          nodeType: 'logic_branch',
          config: {
            conditions: [
              { field: 'contact.tags', operator: 'contains', value: 'converted', output_handle: 'converted' },
            ],
            default_output: 'not_converted',
          },
        },
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 250, y: 500 },
        data: {
          label: 'Send Follow-up',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{contact.email}}',
            email_subject: 'Just checking in...',
            email_body: '<p>Hi {{contact.first_name}},</p><p>We noticed you started filling out a form but didn\'t finish. Is there anything we can help with?</p><p>We\'d love to hear from you!</p><p>Best,<br>The Team</p>',
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'action-wait' },
      { id: 'e2', source: 'action-wait', target: 'logic-1' },
      { id: 'e3', source: 'logic-1', target: 'action-1', source_handle: 'not_converted' },
    ],
  },
  {
    id: 'new-contact-notification',
    name: 'New Contact Notification',
    description: 'Instantly notify the workspace owner when a new form submission comes in.',
    category: 'communication',
    icon: 'bell',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: {
          label: 'Form Submitted',
          nodeType: 'trigger_form_submitted',
          config: {},
        },
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 250, y: 200 },
        data: {
          label: 'Notify Owner',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{owner.email}}',
            email_subject: 'New Form Submission from {{contact.full_name}}',
            email_body: '<h3>New Form Submission</h3><p><strong>Name:</strong> {{contact.full_name}}</p><p><strong>Email:</strong> {{contact.email}}</p><p><strong>Message:</strong> {{trigger_data.form_data.message}}</p><p><a href="https://complens.ai/contacts">View in Complens</a></p>',
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'action-1' },
    ],
  },
  {
    id: 'ai-chat-response',
    name: 'AI Chat Response',
    description: 'Use AI to automatically respond to chat messages with context-aware responses.',
    category: 'ai',
    icon: 'sparkles',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: {
          label: 'Chat Message',
          nodeType: 'trigger_chat_message',
          config: {},
        },
      },
      {
        id: 'ai-1',
        type: 'ai',
        position: { x: 250, y: 200 },
        data: {
          label: 'Generate Response',
          nodeType: 'ai_generate',
          config: {
            generate_prompt: 'Respond helpfully to the customer message: {{trigger_data.form_data.message}}',
            generate_output_variable: 'ai_response',
            system_prompt: 'You are a friendly and helpful customer service representative. Be concise and professional.',
            max_tokens: 500,
          },
        },
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 250, y: 350 },
        data: {
          label: 'Send AI Response',
          nodeType: 'action_ai_respond',
          config: {
            ai_respond_via: 'same_channel',
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'ai-1' },
      { id: 'e2', source: 'ai-1', target: 'action-1' },
    ],
  },
  {
    id: 'tag-based-drip',
    name: 'Tag-Based Drip',
    description: 'Send a sequence of emails when a specific tag is added to a contact. Great for onboarding or nurture campaigns.',
    category: 'communication',
    icon: 'tag',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: {
          label: 'Tag Added',
          nodeType: 'trigger_tag_added',
          config: {
            tag: 'onboarding',
          },
        },
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 250, y: 200 },
        data: {
          label: 'Email 1: Welcome',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{contact.email}}',
            email_subject: 'Welcome to the team!',
            email_body: '<p>Hi {{contact.first_name}},</p><p>Welcome aboard! Here\'s what you need to know to get started...</p>',
          },
        },
      },
      {
        id: 'action-wait',
        type: 'action',
        position: { x: 250, y: 350 },
        data: {
          label: 'Wait 3 Days',
          nodeType: 'action_wait',
          config: {
            wait_duration: 259200,
          },
        },
      },
      {
        id: 'action-2',
        type: 'action',
        position: { x: 250, y: 500 },
        data: {
          label: 'Email 2: Tips',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{contact.email}}',
            email_subject: 'Pro tips to get the most out of our platform',
            email_body: '<p>Hi {{contact.first_name}},</p><p>Now that you\'ve had a chance to explore, here are some tips to help you get the most out of the platform...</p>',
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'action-1' },
      { id: 'e2', source: 'action-1', target: 'action-wait' },
      { id: 'e3', source: 'action-wait', target: 'action-2' },
    ],
  },
];
