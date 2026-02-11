import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useCurrentWorkspace } from '../lib/hooks/useWorkspaces';
import { Loader2, Bot, BookOpen, MessageCircle } from 'lucide-react';
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
              Documents are shared across your entire workspace.
            </p>
          </div>
          <KnowledgeBaseSettings workspaceId={workspaceId} />
        </div>
      )}

      {activeTab === 'chat-defaults' && (
        <ChatDefaultsSection />
      )}
    </div>
  );
}

function ChatDefaultsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium text-gray-900 flex items-center gap-2">
          <MessageCircle className="w-5 h-5" />
          Chat Defaults
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          Set default chat widget settings for all pages in this site. Individual pages can override these.
        </p>
      </div>

      <div className="card p-6 space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            Chat defaults are inherited by all pages in this site. To override settings for a specific page,
            configure the chat widget in that page's editor.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Widget Position
          </label>
          <select
            defaultValue="bottom-right"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="bottom-right">Bottom Right</option>
            <option value="bottom-left">Bottom Left</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Default Initial Message
          </label>
          <input
            type="text"
            defaultValue=""
            placeholder="Hi! How can I help you today?"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            The first message visitors see when opening the chat widget
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Default AI Persona
          </label>
          <textarea
            defaultValue=""
            placeholder="You are a helpful assistant for our company. Be friendly and professional..."
            rows={4}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Instructions that define how the AI chat assistant behaves
          </p>
        </div>
      </div>
    </div>
  );
}
