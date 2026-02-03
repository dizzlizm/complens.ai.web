import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export interface TeamMember {
  id: string;
  user_id: string;
  workspace_id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  status: 'active' | 'invited' | 'removed';
  invited_by?: string;
  created_at: string;
  updated_at: string;
}

export interface TeamInvitation {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  invited_by: string;
  invited_by_email: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export interface TeamData {
  members: TeamMember[];
  invitations: TeamInvitation[];
}

export function useTeamMembers(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['team', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<TeamData>(
        `/workspaces/${workspaceId}/team`
      );
      return data;
    },
    enabled: !!workspaceId,
  });
}

export function useInviteMember(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { email: string; role: string }) => {
      const { data } = await api.post(
        `/workspaces/${workspaceId}/team/invite`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', workspaceId] });
    },
  });
}

export function useUpdateRole(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const { data } = await api.put(
        `/workspaces/${workspaceId}/team/${userId}`,
        { role }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', workspaceId] });
    },
  });
}

export function useRemoveMember(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await api.delete(
        `/workspaces/${workspaceId}/team/${userId}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', workspaceId] });
    },
  });
}

export function useRevokeInvitation(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const { data } = await api.delete(
        `/workspaces/${workspaceId}/team/invitations/${encodeURIComponent(email)}`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team', workspaceId] });
    },
  });
}

export interface AcceptInviteResult {
  accepted: boolean;
  workspace_id: string;
  role?: string;
  already_member?: boolean;
}

export function useAcceptInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const { data } = await api.post<AcceptInviteResult>(
        '/team/accept-invite',
        { token }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
}
