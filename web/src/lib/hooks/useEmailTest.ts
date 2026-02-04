import { useMutation } from '@tanstack/react-query';
import api from '../api';

export interface SendTestEmailInput {
  to_email: string;
  subject: string;
  body_html: string;
}

export interface TestEmailResult {
  success: boolean;
  message: string;
  message_id?: string;
}

export function useSendTestEmail(workspaceId: string, workflowId: string) {
  return useMutation({
    mutationFn: async (input: SendTestEmailInput) => {
      const { data } = await api.post<TestEmailResult>(
        `/workspaces/${workspaceId}/workflows/${workflowId}/test-email`,
        input
      );
      return data;
    },
  });
}
