import { Zap, GitBranch, Sparkles, Clock, Mail, MessageSquare, Webhook, Tag, Filter, Target, PlayCircle, Eye, MessagesSquare, DollarSign, TrendingUp, Trophy, XCircle } from 'lucide-react';

interface NodeDefinition {
  type: 'trigger' | 'action' | 'logic' | 'ai';
  nodeType: string;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const triggers: NodeDefinition[] = [
  // Lead generation
  { type: 'trigger', nodeType: 'trigger_form_submitted', label: 'Form Submitted', icon: <Zap className="w-4 h-4" />, description: 'When a form is submitted' },
  { type: 'trigger', nodeType: 'trigger_chat_started', label: 'Chat Started', icon: <MessagesSquare className="w-4 h-4" />, description: 'When visitor opens chat' },
  { type: 'trigger', nodeType: 'trigger_chat_message', label: 'Chat Message', icon: <MessageSquare className="w-4 h-4" />, description: 'When visitor sends message' },
  { type: 'trigger', nodeType: 'trigger_page_visit', label: 'Page Visit', icon: <Eye className="w-4 h-4" />, description: 'When visitor lands on page' },
  // Contact & integration
  { type: 'trigger', nodeType: 'trigger_tag_added', label: 'Tag Added', icon: <Tag className="w-4 h-4" />, description: 'When a tag is added to contact' },
  { type: 'trigger', nodeType: 'trigger_webhook', label: 'Webhook', icon: <Webhook className="w-4 h-4" />, description: 'External webhook trigger' },
  { type: 'trigger', nodeType: 'trigger_schedule', label: 'Schedule', icon: <Clock className="w-4 h-4" />, description: 'Run on a schedule' },
  // Partner triggers
  { type: 'trigger', nodeType: 'trigger_partner_added', label: 'Partner Added', icon: <DollarSign className="w-4 h-4" />, description: 'When a new partner is added' },
  { type: 'trigger', nodeType: 'trigger_partner_stage_changed', label: 'Partner Stage Changed', icon: <TrendingUp className="w-4 h-4" />, description: 'When partner moves to a new stage' },
  { type: 'trigger', nodeType: 'trigger_partner_activated', label: 'Partner Activated', icon: <Trophy className="w-4 h-4" />, description: 'When a partner becomes active' },
  { type: 'trigger', nodeType: 'trigger_partner_deactivated', label: 'Partner Deactivated', icon: <XCircle className="w-4 h-4" />, description: 'When a partner becomes inactive' },
];

const actions: NodeDefinition[] = [
  { type: 'action', nodeType: 'action_send_email', label: 'Send Email', icon: <Mail className="w-4 h-4" />, description: 'Send an email to contact' },
  { type: 'action', nodeType: 'action_send_sms', label: 'Send SMS', icon: <MessageSquare className="w-4 h-4" />, description: 'Send SMS to contact' },
  { type: 'action', nodeType: 'action_wait', label: 'Wait', icon: <Clock className="w-4 h-4" />, description: 'Wait for a duration' },
  { type: 'action', nodeType: 'action_webhook', label: 'Call Webhook', icon: <Webhook className="w-4 h-4" />, description: 'Call external API' },
  { type: 'action', nodeType: 'action_update_contact', label: 'Update Contact', icon: <Tag className="w-4 h-4" />, description: 'Update contact fields' },
  { type: 'action', nodeType: 'action_create_partner', label: 'Create Partner', icon: <DollarSign className="w-4 h-4" />, description: 'Create a new partner in pipeline' },
  { type: 'action', nodeType: 'action_update_partner', label: 'Update Partner', icon: <TrendingUp className="w-4 h-4" />, description: 'Update an existing partner' },
  { type: 'action', nodeType: 'action_run_workflow', label: 'Run Workflow', icon: <PlayCircle className="w-4 h-4" />, description: 'Trigger another workflow' },
  { type: 'ai', nodeType: 'ai_respond', label: 'AI Respond', icon: <Sparkles className="w-4 h-4" />, description: 'AI generates and sends a reply' },
  { type: 'ai', nodeType: 'ai_generate', label: 'AI Generate', icon: <Sparkles className="w-4 h-4" />, description: 'AI creates content (email, text)' },
];

const logic: NodeDefinition[] = [
  { type: 'logic', nodeType: 'logic_branch', label: 'If/Else', icon: <GitBranch className="w-4 h-4" />, description: 'Branch based on condition' },
  { type: 'logic', nodeType: 'logic_filter', label: 'Filter', icon: <Filter className="w-4 h-4" />, description: 'Continue if condition met' },
  { type: 'logic', nodeType: 'logic_goal', label: 'Goal', icon: <Target className="w-4 h-4" />, description: 'End when goal achieved' },
  { type: 'ai', nodeType: 'ai_decision', label: 'AI Decision', icon: <Sparkles className="w-4 h-4" />, description: 'AI picks the next path' },
];

function DraggableNode({ node }: { node: NodeDefinition }) {
  const onDragStart = (event: React.DragEvent) => {
    event.dataTransfer.setData('application/reactflow/type', node.type);
    event.dataTransfer.setData('application/reactflow/nodeType', node.nodeType);
    event.dataTransfer.setData('application/reactflow/label', node.label);
    event.dataTransfer.effectAllowed = 'move';
  };

  const colorClass = {
    trigger: 'border-green-200 hover:border-green-400 hover:bg-green-50',
    action: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50',
    logic: 'border-amber-200 hover:border-amber-400 hover:bg-amber-50',
    ai: 'border-violet-200 hover:border-violet-400 hover:bg-violet-50',
  }[node.type];

  const iconColor = {
    trigger: 'text-green-600',
    action: 'text-blue-600',
    logic: 'text-amber-600',
    ai: 'text-violet-600',
  }[node.type];

  return (
    <div
      className={`p-3 border rounded-lg cursor-grab bg-white transition-colors ${colorClass}`}
      draggable
      onDragStart={onDragStart}
    >
      <div className="flex items-center gap-2">
        <span className={iconColor}>{node.icon}</span>
        <span className="text-sm font-medium text-gray-900">{node.label}</span>
      </div>
      <p className="text-xs text-gray-500 mt-1">{node.description}</p>
    </div>
  );
}

function NodeSection({ title, nodes, color }: { title: string; nodes: NodeDefinition[]; color: string }) {
  return (
    <div className="mb-6">
      <h3 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${color}`}>
        {title}
      </h3>
      <div className="space-y-2">
        {nodes.map((node) => (
          <DraggableNode key={node.nodeType} node={node} />
        ))}
      </div>
    </div>
  );
}

export default function NodeToolbar() {
  return (
    <div className="w-64 bg-gray-50 border-r border-gray-200 p-4 overflow-y-auto">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Nodes</h2>
      <p className="text-xs text-gray-500 mb-4">Drag nodes onto the canvas</p>

      <NodeSection title="Triggers" nodes={triggers} color="text-green-600" />
      <NodeSection title="Actions" nodes={actions} color="text-blue-600" />
      <NodeSection title="Logic" nodes={logic} color="text-amber-600" />
    </div>
  );
}
