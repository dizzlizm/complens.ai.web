import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export interface Workspace {
  id: string;
  agency_id: string;
  name: string;
  slug: string;
  settings: {
    timezone?: string;
    default_from_email?: string;
    default_from_phone?: string;
  };
  metadata?: Record<string, unknown>;
  is_active?: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkspaceInput {
  name: string;
  slug: string;
  settings?: Workspace['settings'];
  metadata?: Record<string, unknown>;
}

// Fetch all workspaces
export function useWorkspaces() {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const { data } = await api.get<{ items: Workspace[] }>('/workspaces');
      return data.items;
    },
  });
}

// Fetch a single workspace
export function useWorkspace(workspaceId: string) {
  return useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<Workspace>(`/workspaces/${workspaceId}`);
      return data;
    },
    enabled: !!workspaceId,
  });
}

// Create a new workspace
export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateWorkspaceInput) => {
      const { data } = await api.post<Workspace>('/workspaces', input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}

// Update a workspace
export function useUpdateWorkspace(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Partial<CreateWorkspaceInput>) => {
      const { data } = await api.put<Workspace>(`/workspaces/${workspaceId}`, input);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
    },
  });
}

// Hook to get current workspace from context/storage
export function useCurrentWorkspace() {
  const { data: workspaces, isLoading } = useWorkspaces();

  // For now, return the first workspace
  // TODO: Add workspace selector and persist selection
  const currentWorkspace = workspaces?.[0];

  return {
    workspace: currentWorkspace,
    workspaceId: currentWorkspace?.id,
    isLoading,
  };
}
