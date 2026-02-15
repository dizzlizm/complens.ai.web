import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useCurrentWorkspace } from '../lib/hooks/useWorkspaces';
import { useSite, useUpdateSite } from '../lib/hooks/useSites';
import { useToast } from '../components/Toast';
import { Loader2, Bot, BookOpen, MessageCircle, Check, Copy, Code2 } from 'lucide-react';
import PillTabs from '../components/ui/PillTabs';
import BusinessProfileForm from '../components/settings/BusinessProfileForm';
import KnowledgeBaseSettings from '../components/settings/KnowledgeBaseSettings';

type AISettingsTab = 'profile' | 'knowledge-base' | 'chat-defaults';

const TABS: { id: AISettingsTab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'knowledge-base', label: 'Knowledge Base' },
  { id: 'chat-defaults', label: 'Chat Defaults' },
];

export default function SiteAISettings() {
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const { siteId } = useParams<{ siteId: string }>();
  const [activeTab, setActiveTab] = useState<AISettingsTab>('profile');

  if (isLoadingWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Bot className="w-7 h-7 text-indigo-600" />
          AI & Knowledge Base
        </h1>
        <p className="mt-1 text-gray-500">
          Configure your site's AI profile, knowledge base, and chat defaults. These settings apply across all pages in this site.
        </p>
      </div>

      <PillTabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'profile' && workspaceId && (
        <BusinessProfileForm
          workspaceId={workspaceId}
          siteId={siteId}
        />
      )}

      {activeTab === 'knowledge-base' && workspaceId && (
        <div className="space-y-6">
          <div>
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Knowledge Base
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Upload documents to give your AI chat widget relevant context about your business.
              Documents are scoped to this site and used by its AI chat widgets.
            </p>
          </div>
          <KnowledgeBaseSettings workspaceId={workspaceId} siteId={siteId} />
        </div>
      )}

      {activeTab === 'chat-defaults' && workspaceId && siteId && (
        <ChatDefaultsSection workspaceId={workspaceId} siteId={siteId} />
      )}
    </div>
  );
}

function ChatDefaultsSection({ workspaceId, siteId }: { workspaceId: string; siteId: string }) {
  const { data: site, isLoading } = useSite(workspaceId, siteId);
  const updateSite = useUpdateSite(workspaceId, siteId);
  const toast = useToast();

  const [chatEnabled, setChatEnabled] = useState(false);
  const [position, setPosition] = useState('bottom-right');
  const [initialMessage, setInitialMessage] = useState('');
  const [aiPersona, setAiPersona] = useState('');
  const [embedCopied, setEmbedCopied] = useState(false);

  // Sync local state from site settings
  useEffect(() => {
    if (!site) return;
    const s = site.settings || {};
    setChatEnabled(!!s.chat_enabled);
    setPosition((s.chat_position as string) || 'bottom-right');
    setInitialMessage((s.chat_initial_message as string) || '');
    setAiPersona((s.chat_ai_persona as string) || '');
  }, [site]);

  const handleSave = async () => {
    try {
      await updateSite.mutateAsync({
        settings: {
          ...(site?.settings || {}),
          chat_enabled: chatEnabled,
          chat_position: position,
          chat_initial_message: initialMessage,
          chat_ai_persona: aiPersona,
        },
      });
      toast.success('Chat settings saved');
    } catch {
      toast.error('Failed to save chat settings');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
      </div>
    );
  }

  const embedSnippet = `<script>
  window.ComplensChat = {
    siteId: "${siteId}",
    workspaceId: "${workspaceId}"
  };
</script>
<script src="${window.location.origin}/embed/chat-loader.js" async></script>`;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          Chat Defaults
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Enable a standalone chat widget for this site. No landing page required — just copy the embed code.
        </p>
      </div>

      <div className="card p-6 space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-700">Enable Chat Widget</label>
            <p className="text-xs text-gray-500 mt-0.5">
              Turn on to activate the chat widget and get an embed code
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={chatEnabled}
            onClick={() => setChatEnabled(!chatEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              chatEnabled ? 'bg-indigo-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                chatEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {chatEnabled && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Widget Position
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="bottom-right">Bottom Right</option>
                <option value="bottom-left">Bottom Left</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Initial Message
              </label>
              <input
                type="text"
                value={initialMessage}
                onChange={(e) => setInitialMessage(e.target.value)}
                placeholder="Hi! How can I help you today?"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                The first message visitors see when opening the chat widget
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                AI Persona
              </label>
              <textarea
                value={aiPersona}
                onChange={(e) => setAiPersona(e.target.value)}
                placeholder="You are a helpful assistant for our company. Be friendly and professional..."
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                Instructions that define how the AI chat assistant behaves
              </p>
            </div>
          </>
        )}

        {/* Save button */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={updateSite.isPending}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            {updateSite.isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            ) : (
              'Save Chat Settings'
            )}
          </button>
        </div>
      </div>

      {/* Embed code — shown when chat is enabled */}
      {chatEnabled && (
        <div className="card p-6 space-y-3">
          <h4 className="font-medium text-gray-900 flex items-center gap-2">
            <Code2 className="w-4 h-4" />
            Embed Code
          </h4>
          <p className="text-sm text-gray-500">
            Add this snippet to any website to show the chat widget. Save your settings first.
          </p>
          <div className="relative">
            <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {embedSnippet}
            </pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(embedSnippet);
                setEmbedCopied(true);
                setTimeout(() => setEmbedCopied(false), 2000);
              }}
              className="absolute top-2 right-2 p-1.5 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
              title="Copy to clipboard"
            >
              {embedCopied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
