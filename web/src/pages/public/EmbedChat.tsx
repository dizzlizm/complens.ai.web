import { useSearchParams } from 'react-router-dom';
import { useState, useEffect } from 'react';
import ChatWidget from '../../components/public/ChatWidget';
import type { ChatConfig } from '../../lib/hooks/usePages';
import publicApi from '../../lib/publicApi';

interface EmbedConfig {
  page_id: string;
  workspace_id: string;
  chat_config: ChatConfig;
  primary_color: string;
  page_name: string;
  ws_url: string;
}

export default function EmbedChat() {
  const [searchParams] = useSearchParams();
  const pageId = searchParams.get('page_id');
  const workspaceId = searchParams.get('ws');

  const [config, setConfig] = useState<EmbedConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pageId || !workspaceId) {
      setError('Missing page_id or ws parameter');
      setLoading(false);
      return;
    }

    publicApi
      .get<EmbedConfig>(`/public/chat-config/${pageId}?ws=${workspaceId}`)
      .then((res) => {
        setConfig(res.data);
        setLoading(false);
      })
      .catch(() => {
        setError('Chat is not available');
        setLoading(false);
      });
  }, [pageId, workspaceId]);

  // Notify parent frame of size changes for auto-resizing
  useEffect(() => {
    if (!config) return;

    const sendHeight = () => {
      window.parent.postMessage(
        { type: 'complens-chat-resize', height: document.body.scrollHeight },
        '*'
      );
    };

    const observer = new MutationObserver(sendHeight);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    sendHeight();

    return () => observer.disconnect();
  }, [config]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-transparent">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400" />
      </div>
    );
  }

  if (error || !config || !pageId || !workspaceId) {
    return (
      <div className="flex items-center justify-center h-screen bg-transparent">
        <p className="text-gray-500 text-sm">{error || 'Chat unavailable'}</p>
      </div>
    );
  }

  return (
    <div className="bg-transparent">
      <ChatWidget
        pageId={pageId}
        workspaceId={workspaceId}
        config={config.chat_config}
        primaryColor={config.primary_color}
        mode="floating"
      />
    </div>
  );
}
