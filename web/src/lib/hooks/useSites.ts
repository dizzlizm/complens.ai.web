import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import api from '../api';

export interface SitePrimaryPage {
  id: string;
  name: string;
  slug: string;
  status: string;
  subdomain?: string;
}

export interface Site {
  id: string;
  workspace_id: string;
  domain_name: string;
  name: string;
  description: string | null;
  settings: Record<string, unknown>;
  primary_page?: SitePrimaryPage;
  created_at: string;
  updated_at: string;
}

export interface CreateSiteInput {
  domain_name: string;
  name: string;
  description?: string;
  settings?: Record<string, unknown>;
}

export interface UpdateSiteInput {
  domain_name?: string;
  name?: string;
  description?: string;
  settings?: Record<string, unknown>;
}

// Fetch all sites for a workspace
export function useSites(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['sites', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<{ items: Site[] }>(
        `/workspaces/${workspaceId}/sites`
      );
      return data.items;
    },
    enabled: !!workspaceId,
  });
}

// Fetch a single site
export function useSite(workspaceId: string | undefined, siteId: string | undefined) {
  return useQuery({
    queryKey: ['site', workspaceId, siteId],
    queryFn: async () => {
      const { data } = await api.get<Site>(
        `/workspaces/${workspaceId}/sites/${siteId}`
      );
      return data;
    },
    enabled: !!workspaceId && !!siteId,
  });
}

// Get the current site from URL params
export function useCurrentSite(workspaceId: string | undefined) {
  const { siteId } = useParams<{ siteId: string }>();
  const query = useSite(workspaceId, siteId);
  return {
    ...query,
    siteId,
    site: query.data,
  };
}

// Create a new site
export function useCreateSite(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateSiteInput) => {
      const { data } = await api.post<Site>(
        `/workspaces/${workspaceId}/sites`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', workspaceId] });
    },
  });
}

// Update a site
export function useUpdateSite(workspaceId: string, siteId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateSiteInput) => {
      const { data } = await api.put<Site>(
        `/workspaces/${workspaceId}/sites/${siteId}`,
        input
      );
      return data;
    },
    onSuccess: (updatedSite) => {
      queryClient.setQueryData(['site', workspaceId, siteId], updatedSite);
      queryClient.invalidateQueries({ queryKey: ['sites', workspaceId] });
    },
  });
}

// Delete a site
export function useDeleteSite(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (siteId: string) => {
      await api.delete(`/workspaces/${workspaceId}/sites/${siteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', workspaceId] });
    },
  });
}

// Copy a site with all child entities
export function useCopySite(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ siteId, name }: { siteId: string; name?: string }) => {
      const { data } = await api.post<Site>(
        `/workspaces/${workspaceId}/sites/${siteId}/copy`,
        { name }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites', workspaceId] });
    },
  });
}
