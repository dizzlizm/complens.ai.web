import { useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { useImageUpload } from '../../../lib/hooks/useImageUpload';

interface ImageUploadButtonProps {
  workspaceId: string;
  onUploaded: (url: string) => void;
  label?: string;
  className?: string;
  accept?: string;
}

export default function ImageUploadButton({
  workspaceId,
  onUploaded,
  label = 'Upload',
  className = '',
  accept = 'image/*',
}: ImageUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const { uploadFromInput, uploading } = useImageUpload({
    workspaceId,
    onSuccess: onUploaded,
  });

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 ${className}`}
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
        {uploading ? 'Uploading...' : label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={uploadFromInput}
        className="hidden"
      />
    </>
  );
}
