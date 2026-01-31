import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  created_at: string;
  updated_at: string;
}

export interface CreateContactInput {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
  source?: string;
}

// Fetch all contacts for a workspace
export function useContacts(workspaceId: string, options?: { limit?: number; cursor?: string }) {
  return useQuery({
    queryKey: ['contacts', workspaceId, options],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.cursor) params.set('cursor', options.cursor);

      const { data } = await api.get<{ contacts: Contact[]; next_cursor?: string }>(
        `/workspaces/${workspaceId}/contacts?${params}`
      );
      return data;
    },
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
