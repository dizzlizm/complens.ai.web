import { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Mail,
  Phone,
  Globe,
  Search,
  Send,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  useCurrentWorkspace,
  useConversations,
  useConversationMessages,
  useSendMessage,
  type ConversationStatus,
  type ConversationChannel,
  type Message,
} from '../lib/hooks';

const channelIcons: Record<ConversationChannel, typeof MessageSquare> = {
  sms: Phone,
  email: Mail,
  webchat: MessageSquare,
  whatsapp: Globe,
};

const statusTabs: { label: string; value: ConversationStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Open', value: 'open' },
  { label: 'Closed', value: 'closed' },
];

export default function Conversations() {
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: conversations, isLoading } = useConversations(workspaceId, statusFilter);
  const { data: messages, isLoading: isLoadingMessages } = useConversationMessages(selectedId || undefined);
  const sendMessage = useSendMessage(selectedId || '');

  const selectedConversation = conversations?.find((c) => c.id === selectedId);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Filter conversations by search
  const filteredConversations = conversations?.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.subject?.toLowerCase().includes(q) ||
      c.last_message_preview?.toLowerCase().includes(q) ||
      c.contact_id.toLowerCase().includes(q)
    );
  }) || [];

  const handleSend = async () => {
    if (!messageText.trim() || !selectedId) return;
    const text = messageText.trim();
    setMessageText('');
    try {
      await sendMessage.mutateAsync({ content: text });
    } catch {
      setMessageText(text); // Restore on failure
    }
  };

  if (isLoadingWorkspace) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Left Panel - Conversation List */}
      <div className="w-80 border-r border-gray-200 flex flex-col shrink-0">
        {/* Search */}
        <div className="p-3 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex border-b border-gray-200">
          {statusTabs.map((tab) => (
            <button
              key={tab.label}
              onClick={() => setStatusFilter(tab.value)}
              className={`flex-1 px-3 py-2 text-xs font-medium text-center border-b-2 transition-colors ${
                statusFilter === tab.value
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12 px-4">
              <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">No conversations</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const ChannelIcon = channelIcons[conv.channel] || MessageSquare;
              const isSelected = conv.id === selectedId;
              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedId(conv.id)}
                  className={`w-full px-4 py-3 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                    isSelected ? 'bg-indigo-50 border-l-2 border-l-indigo-600' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                      <ChannelIcon className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {conv.subject || `${conv.channel} conversation`}
                        </span>
                        {conv.unread_count > 0 && (
                          <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-xs font-medium">
                            {conv.unread_count}
                          </span>
                        )}
                      </div>
                      {conv.last_message_preview && (
                        <p className="text-xs text-gray-500 truncate mt-0.5">{conv.last_message_preview}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                          conv.status === 'open' ? 'bg-green-400' : conv.status === 'closed' ? 'bg-gray-300' : 'bg-yellow-400'
                        }`} />
                        <span className="text-xs text-gray-400">
                          {conv.last_message_at
                            ? formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true })
                            : 'No messages'}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Panel - Message Thread */}
      <div className="flex-1 flex flex-col">
        {selectedConversation ? (
          <>
            {/* Thread Header */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                  {(() => {
                    const Icon = channelIcons[selectedConversation.channel] || MessageSquare;
                    return <Icon className="w-4 h-4 text-gray-500" />;
                  })()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {selectedConversation.subject || `${selectedConversation.channel} conversation`}
                  </p>
                  <p className="text-xs text-gray-500">
                    Contact: {selectedConversation.contact_id}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  selectedConversation.status === 'open'
                    ? 'bg-green-100 text-green-700'
                    : selectedConversation.status === 'closed'
                    ? 'bg-gray-100 text-gray-600'
                    : 'bg-yellow-100 text-yellow-700'
                }`}>
                  {selectedConversation.status}
                </span>
                {selectedConversation.ai_enabled && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-700">
                    <Sparkles className="w-3 h-3" />
                    AI
                  </span>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {isLoadingMessages ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
                </div>
              ) : !messages || messages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No messages yet</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Compose */}
            <div className="px-4 py-3 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Type a message..."
                  className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleSend}
                  disabled={!messageText.trim() || sendMessage.isPending}
                  className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendMessage.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-center px-8">
            <div>
              <MessageSquare className="w-16 h-16 text-gray-200 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-500 mb-1">Select a conversation</h3>
              <p className="text-sm text-gray-400">
                Choose a conversation from the list to view messages
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isOutbound = message.direction === 'outbound';
  const isAI = message.sender_type === 'ai';

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 ${
          isOutbound
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-900 rounded-bl-sm'
        }`}
      >
        {isAI && (
          <div className={`flex items-center gap-1 mb-1 text-xs ${isOutbound ? 'text-indigo-200' : 'text-purple-500'}`}>
            <Sparkles className="w-3 h-3" />
            AI generated
          </div>
        )}
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <p className={`text-xs mt-1 ${isOutbound ? 'text-indigo-200' : 'text-gray-400'}`}>
          {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}
