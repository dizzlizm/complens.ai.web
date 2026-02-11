import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2, Save } from 'lucide-react';
import Modal from '../ui/Modal';
import { useKBDocumentContent, useUpdateKBDocumentContent } from '../../lib/hooks/useKnowledgeBase';

interface DocumentContentModalProps {
  workspaceId: string;
  documentId: string;
  documentName: string;
  onClose: () => void;
}

type Tab = 'preview' | 'edit';

export default function DocumentContentModal({
  workspaceId,
  documentId,
  documentName,
  onClose,
}: DocumentContentModalProps) {
  const { data, isLoading } = useKBDocumentContent(workspaceId, documentId);
  const updateContent = useUpdateKBDocumentContent(workspaceId);
  const [activeTab, setActiveTab] = useState<Tab>('preview');
  const [editedContent, setEditedContent] = useState('');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (data?.content) {
      setEditedContent(data.content);
    }
  }, [data?.content]);

  const handleContentChange = (value: string) => {
    setEditedContent(value);
    setHasChanges(value !== data?.content);
  };

  const handleSave = () => {
    updateContent.mutate(
      { documentId, content: editedContent },
      {
        onSuccess: () => {
          setHasChanges(false);
        },
      }
    );
  };

  const handleClose = () => {
    if (hasChanges) {
      if (!confirm('You have unsaved changes. Discard them?')) return;
    }
    onClose();
  };

  return (
    <Modal isOpen onClose={handleClose} title={documentName} size="4xl">
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col" style={{ height: '70vh' }}>
          {/* Tabs */}
          <div className="flex items-center justify-between border-b border-gray-200 mb-4">
            <div className="flex gap-4">
              <button
                onClick={() => setActiveTab('preview')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'preview'
                    ? 'border-violet-600 text-violet-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Preview
              </button>
              <button
                onClick={() => setActiveTab('edit')}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'edit'
                    ? 'border-violet-600 text-violet-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Edit
              </button>
            </div>
            {activeTab === 'edit' && (
              <button
                onClick={handleSave}
                disabled={!hasChanges || updateContent.isPending}
                className="btn btn-primary inline-flex items-center gap-2 text-sm mb-2"
              >
                {updateContent.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {updateContent.isPending ? 'Saving...' : 'Save'}
              </button>
            )}
          </div>

          {/* Content */}
          {activeTab === 'preview' ? (
            <div className="flex-1 overflow-y-auto prose prose-sm max-w-none">
              <ReactMarkdown>{editedContent || ''}</ReactMarkdown>
            </div>
          ) : (
            <textarea
              value={editedContent}
              onChange={(e) => handleContentChange(e.target.value)}
              className="flex-1 w-full font-mono text-sm p-4 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              spellCheck={false}
            />
          )}
        </div>
      )}
    </Modal>
  );
}
