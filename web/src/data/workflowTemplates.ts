import type { WorkflowNode, WorkflowEdge } from '../lib/hooks/useWorkflows';

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: 'lead-gen' | 'communication' | 'ai' | 'automation' | 'analytics';
  icon: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export const TEMPLATE_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'lead-gen', label: 'Lead Gen' },
  { id: 'communication', label: 'Communication' },
  { id: 'ai', label: 'AI' },
  { id: 'automation', label: 'Automation' },
  { id: 'analytics', label: 'Analytics' },
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
  // ---- New Templates ----
  {
    id: 'webhook-integration',
    name: 'Webhook Integration',
    description: 'Receive data from external services via webhook and notify your team or update contacts automatically.',
    category: 'automation',
    icon: 'webhook',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: {
          label: 'Webhook Received',
          nodeType: 'trigger_webhook',
          config: {},
        },
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 250, y: 200 },
        data: {
          label: 'Update Contact',
          nodeType: 'action_update_contact',
          config: {
            add_tags: ['webhook-lead'],
          },
        },
      },
      {
        id: 'action-2',
        type: 'action',
        position: { x: 250, y: 350 },
        data: {
          label: 'Notify Team',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{owner.email}}',
            email_subject: 'New webhook event from {{contact.full_name}}',
            email_body: '<h3>Webhook Event Received</h3><p>A new event was received via webhook for <strong>{{contact.email}}</strong>.</p><p>Check your dashboard for details.</p>',
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'action-1' },
      { id: 'e2', source: 'action-1', target: 'action-2' },
    ],
  },
  {
    id: 'ai-content-response',
    name: 'AI Content Response',
    description: 'Use AI to analyze incoming messages and generate personalized content responses based on the inquiry.',
    category: 'ai',
    icon: 'sparkles',
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
        id: 'ai-1',
        type: 'ai',
        position: { x: 250, y: 200 },
        data: {
          label: 'Analyze Intent',
          nodeType: 'ai_analyze',
          config: {
            analyze_type: 'intent',
            analyze_output_variable: 'intent',
          },
        },
      },
      {
        id: 'ai-2',
        type: 'ai',
        position: { x: 250, y: 350 },
        data: {
          label: 'Generate Response',
          nodeType: 'ai_generate',
          config: {
            generate_prompt: 'Based on the customer intent: {{variables.intent}}, write a helpful response to: {{trigger_data.form_data.message}}',
            generate_output_variable: 'ai_response',
            system_prompt: 'You are a knowledgeable assistant. Provide detailed, helpful responses tailored to the customer\'s specific needs.',
            max_tokens: 800,
          },
        },
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 250, y: 500 },
        data: {
          label: 'Send Response Email',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{contact.email}}',
            email_subject: 'Re: Your inquiry',
            email_body: '<p>Hi {{contact.first_name}},</p><p>{{variables.ai_response}}</p><p>If you need further assistance, don\'t hesitate to reach out.</p>',
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'ai-1' },
      { id: 'e2', source: 'ai-1', target: 'ai-2' },
      { id: 'e3', source: 'ai-2', target: 'action-1' },
    ],
  },
  {
    id: 'multi-step-drip',
    name: 'Multi-step Drip Campaign',
    description: 'A 3-email drip sequence with timed delays. Engage leads over a week with progressive content.',
    category: 'communication',
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
        id: 'action-email-1',
        type: 'action',
        position: { x: 250, y: 180 },
        data: {
          label: 'Email 1: Welcome',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{contact.email}}',
            email_subject: 'Welcome! Here\'s what to expect',
            email_body: '<h2>Welcome, {{contact.first_name}}!</h2><p>Thanks for joining us. Over the next few days, we\'ll share some resources to help you get started.</p>',
          },
        },
      },
      {
        id: 'action-wait-1',
        type: 'action',
        position: { x: 250, y: 310 },
        data: {
          label: 'Wait 2 Days',
          nodeType: 'action_wait',
          config: { wait_duration: 172800 },
        },
      },
      {
        id: 'action-email-2',
        type: 'action',
        position: { x: 250, y: 440 },
        data: {
          label: 'Email 2: Value',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{contact.email}}',
            email_subject: 'Quick tips to get the most out of our platform',
            email_body: '<p>Hi {{contact.first_name}},</p><p>Here are 3 things our most successful users do in their first week...</p>',
          },
        },
      },
      {
        id: 'action-wait-2',
        type: 'action',
        position: { x: 250, y: 570 },
        data: {
          label: 'Wait 3 Days',
          nodeType: 'action_wait',
          config: { wait_duration: 259200 },
        },
      },
      {
        id: 'action-email-3',
        type: 'action',
        position: { x: 250, y: 700 },
        data: {
          label: 'Email 3: CTA',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{contact.email}}',
            email_subject: 'Ready to take the next step?',
            email_body: '<p>Hi {{contact.first_name}},</p><p>Now that you\'ve had a chance to explore, here\'s how to unlock even more value...</p>',
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'action-email-1' },
      { id: 'e2', source: 'action-email-1', target: 'action-wait-1' },
      { id: 'e3', source: 'action-wait-1', target: 'action-email-2' },
      { id: 'e4', source: 'action-email-2', target: 'action-wait-2' },
      { id: 'e5', source: 'action-wait-2', target: 'action-email-3' },
    ],
  },
  {
    id: 'smart-lead-router',
    name: 'Smart Lead Router',
    description: 'Use AI to analyze lead quality and route high-value leads to sales, while auto-nurturing others with targeted content.',
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
          label: 'Score Lead',
          nodeType: 'ai_analyze',
          config: {
            analyze_type: 'intent',
            analyze_output_variable: 'lead_tier',
          },
        },
      },
      {
        id: 'logic-1',
        type: 'logic',
        position: { x: 300, y: 350 },
        data: {
          label: 'Route by Tier',
          nodeType: 'logic_branch',
          config: {
            conditions: [
              { field: 'variables.lead_tier', operator: 'contains', value: 'high', output_handle: 'hot' },
              { field: 'variables.lead_tier', operator: 'contains', value: 'medium', output_handle: 'warm' },
            ],
            default_output: 'cold',
          },
        },
      },
      {
        id: 'action-hot',
        type: 'action',
        position: { x: 50, y: 520 },
        data: {
          label: 'Alert Sales Team',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{owner.email}}',
            email_subject: 'HOT LEAD: {{contact.full_name}}',
            email_body: '<h3>High-value lead detected!</h3><p><strong>{{contact.full_name}}</strong> ({{contact.email}}) has been scored as a hot lead. Reach out immediately.</p>',
          },
        },
      },
      {
        id: 'action-warm',
        type: 'action',
        position: { x: 300, y: 520 },
        data: {
          label: 'Send Case Study',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{contact.email}}',
            email_subject: 'See how others achieved results',
            email_body: '<p>Hi {{contact.first_name}},</p><p>We thought you might be interested in seeing how similar businesses have achieved great results...</p>',
          },
        },
      },
      {
        id: 'action-cold',
        type: 'action',
        position: { x: 550, y: 520 },
        data: {
          label: 'Tag for Nurture',
          nodeType: 'action_update_contact',
          config: {
            add_tags: ['nurture', 'cold-lead'],
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'ai-1' },
      { id: 'e2', source: 'ai-1', target: 'logic-1' },
      { id: 'e3', source: 'logic-1', target: 'action-hot', source_handle: 'hot' },
      { id: 'e4', source: 'logic-1', target: 'action-warm', source_handle: 'warm' },
      { id: 'e5', source: 'logic-1', target: 'action-cold', source_handle: 'cold' },
    ],
  },
  {
    id: 'appointment-reminder',
    name: 'Appointment Reminder',
    description: 'Send a reminder email 24 hours before an appointment, with a final reminder 1 hour before.',
    category: 'communication',
    icon: 'clock',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: {
          label: 'Tag Added',
          nodeType: 'trigger_tag_added',
          config: {
            tag: 'appointment-scheduled',
          },
        },
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 250, y: 200 },
        data: {
          label: 'Confirmation Email',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{contact.email}}',
            email_subject: 'Your appointment is confirmed',
            email_body: '<p>Hi {{contact.first_name}},</p><p>Your appointment has been confirmed. We\'ll send you a reminder before the meeting.</p>',
          },
        },
      },
      {
        id: 'action-wait',
        type: 'action',
        position: { x: 250, y: 350 },
        data: {
          label: 'Wait 23 Hours',
          nodeType: 'action_wait',
          config: { wait_duration: 82800 },
        },
      },
      {
        id: 'action-2',
        type: 'action',
        position: { x: 250, y: 500 },
        data: {
          label: 'Reminder Email',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{contact.email}}',
            email_subject: 'Reminder: Your appointment is in 1 hour',
            email_body: '<p>Hi {{contact.first_name}},</p><p>This is a friendly reminder that your appointment is coming up in about an hour. See you soon!</p>',
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
  {
    id: 'payment-followup',
    name: 'Payment Follow-up',
    description: 'Automatically follow up after a payment is received with a thank you email and tag the contact as a customer.',
    category: 'automation',
    icon: 'credit-card',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: {
          label: 'Webhook Received',
          nodeType: 'trigger_webhook',
          config: {},
        },
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 250, y: 200 },
        data: {
          label: 'Tag as Customer',
          nodeType: 'action_update_contact',
          config: {
            add_tags: ['customer', 'paid'],
          },
        },
      },
      {
        id: 'action-2',
        type: 'action',
        position: { x: 250, y: 350 },
        data: {
          label: 'Thank You Email',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{contact.email}}',
            email_subject: 'Thank you for your purchase!',
            email_body: '<h2>Thank you, {{contact.first_name}}!</h2><p>We\'ve received your payment and your order is being processed.</p><p>If you have any questions, just reply to this email.</p>',
          },
        },
      },
      {
        id: 'action-3',
        type: 'action',
        position: { x: 250, y: 500 },
        data: {
          label: 'Notify Owner',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{owner.email}}',
            email_subject: 'New payment from {{contact.full_name}}',
            email_body: '<h3>Payment Received</h3><p><strong>Customer:</strong> {{contact.full_name}} ({{contact.email}})</p>',
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'action-1' },
      { id: 'e2', source: 'action-1', target: 'action-2' },
      { id: 'e3', source: 'action-2', target: 'action-3' },
    ],
  },
  {
    id: 're-engagement',
    name: 'Re-engagement Campaign',
    description: 'Automatically re-engage inactive contacts with a series of win-back emails and special offers.',
    category: 'communication',
    icon: 'mail',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 250, y: 50 },
        data: {
          label: 'Tag Added',
          nodeType: 'trigger_tag_added',
          config: {
            tag: 'inactive',
          },
        },
      },
      {
        id: 'action-1',
        type: 'action',
        position: { x: 250, y: 200 },
        data: {
          label: 'We Miss You Email',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{contact.email}}',
            email_subject: 'We miss you, {{contact.first_name}}!',
            email_body: '<p>Hi {{contact.first_name}},</p><p>It\'s been a while since we last connected. We\'ve been making some exciting improvements and wanted to share them with you.</p>',
          },
        },
      },
      {
        id: 'action-wait',
        type: 'action',
        position: { x: 250, y: 350 },
        data: {
          label: 'Wait 5 Days',
          nodeType: 'action_wait',
          config: { wait_duration: 432000 },
        },
      },
      {
        id: 'action-2',
        type: 'action',
        position: { x: 250, y: 500 },
        data: {
          label: 'Special Offer Email',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{contact.email}}',
            email_subject: 'A special offer just for you',
            email_body: '<p>Hi {{contact.first_name}},</p><p>We\'d love to have you back. Here\'s an exclusive offer to welcome you back...</p>',
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
  {
    id: 'chat-to-email-handoff',
    name: 'Chat to Email Handoff',
    description: 'When AI chat detects a complex inquiry, capture details and hand off to email support with full context.',
    category: 'ai',
    icon: 'sparkles',
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger',
        position: { x: 300, y: 50 },
        data: {
          label: 'Chat Message',
          nodeType: 'trigger_chat_message',
          config: {},
        },
      },
      {
        id: 'ai-1',
        type: 'ai',
        position: { x: 300, y: 200 },
        data: {
          label: 'Analyze Complexity',
          nodeType: 'ai_analyze',
          config: {
            analyze_type: 'sentiment',
            analyze_output_variable: 'complexity',
          },
        },
      },
      {
        id: 'logic-1',
        type: 'logic',
        position: { x: 300, y: 350 },
        data: {
          label: 'Needs Human?',
          nodeType: 'logic_branch',
          config: {
            conditions: [
              { field: 'variables.complexity', operator: 'contains', value: 'complex', output_handle: 'handoff' },
            ],
            default_output: 'auto_respond',
          },
        },
      },
      {
        id: 'action-handoff',
        type: 'action',
        position: { x: 100, y: 520 },
        data: {
          label: 'Email Support Team',
          nodeType: 'action_send_email',
          config: {
            email_to: '{{owner.email}}',
            email_subject: 'Chat handoff: {{contact.full_name}} needs help',
            email_body: '<h3>Chat Handoff Required</h3><p><strong>Contact:</strong> {{contact.full_name}} ({{contact.email}})</p><p><strong>Message:</strong> {{trigger_data.form_data.message}}</p><p>This inquiry was flagged as complex and needs human attention.</p>',
          },
        },
      },
      {
        id: 'ai-respond',
        type: 'ai',
        position: { x: 500, y: 520 },
        data: {
          label: 'AI Auto-Respond',
          nodeType: 'ai_generate',
          config: {
            generate_prompt: 'Respond helpfully to: {{trigger_data.form_data.message}}',
            generate_output_variable: 'ai_response',
            system_prompt: 'You are a helpful support assistant. Provide clear, concise answers.',
            max_tokens: 500,
          },
        },
      },
    ],
    edges: [
      { id: 'e1', source: 'trigger-1', target: 'ai-1' },
      { id: 'e2', source: 'ai-1', target: 'logic-1' },
      { id: 'e3', source: 'logic-1', target: 'action-handoff', source_handle: 'handoff' },
      { id: 'e4', source: 'logic-1', target: 'ai-respond', source_handle: 'auto_respond' },
    ],
  },
];
