import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import api from '../api';

export interface Contact {
  id: string;
  workspace_id: string;
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  tags: string[];
  custom_fields: Record<string, unknown>;
  source?: string;
  status: string;
  total_messages_sent: number;
  total_messages_received: number;
  last_contacted_at?: string;
  last_response_at?: string;
  sms_opt_in: boolean;
  email_opt_in: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContactNote {
  id: string;
  workspace_id: string;
  contact_id: string;
  author_id: string;
  author_name: string;
  content: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface ActivityItem {
  type: 'conversation' | 'workflow_run' | 'form_submission' | 'note';
  summary: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface CreateContactInput {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
  source?: string;
  status?: string;
  sms_opt_in?: boolean;
  email_opt_in?: boolean;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ row: number; error: string }>;
}

// Fetch all contacts for a workspace
export function useContacts(workspaceId: string, options?: { limit?: number; cursor?: string }) {
  return useQuery({
    queryKey: ['contacts', workspaceId, options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.cursor) params.set('cursor', options.cursor);

      const { data } = await api.get<{ items: Contact[]; pagination?: { next_cursor?: string } }>(
        `/workspaces/${workspaceId}/contacts?${params}`
      );
      return { contacts: data.items, next_cursor: data.pagination?.next_cursor };
    },
    enabled: !!workspaceId,
  });
}

// Infinite query for paginated contacts
export function useInfiniteContacts(workspaceId: string, limit: number = 25) {
  return useInfiniteQuery({
    queryKey: ['contacts-infinite', workspaceId, limit],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      params.set('limit', limit.toString());
      if (pageParam) params.set('cursor', pageParam);

      const { data } = await api.get<{ items: Contact[]; pagination?: { next_cursor?: string } }>(
        `/workspaces/${workspaceId}/contacts?${params}`
      );
      return { contacts: data.items, next_cursor: data.pagination?.next_cursor };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    enabled: !!workspaceId,
  });
}

// Fetch a single contact
export function useContact(workspaceId: string, contactId: string) {
  return useQuery({
    queryKey: ['contact', workspaceId, contactId],
    queryFn: async () => {
      const { data } = await api.get<Contact>(
        `/workspaces/${workspaceId}/contacts/${contactId}`
      );
      return data;
    },
    enabled: !!workspaceId && !!contactId,
  });
}

// Create a new contact
export function useCreateContact(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateContactInput) => {
      const { data } = await api.post<Contact>(
        `/workspaces/${workspaceId}/contacts`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['contacts-infinite', workspaceId] });
    },
  });
}

// Update a contact
export function useUpdateContact(workspaceId: string, contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Partial<CreateContactInput>) => {
      const { data } = await api.put<Contact>(
        `/workspaces/${workspaceId}/contacts/${contactId}`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['contacts-infinite', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['contact', workspaceId, contactId] });
    },
  });
}

// Delete a contact
export function useDeleteContact(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (contactId: string) => {
      await api.delete(`/workspaces/${workspaceId}/contacts/${contactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['contacts-infinite', workspaceId] });
    },
  });
}

// Add tag to contact
export function useAddContactTag(workspaceId: string, contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tag: string) => {
      const { data } = await api.post<Contact>(
        `/workspaces/${workspaceId}/contacts/${contactId}/tags`,
        { tag }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', workspaceId, contactId] });
      queryClient.invalidateQueries({ queryKey: ['contacts', workspaceId] });
    },
  });
}

// ============================================================
// Contact Notes
// ============================================================

export function useContactNotes(workspaceId: string, contactId: string) {
  return useQuery({
    queryKey: ['contact-notes', workspaceId, contactId],
    queryFn: async () => {
      const { data } = await api.get<{ items: ContactNote[] }>(
        `/workspaces/${workspaceId}/contacts/${contactId}/notes`
      );
      return data.items;
    },
    enabled: !!workspaceId && !!contactId,
  });
}

export function useCreateContactNote(workspaceId: string, contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { content: string; pinned?: boolean }) => {
      const { data } = await api.post<ContactNote>(
        `/workspaces/${workspaceId}/contacts/${contactId}/notes`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', workspaceId, contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-activity', workspaceId, contactId] });
    },
  });
}

export function useDeleteContactNote(workspaceId: string, contactId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => {
      await api.delete(`/workspaces/${workspaceId}/contacts/${contactId}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact-notes', workspaceId, contactId] });
      queryClient.invalidateQueries({ queryKey: ['contact-activity', workspaceId, contactId] });
    },
  });
}

// ============================================================
// Contact Activity
// ============================================================

export function useContactActivity(workspaceId: string, contactId: string) {
  return useQuery({
    queryKey: ['contact-activity', workspaceId, contactId],
    queryFn: async () => {
      const { data } = await api.get<{ items: ActivityItem[] }>(
        `/workspaces/${workspaceId}/contacts/${contactId}/activity`
      );
      return data.items;
    },
    enabled: !!workspaceId && !!contactId,
  });
}

// ============================================================
// Import / Export
// ============================================================

export function useImportContacts(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { csv_data: string; mapping: Record<string, string> }) => {
      const { data } = await api.post<ImportResult>(
        `/workspaces/${workspaceId}/contacts/import`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['contacts-infinite', workspaceId] });
    },
  });
}

export function useExportContacts(workspaceId: string) {
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.get<{ csv_data: string; count: number }>(
        `/workspaces/${workspaceId}/contacts/export`
      );
      return data;
    },
  });
}
