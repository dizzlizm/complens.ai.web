import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ChatConfig } from '../../lib/hooks/usePages';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatWidgetProps {
  pageId?: string;
  siteId?: string;
  workspaceId: string;
  config: ChatConfig;
  primaryColor?: string;
  mode?: 'floating' | 'inline';  // 'floating' shows bubble button, 'inline' embeds directly
  title?: string;
  subtitle?: string;
}

const WS_URL = import.meta.env.VITE_WS_URL || '';

export default function ChatWidget({
  pageId,
  siteId,
  workspaceId,
  config,
  primaryColor = '#6366f1',
  mode = 'floating',
  title,
  subtitle,
}: ChatWidgetProps) {
  // For inline mode, chat is always "open"
  const [isOpen, setIsOpen] = useState(mode === 'inline');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const ws = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const visitorId = useRef<string>(getOrCreateVisitorId());
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const intentionalClose = useRef(false);

  // Notify parent frame (if embedded) when chat opens/closes
  const isEmbedded = window !== window.parent;

  const toggleChat = useCallback((open: boolean) => {
    setIsOpen(open);
    if (isEmbedded) {
      window.parent.postMessage(
        { type: open ? 'complens-chat-active' : 'complens-chat-inactive' },
        '*'
      );
    }
  }, [isEmbedded]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Track whether initial message has been shown
  const initialMessageShown = useRef(false);

  // Connect/reconnect WebSocket
  const connectWebSocket = useCallback(() => {
    if (!WS_URL) return;

    const params = new URLSearchParams({ workspace_id: workspaceId, visitor_id: visitorId.current });
    if (pageId) params.set('page_id', pageId);
    if (siteId) params.set('site_id', siteId);
    const wsUrl = `${WS_URL}/?${params.toString()}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      setIsConnected(true);
      reconnectAttempts.current = 0;

      // Add initial message if configured (only once)
      if (config.initial_message && !initialMessageShown.current) {
        initialMessageShown.current = true;
        setMessages([
          {
            id: 'initial',
            role: 'assistant',
            content: config.initial_message,
            timestamp: new Date(),
          },
        ]);
      }
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.action === 'ai_response') {
        setIsTyping(false);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: data.message,
            timestamp: new Date(),
          },
        ]);
      } else if (data.action === 'typing') {
        setIsTyping(true);
      }
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      // Auto-reconnect unless we intentionally closed
      if (!intentionalClose.current) {
        const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 10000);
        reconnectAttempts.current += 1;
        reconnectTimer.current = setTimeout(connectWebSocket, delay);
      }
    };

    ws.current.onerror = () => {
      // onclose will fire after onerror, which handles reconnection
    };
  }, [pageId, siteId, workspaceId, config.initial_message]);

  // Manage WebSocket lifecycle based on chat open/close state
  useEffect(() => {
    if (!isOpen || !WS_URL) return;

    intentionalClose.current = false;
    reconnectAttempts.current = 0;
    connectWebSocket();

    // Keepalive ping every 30s to prevent API Gateway 10-min idle timeout
    const pingInterval = setInterval(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ action: 'ping' }));
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      intentionalClose.current = true;
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
      ws.current?.close();
    };
  }, [isOpen, connectWebSocket]);

  // Allow sending if connected or if we're reconnecting (message will queue)
  const canSend = isConnected || reconnectAttempts.current < 3;

  const sendMessage = () => {
    if (!inputValue.trim() || !ws.current || ws.current.readyState !== WebSocket.OPEN) return;

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date(),
    };

    // Add to local messages
    setMessages((prev) => [...prev, message]);

    // Send to WebSocket
    const payload: Record<string, string> = {
      action: 'public_chat',
      message: inputValue.trim(),
      workspace_id: workspaceId,
      visitor_id: visitorId.current,
    };
    if (pageId) payload.page_id = pageId;
    if (siteId) payload.site_id = siteId;
    ws.current.send(JSON.stringify(payload));

    setInputValue('');
    setIsTyping(true);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const position = config.position || 'bottom-right';
  const positionClasses =
    position === 'bottom-left' ? 'left-4' : 'right-4';

  // Inline mode - renders chat directly embedded in the page
  if (mode === 'inline') {
    return (
      <div className="w-full max-w-2xl mx-auto bg-white rounded-2xl shadow-lg overflow-hidden">
        {/* Header with title/subtitle */}
        {(title || subtitle) && (
          <div className="text-center py-6 px-4 border-b border-gray-100">
            {title && <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>}
            {subtitle && <p className="text-gray-600">{subtitle}</p>}
          </div>
        )}

        {/* Chat header bar */}
        <div
          className="px-4 py-3 text-white font-medium flex items-center justify-between"
          style={{ backgroundColor: primaryColor }}
        >
          <span>Chat with us</span>
          <div className="flex items-center gap-2">
            {isConnected && (
              <span className="w-2 h-2 bg-green-400 rounded-full" title="Connected" />
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="h-80 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] px-4 py-2 rounded-lg ${
                  msg.role === 'user'
                    ? 'text-white'
                    : 'bg-white text-gray-800 shadow-sm'
                }`}
                style={
                  msg.role === 'user'
                    ? { backgroundColor: primaryColor }
                    : undefined
                }
              >
                {msg.role === 'assistant' ? (
                  <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-1.5">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white px-4 py-2 rounded-lg shadow-sm">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <span
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: '0.1s' }}
                  />
                  <span
                    className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: '0.2s' }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t p-4 bg-white">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
              disabled={!canSend}
            />
            <button
              onClick={sendMessage}
              disabled={!inputValue.trim() || !canSend}
              className="px-4 py-3 rounded-xl text-white font-medium disabled:opacity-50 transition-colors"
              style={{ backgroundColor: primaryColor }}
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Floating mode - renders bubble button + popup
  return (
    <>
      {/* Chat bubble button */}
      <button
        onClick={() => toggleChat(!isOpen)}
        className={`fixed bottom-4 ${positionClasses} w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-110 z-50`}
        style={{ backgroundColor: primaryColor }}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        {isOpen ? (
          <svg
            className="w-6 h-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="w-6 h-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        )}
      </button>

      {/* Chat window */}
      {isOpen && (
        <div
          className={`fixed bottom-20 ${positionClasses} w-96 max-w-[calc(100vw-2rem)] h-[500px] max-h-[calc(100vh-6rem)] bg-white rounded-lg shadow-2xl flex flex-col z-50 overflow-hidden`}
        >
          {/* Header */}
          <div
            className="px-4 py-3 text-white font-medium flex items-center justify-between"
            style={{ backgroundColor: primaryColor }}
          >
            <span>Chat with us</span>
            <div className="flex items-center gap-2">
              {isConnected && (
                <span className="w-2 h-2 bg-green-400 rounded-full" />
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2 rounded-lg ${
                    msg.role === 'user'
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                  style={
                    msg.role === 'user'
                      ? { backgroundColor: primaryColor }
                      : undefined
                  }
                >
                  {msg.role === 'assistant' ? (
                  <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-1.5">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-4 py-2 rounded-lg">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <span
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0.1s' }}
                    />
                    <span
                      className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: '0.2s' }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': primaryColor } as React.CSSProperties}
                disabled={!isConnected}
              />
              <button
                onClick={sendMessage}
                disabled={!inputValue.trim() || !isConnected}
                className="px-4 py-2 rounded-lg text-white font-medium disabled:opacity-50 transition-colors"
                style={{ backgroundColor: primaryColor }}
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function getOrCreateVisitorId(): string {
  const key = 'complens_visitor_id';
  let visitorId = localStorage.getItem(key);

  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem(key, visitorId);
  }

  return visitorId;
}
