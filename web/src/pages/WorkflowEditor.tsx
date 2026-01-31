import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Play, Settings } from 'lucide-react';
import WorkflowCanvas from '../components/workflow/WorkflowCanvas';
import NodeToolbar from '../components/workflow/NodeToolbar';

export default function WorkflowEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = id === 'new';

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col -m-6">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/workflows')}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <input
              type="text"
              defaultValue={isNew ? 'Untitled Workflow' : 'Welcome Sequence'}
              className="text-lg font-semibold text-gray-900 bg-transparent border-0 focus:ring-0 p-0"
            />
            <p className="text-sm text-gray-500">
              {isNew ? 'New workflow' : 'Last edited 5 minutes ago'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-secondary inline-flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Settings
          </button>
          <button className="btn btn-secondary inline-flex items-center gap-2">
            <Play className="w-4 h-4" />
            Test
          </button>
          <button className="btn btn-primary inline-flex items-center gap-2">
            <Save className="w-4 h-4" />
            Save
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <NodeToolbar />
        <div className="flex-1 bg-gray-100">
          <WorkflowCanvas workflowId={id} />
        </div>
      </div>
    </div>
  );
}
