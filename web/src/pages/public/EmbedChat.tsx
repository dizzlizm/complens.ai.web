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

  // Make the iframe content fully transparent so only the chat bubble/popup shows
  useEffect(() => {
    document.documentElement.style.backgroundColor = 'transparent';
    document.body.style.backgroundColor = 'transparent';
  }, []);

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
    return null; // Don't show anything while loading — iframe should be invisible
  }

  if (error || !config || !pageId || !workspaceId) {
    return null; // Don't show error UI in the iframe — just hide
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
