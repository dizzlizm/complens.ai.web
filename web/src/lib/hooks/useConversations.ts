import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export type ConversationStatus = 'open' | 'closed' | 'archived';
export type ConversationChannel = 'sms' | 'email' | 'webchat' | 'whatsapp';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageSenderType = 'contact' | 'user' | 'ai' | 'system';

export interface Conversation {
  id: string;
  workspace_id: string;
  contact_id: string;
  channel: ConversationChannel;
  status: ConversationStatus;
  subject?: string;
  last_message_at?: string;
  last_message_preview?: string;
  message_count: number;
  unread_count: number;
  ai_enabled: boolean;
  assigned_user_id?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  content: string;
  content_type: string;
  direction: MessageDirection;
  channel: ConversationChannel;
  sender_type: MessageSenderType;
  sender_id?: string;
  status: string;
  ai_generated?: boolean;
  created_at: string;
}

export function useConversations(workspaceId: string | undefined, status?: ConversationStatus) {
  return useQuery({
    queryKey: ['conversations', workspaceId, status],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      const qs = params.toString();
      const { data } = await api.get<{ items: Conversation[] }>(
        `/workspaces/${workspaceId}/conversations${qs ? `?${qs}` : ''}`
      );
      return data.items;
    },
    enabled: !!workspaceId,
  });
}

export function useConversation(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      const { data } = await api.get<Conversation>(
        `/conversations/${conversationId}`
      );
      return data;
    },
    enabled: !!conversationId,
  });
}

export function useConversationMessages(conversationId: string | undefined) {
  return useQuery({
    queryKey: ['conversation-messages', conversationId],
    queryFn: async () => {
      const { data } = await api.get<{ items: Message[] }>(
        `/conversations/${conversationId}/messages`
      );
      return data.items;
    },
    enabled: !!conversationId,
    refetchInterval: 10000,
  });
}

export function useCreateConversation(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { contact_id: string; channel: ConversationChannel; subject?: string }) => {
      const { data } = await api.post<Conversation>(
        `/workspaces/${workspaceId}/contacts/${input.contact_id}/conversations`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations', workspaceId] });
    },
  });
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { content: string }) => {
      const { data } = await api.post<Message>(
        `/conversations/${conversationId}/messages`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation-messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}
