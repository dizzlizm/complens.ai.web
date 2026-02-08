import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

const WORKSPACE_STORAGE_KEY = 'complens_current_workspace';

export interface WorkspaceNotificationSettings {
  email_form_submissions?: boolean;
  email_workflow_errors?: boolean;
  email_weekly_digest?: boolean;
  email_new_contacts?: boolean;
}

export interface WorkspaceSettings {
  timezone?: string;
  default_from_email?: string;
  default_from_phone?: string;
  from_name?: string;
  reply_to?: string;
  notifications?: WorkspaceNotificationSettings;
}

export interface Workspace {
  id: string;
  agency_id: string;
  name: string;
  slug: string;
  settings: WorkspaceSettings;
  metadata?: Record<string, unknown>;
  is_active?: boolean;
  notification_email?: string;
  from_email?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateWorkspaceInput {
  name: string;
  slug?: string;
  settings?: Partial<WorkspaceSettings>;
  metadata?: Record<string, unknown>;
  notification_email?: string;
  from_email?: string;
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

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(WORKSPACE_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const setCurrentWorkspaceId = useCallback((id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
    } catch {
      // localStorage unavailable
    }
  }, []);

  // Find workspace by stored ID, fall back to first
  const currentWorkspace =
    (selectedId && workspaces?.find((ws) => ws.id === selectedId)) ||
    workspaces?.[0] ||
    undefined;

  return {
    workspace: currentWorkspace,
    workspaceId: currentWorkspace?.id,
    workspaces,
    isLoading,
    setCurrentWorkspaceId,
  };
}
