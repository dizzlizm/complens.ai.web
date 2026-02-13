import { useRef, useState, useCallback } from 'react';
import { BookOpen, Upload, Trash2, RefreshCw, FileText, Loader2, CheckCircle, AlertCircle, Clock, Eye, Link2 } from 'lucide-react';
import { useKBDocuments, useKBStatus, useCreateKBDocument, useConfirmKBUpload, useDeleteKBDocument, useSyncKB, useImportKBUrl } from '../../lib/hooks/useKnowledgeBase';
import { useFormatDate } from '../../lib/hooks/useFormatDate';
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
  const { formatDate } = useFormatDate();
  const createDocument = useCreateKBDocument(workspaceId);
  const confirmUpload = useConfirmKBUpload(workspaceId);
  const deleteDocument = useDeleteKBDocument(workspaceId);
  const syncKB = useSyncKB(workspaceId);
  const importUrl = useImportKBUrl(workspaceId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [importUrlValue, setImportUrlValue] = useState('');
  const [viewingDoc, setViewingDoc] = useState<{ id: string; name: string } | null>(null);

  const uploadFiles = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const result = await createDocument.mutateAsync({
          name: file.name,
          content_type: file.type || 'application/octet-stream',
          file_size: file.size,
          site_id: siteId,
        });

        const uploadRes = await fetch(result.upload_url, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
        });

        if (uploadRes.ok) {
          await confirmUpload.mutateAsync(result.id);
        }
      }
    } catch {
      // Error state handled by mutation
    } finally {
      setUploading(false);
    }
  }, [createDocument, confirmUpload]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    await uploadFiles(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) uploadFiles(files);
  }, [uploadFiles]);

  const handleImportUrl = async () => {
    const url = importUrlValue.trim();
    if (!url) return;
    try {
      await importUrl.mutateAsync({ url, site_id: siteId });
      setImportUrlValue('');
    } catch {
      // Error handled by mutation state
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

      {/* Upload zone */}
      <div className="card">
        <h3 className="font-medium text-gray-900 mb-4">Add Documents</h3>

        {/* Drag and drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragging
              ? 'border-violet-400 bg-violet-50'
              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          {uploading ? (
            <Loader2 className="w-8 h-8 text-violet-500 animate-spin mx-auto mb-2" />
          ) : (
            <Upload className={`w-8 h-8 mx-auto mb-2 ${isDragging ? 'text-violet-500' : 'text-gray-400'}`} />
          )}
          <p className={`text-sm font-medium ${isDragging ? 'text-violet-600' : 'text-gray-600'}`}>
            {uploading ? 'Uploading...' : isDragging ? 'Drop files here' : 'Drag & drop files or click to upload'}
          </p>
          <p className="text-xs text-gray-400 mt-1">PDF, TXT, MD, DOCX, CSV, or HTML</p>
        </div>

        {/* URL import */}
        <div className="flex items-center gap-2 mt-4">
          <div className="relative flex-1">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="url"
              value={importUrlValue}
              onChange={(e) => setImportUrlValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleImportUrl()}
              placeholder="Import from URL..."
              className="input pl-9 w-full"
            />
          </div>
          <button
            onClick={handleImportUrl}
            disabled={!importUrlValue.trim() || importUrl.isPending}
            className="btn btn-secondary inline-flex items-center gap-2 whitespace-nowrap"
          >
            {importUrl.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Link2 className="w-4 h-4" />
            )}
            Import
          </button>
        </div>
        {importUrl.isError && (
          <p className="text-xs text-red-500 mt-1">Failed to import URL. Check the URL and try again.</p>
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
                    {formatFileSize(doc.file_size)} &middot; {formatDate(doc.created_at)}
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
