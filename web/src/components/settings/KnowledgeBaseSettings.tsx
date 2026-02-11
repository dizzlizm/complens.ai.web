import { useRef, useState } from 'react';
import { BookOpen, Upload, Trash2, RefreshCw, FileText, Loader2, CheckCircle, AlertCircle, Clock, Eye } from 'lucide-react';
import { useKBDocuments, useKBStatus, useCreateKBDocument, useConfirmKBUpload, useDeleteKBDocument, useSyncKB } from '../../lib/hooks/useKnowledgeBase';
import DocumentContentModal from './DocumentContentModal';

interface KnowledgeBaseSettingsProps {
  workspaceId: string;
  siteId?: string;
}

const statusIcons: Record<string, React.ReactNode> = {
  indexed: <CheckCircle className="w-4 h-4 text-green-500" />,
  pending: <Clock className="w-4 h-4 text-yellow-500" />,
  processing: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
  failed: <AlertCircle className="w-4 h-4 text-red-500" />,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function KnowledgeBaseSettings({ workspaceId, siteId }: KnowledgeBaseSettingsProps) {
  const { data: documents = [], isLoading: loadingDocs } = useKBDocuments(workspaceId || undefined, siteId);
  const { data: status } = useKBStatus(workspaceId || undefined, siteId);
  const createDocument = useCreateKBDocument(workspaceId);
  const confirmUpload = useConfirmKBUpload(workspaceId);
  const deleteDocument = useDeleteKBDocument(workspaceId);
  const syncKB = useSyncKB(workspaceId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<{ id: string; name: string } | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const result = await createDocument.mutateAsync({
          name: file.name,
          content_type: file.type || 'application/octet-stream',
          file_size: file.size,
        });

        // Upload to presigned URL
        const uploadRes = await fetch(result.upload_url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });

        if (uploadRes.ok) {
          await confirmUpload.mutateAsync(result.id);
        }
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = (documentId: string) => {
    if (confirm('Delete this document?')) {
      deleteDocument.mutate(documentId);
    }
  };

  const handleSync = () => {
    syncKB.mutate();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Knowledge Base</h2>
              <p className="text-sm text-gray-500">Upload documents to give AI context about your business</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={syncKB.isPending}
              className="btn btn-secondary inline-flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${syncKB.isPending ? 'animate-spin' : ''}`} />
              Sync
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn btn-primary inline-flex items-center gap-2"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.txt,.md,.docx,.csv,.html"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Status summary */}
        {status && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-gray-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-gray-900">{status.total_documents}</p>
              <p className="text-xs text-gray-500">Total</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-green-700">{status.indexed}</p>
              <p className="text-xs text-green-600">Indexed</p>
            </div>
            <div className="p-3 bg-yellow-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-yellow-700">{status.pending + status.processing}</p>
              <p className="text-xs text-yellow-600">Processing</p>
            </div>
            <div className="p-3 bg-red-50 rounded-lg text-center">
              <p className="text-2xl font-bold text-red-700">{status.failed}</p>
              <p className="text-xs text-red-600">Failed</p>
            </div>
          </div>
        )}
      </div>

      {/* Document list */}
      <div className="card">
        <h3 className="font-medium text-gray-900 mb-4">Documents</h3>

        {loadingDocs ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No documents uploaded yet</p>
            <p className="text-sm text-gray-400 mt-1">
              Upload PDF, TXT, MD, DOCX, CSV, or HTML files
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg hover:bg-gray-50"
              >
                <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(doc.file_size)} &middot; {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {statusIcons[doc.status]}
                  <span className="text-xs text-gray-500 capitalize">{doc.status}</span>
                </div>
                {doc.status === 'indexed' && (
                  <button
                    onClick={() => setViewingDoc({ id: doc.id, name: doc.name })}
                    className="p-1.5 rounded text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                    title="View content"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Document content viewer/editor */}
      {viewingDoc && (
        <DocumentContentModal
          workspaceId={workspaceId}
          documentId={viewingDoc.id}
          documentName={viewingDoc.name}
          onClose={() => setViewingDoc(null)}
        />
      )}
    </div>
  );
}
