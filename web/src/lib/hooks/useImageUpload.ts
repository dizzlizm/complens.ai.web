import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import api from '../api';

interface UploadUrlResponse {
  upload_url: string;
  public_url: string;
  key: string;
}

interface UseImageUploadOptions {
  workspaceId: string;
  onSuccess?: (publicUrl: string) => void;
  onError?: (error: Error) => void;
  maxSizeMB?: number;
}

export function useImageUpload({ workspaceId, onSuccess, onError, maxSizeMB = 5 }: UseImageUploadOptions) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const getUploadUrl = useMutation({
    mutationFn: async (params: { filename: string; content_type: string }) => {
      const { data } = await api.post<UploadUrlResponse>(
        `/workspaces/${workspaceId}/pages/upload-url`,
        params
      );
      return data;
    },
  });

  const upload = useCallback(async (file: File): Promise<string | null> => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      const err = new Error('Please select an image file');
      onError?.(err);
      return null;
    }

    // Validate file size
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      const err = new Error(`Image must be under ${maxSizeMB}MB`);
      onError?.(err);
      return null;
    }

    setUploading(true);
    setProgress(0);

    try {
      // Step 1: Get presigned URL from our API
      const { upload_url, public_url } = await getUploadUrl.mutateAsync({
        filename: file.name,
        content_type: file.type,
      });

      setProgress(30);

      // Step 2: Upload directly to S3
      const uploadResponse = await fetch(upload_url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      setProgress(100);
      onSuccess?.(public_url);
      return public_url;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Upload failed');
      onError?.(error);
      return null;
    } finally {
      setUploading(false);
    }
  }, [workspaceId, maxSizeMB, onSuccess, onError, getUploadUrl]);

  const uploadFromInput = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      upload(file);
    }
    // Reset input so same file can be selected again
    event.target.value = '';
  }, [upload]);

  return {
    upload,
    uploadFromInput,
    uploading,
    progress,
  };
}
