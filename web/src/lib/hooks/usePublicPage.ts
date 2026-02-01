import { useQuery, useMutation } from '@tanstack/react-query';
import publicApi from '../publicApi';
import type { ChatConfig } from './usePages';
import type { FormField } from './useForms';

export interface PublicPage {
  id: string;
  name: string;
  slug: string;
  status: string;
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
  created_at: string;
  updated_at: string;
}

export interface PublicForm {
  id: string;
  name: string;
  description: string | null;
  fields: FormField[];
  submit_button_text: string;
  success_message: string;
  redirect_url: string | null;
  honeypot_enabled: boolean;
  recaptcha_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface FormSubmissionResult {
  success: boolean;
  message: string;
  redirect_url: string | null;
  submission_id: string;
  contact_id: string | null;
}

// Fetch a public page by slug
export function usePublicPage(slug: string, workspaceId: string | null) {
  return useQuery({
    queryKey: ['public-page', slug, workspaceId],
    queryFn: async () => {
      const { data } = await publicApi.get<PublicPage>(
        `/public/pages/${slug}?ws=${workspaceId}`
      );
      return data;
    },
    enabled: !!slug && !!workspaceId,
  });
}

// Fetch a public form by ID
export function usePublicForm(formId: string, workspaceId: string | null) {
  return useQuery({
    queryKey: ['public-form', formId, workspaceId],
    queryFn: async () => {
      const { data } = await publicApi.get<PublicForm>(
        `/public/forms/${formId}?ws=${workspaceId}`
      );
      return data;
    },
    enabled: !!formId && !!workspaceId,
  });
}

// Submit a form from a page
export function useSubmitPageForm(pageId: string, workspaceId: string) {
  return useMutation({
    mutationFn: async ({
      formId,
      data,
    }: {
      formId: string;
      data: Record<string, string>;
    }) => {
      const response = await publicApi.post<FormSubmissionResult>(
        `/public/submit/page/${pageId}`,
        {
          form_id: formId,
          workspace_id: workspaceId,
          data,
        }
      );
      return response.data;
    },
  });
}

// Submit a form directly
export function useSubmitForm(formId: string, workspaceId: string) {
  return useMutation({
    mutationFn: async (data: Record<string, string>) => {
      const response = await publicApi.post<FormSubmissionResult>(
        `/public/submit/form/${formId}`,
        {
          form_id: formId,
          workspace_id: workspaceId,
          data,
        }
      );
      return response.data;
    },
  });
}
