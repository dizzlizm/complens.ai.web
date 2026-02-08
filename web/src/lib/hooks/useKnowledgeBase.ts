import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export interface KBDocument {
  id: string;
  workspace_id: string;
  name: string;
  file_key: string;
  file_size: number;
  content_type: string;
  status: 'pending' | 'processing' | 'indexed' | 'failed';
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface KBStatus {
  total_documents: number;
  indexed: number;
  pending: number;
  processing: number;
  failed: number;
}

export interface CreateDocumentInput {
  name: string;
  content_type: string;
  file_size: number;
}

export interface CreateDocumentResult extends KBDocument {
  upload_url: string;
}

export function useKBDocuments(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['kb-documents', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<{ items: KBDocument[] }>(
        `/workspaces/${workspaceId}/knowledge-base/documents`
      );
      return data.items;
    },
    enabled: !!workspaceId,
  });
}

export function useKBStatus(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['kb-status', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<KBStatus>(
        `/workspaces/${workspaceId}/knowledge-base/status`
      );
      return data;
    },
    enabled: !!workspaceId,
  });
}

export function useCreateKBDocument(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDocumentInput) => {
      const { data } = await api.post<CreateDocumentResult>(
        `/workspaces/${workspaceId}/knowledge-base/documents`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-documents', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['kb-status', workspaceId] });
    },
  });
}

export function useConfirmKBUpload(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      const { data } = await api.post<KBDocument>(
        `/workspaces/${workspaceId}/knowledge-base/documents/${documentId}/confirm-upload`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-documents', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['kb-status', workspaceId] });
    },
  });
}

export interface KBDocumentContent {
  document_id: string;
  name: string;
  content: string;
  status: string;
}

export function useKBDocumentContent(workspaceId: string | undefined, documentId: string | undefined) {
  return useQuery({
    queryKey: ['kb-document-content', workspaceId, documentId],
    queryFn: async () => {
      const { data } = await api.get<KBDocumentContent>(
        `/workspaces/${workspaceId}/knowledge-base/documents/${documentId}/content`
      );
      return data;
    },
    enabled: !!workspaceId && !!documentId,
  });
}

export function useUpdateKBDocumentContent(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ documentId, content }: { documentId: string; content: string }) => {
      const { data } = await api.put(
        `/workspaces/${workspaceId}/knowledge-base/documents/${documentId}/content`,
        { content }
      );
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['kb-document-content', workspaceId, variables.documentId] });
      queryClient.invalidateQueries({ queryKey: ['kb-documents', workspaceId] });
    },
  });
}

export function useDeleteKBDocument(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (documentId: string) => {
      await api.delete(`/workspaces/${workspaceId}/knowledge-base/documents/${documentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-documents', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['kb-status', workspaceId] });
    },
  });
}

export function useSyncKB(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/workspaces/${workspaceId}/knowledge-base/sync`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-status', workspaceId] });
    },
  });
}
