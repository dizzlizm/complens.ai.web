import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../api';

export interface FormField {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'date' | 'number' | 'hidden';
  required: boolean;
  placeholder: string | null;
  options: string[];
  validation_pattern: string | null;
  default_value: string | null;
  map_to_contact_field: string | null;
}

export interface Form {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  fields: FormField[];
  submit_button_text: string;
  success_message: string;
  redirect_url: string | null;
  create_contact: boolean;
  add_tags: string[];
  trigger_workflow: boolean;
  honeypot_enabled: boolean;
  recaptcha_enabled: boolean;
  submission_count: number;
  created_at: string;
  updated_at: string;
}

export interface FormSubmission {
  id: string;
  workspace_id: string;
  form_id: string;
  page_id: string | null;
  contact_id: string | null;
  data: Record<string, string>;
  visitor_ip: string | null;
  visitor_user_agent: string | null;
  referrer: string | null;
  workflow_triggered: boolean;
  workflow_run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateFormInput {
  name: string;
  description?: string;
  fields?: FormField[];
  submit_button_text?: string;
  success_message?: string;
  redirect_url?: string;
  create_contact?: boolean;
  add_tags?: string[];
  trigger_workflow?: boolean;
  honeypot_enabled?: boolean;
}

export interface UpdateFormInput {
  name?: string;
  description?: string;
  fields?: FormField[];
  submit_button_text?: string;
  success_message?: string;
  redirect_url?: string;
  create_contact?: boolean;
  add_tags?: string[];
  trigger_workflow?: boolean;
  honeypot_enabled?: boolean;
  recaptcha_enabled?: boolean;
}

// Fetch all forms for a workspace
export function useForms(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['forms', workspaceId],
    queryFn: async () => {
      const { data } = await api.get<{ items: Form[] }>(
        `/workspaces/${workspaceId}/forms`
      );
      return data.items;
    },
    enabled: !!workspaceId,
  });
}

// Fetch a single form
export function useForm(workspaceId: string | undefined, formId: string | undefined) {
  return useQuery({
    queryKey: ['form', workspaceId, formId],
    queryFn: async () => {
      const { data } = await api.get<Form>(
        `/workspaces/${workspaceId}/forms/${formId}`
      );
      return data;
    },
    enabled: !!workspaceId && !!formId,
  });
}

// Fetch form submissions
export function useFormSubmissions(workspaceId: string | undefined, formId: string | undefined) {
  return useQuery({
    queryKey: ['form-submissions', workspaceId, formId],
    queryFn: async () => {
      const { data } = await api.get<{ items: FormSubmission[] }>(
        `/workspaces/${workspaceId}/forms/${formId}/submissions`
      );
      return data.items;
    },
    enabled: !!workspaceId && !!formId,
  });
}

// Create a new form
export function useCreateForm(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateFormInput) => {
      const { data } = await api.post<Form>(
        `/workspaces/${workspaceId}/forms`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms', workspaceId] });
    },
  });
}

// Update a form
export function useUpdateForm(workspaceId: string, formId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateFormInput) => {
      const { data } = await api.put<Form>(
        `/workspaces/${workspaceId}/forms/${formId}`,
        input
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['form', workspaceId, formId] });
    },
  });
}

// Delete a form
export function useDeleteForm(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formId: string) => {
      await api.delete(`/workspaces/${workspaceId}/forms/${formId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forms', workspaceId] });
    },
  });
}
