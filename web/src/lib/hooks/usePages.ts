import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export interface ChatConfig {
  enabled: boolean;
  position: string;
  initial_message: string | null;
  ai_persona: string | null;
  business_context: Record<string, unknown>;
}

export interface Page {
  id: string;
  workspace_id: string;
  name: string;
  slug: string;
  status: 'draft' | 'published' | 'archived';
  headline: string;
  subheadline: string | null;
  hero_image_url: string | null;
  body_content: string | null;
  form_ids: string[];
  chat_config: ChatConfig;
  primary_color: string;
  theme: Record<string, unknown>;
  custom_css: string | null;
  meta_title: string | null;
  meta_description: string | null;
  og_image_url: string | null;
  subdomain: string | null;
  custom_domain: string | null;
  view_count: number;
  form_submission_count: number;
  chat_session_count: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePageInput {
  name: string;
  slug: string;
  headline?: string;
  subheadline?: string;
  hero_image_url?: string;
  body_content?: string;
  form_ids?: string[];
  chat_config?: Partial<ChatConfig>;
  primary_color?: string;
  meta_title?: string;
  meta_description?: string;
}

export interface UpdatePageInput {
  name?: string;
  slug?: string;
  status?: Page['status'];
  headline?: string;
  subheadline?: string;
  hero_image_url?: string;
  body_content?: string;
  form_ids?: string[];
  chat_config?: Partial<ChatConfig>;
  primary_color?: string;
  theme?: Record<string, unknown>;
  custom_css?: string;
  meta_title?: string;
  meta_description?: string;
  subdomain?: string;
  custom_domain?: string;
}

// Fetch all pages for a workspace
export function usePages(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['pages', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<{ items: Page[] }>(
        `/workspaces/${workspaceId}/pages`
      );
      return data.items;
    },
    enabled: !!workspaceId,
  });
}

// Fetch a single page
export function usePage(workspaceId: string | undefined, pageId: string | undefined) {
  return useQuery({
    queryKey: ['page', workspaceId, pageId],
    queryFn: async () => {
      const { data } = await api.get<Page>(
        `/workspaces/${workspaceId}/pages/${pageId}`
      );
      return data;
    },
    enabled: !!workspaceId && !!pageId,
  });
}

// Create a new page
export function useCreatePage(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePageInput) => {
      const { data } = await api.post<Page>(
        `/workspaces/${workspaceId}/pages`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages', workspaceId] });
    },
  });
}

// Update a page
export function useUpdatePage(workspaceId: string, pageId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdatePageInput) => {
      const { data } = await api.put<Page>(
        `/workspaces/${workspaceId}/pages/${pageId}`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['page', workspaceId, pageId] });
    },
  });
}

// Delete a page
export function useDeletePage(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pageId: string) => {
      await api.delete(`/workspaces/${workspaceId}/pages/${pageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages', workspaceId] });
    },
  });
}

// Generate page content from source material using AI
export interface GeneratePageInput {
  source_content: string;
  template?: 'professional' | 'bold' | 'minimal';
  target_audience?: string;
  call_to_action?: string;
  create_form?: boolean;
}

export interface PageTemplate {
  id: string;
  name: string;
  description: string;
  preview_color: string;
}

export interface GeneratedPage {
  name: string;
  slug: string;
  headline: string;
  subheadline: string | null;
  body_content: string;
  primary_color: string;
  meta_title: string | null;
  meta_description: string | null;
  chat_config: Partial<ChatConfig>;
  hero_image_url?: string;
  form_id?: string;
  form_ids?: string[];
  form?: {
    id: string;
    name: string;
    fields: Array<{
      name: string;
      label: string;
      type: string;
      required: boolean;
    }>;
  };
}

export function useGeneratePage(workspaceId: string) {
  return useMutation({
    mutationFn: async (input: GeneratePageInput) => {
      const { data } = await api.post<{ generated: GeneratedPage }>(
        `/workspaces/${workspaceId}/pages/generate`,
        input
      );
      return data.generated;
    },
  });
}

// Check subdomain availability
export interface SubdomainCheckResult {
  subdomain: string;
  available: boolean;
  reason?: 'invalid_format' | 'reserved' | 'taken';
  message?: string;
  url?: string;
}

export async function checkSubdomainAvailability(
  workspaceId: string,
  subdomain: string,
  excludePageId?: string
): Promise<SubdomainCheckResult> {
  const params = new URLSearchParams({ subdomain });
  if (excludePageId) {
    params.append('exclude_page_id', excludePageId);
  }
  const { data } = await api.get<SubdomainCheckResult>(
    `/workspaces/${workspaceId}/pages/check-subdomain?${params.toString()}`
  );
  return data;
}
