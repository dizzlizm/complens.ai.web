import { useNavigate } from 'react-router-dom';
import { useCurrentWorkspace, useListDomains } from '../lib/hooks';
import { Loader2, Mail, Globe, Check, Clock, AlertTriangle, ArrowRight } from 'lucide-react';
import EmailIdentity from '../components/email/EmailIdentity';

export default function SiteEmail() {
  const navigate = useNavigate();
  const { workspaceId, isLoading: isLoadingWorkspace } = useCurrentWorkspace();

  if (isLoadingWorkspace) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Mail className="w-7 h-7 text-primary-600" />
          Email
        </h1>
        <p className="mt-1 text-gray-500">
          Configure sender identity for this site's emails. Domain verification is managed in global settings.
        </p>
      </div>

      <EmailIdentity
        workspaceId={workspaceId}
        onNavigateToDomains={() => navigate('/settings?section=domains')}
      />

      <DomainStatusCard workspaceId={workspaceId} />
    </div>
  );
}

function DomainStatusCard({ workspaceId }: { workspaceId: string | undefined }) {
  const navigate = useNavigate();
  const { data: savedDomainsData, isLoading } = useListDomains(workspaceId);
  const savedDomains = savedDomainsData?.items || [];

  if (isLoading) {
    return (
      <div className="card flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Domain Status</h2>
          <p className="text-sm text-gray-500">Verified domains available for sending</p>
        </div>
        <button
          onClick={() => navigate('/settings?section=domains')}
          className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
        >
          Manage Domains
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {savedDomains.length === 0 ? (
        <div className="p-6 bg-gray-50 rounded-lg border border-dashed border-gray-300 text-center">
          <Globe className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="font-medium text-gray-700">No domains configured</p>
          <p className="text-sm text-gray-500 mt-1">
            Add a domain in Settings to start sending emails from your own address.
          </p>
          <button
            onClick={() => navigate('/settings?section=domains')}
            className="btn btn-primary btn-sm mt-3"
          >
            Set Up Domain
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {savedDomains.map((domain) => (
            <div
              key={domain.domain}
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-gray-400" />
                <span className="font-medium text-gray-900">{domain.domain}</span>
              </div>
              {domain.ready ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                  <Check className="w-3 h-3" />
                  Verified
                </span>
              ) : domain.verified ? (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  <Clock className="w-3 h-3" />
                  DKIM Pending
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  Pending
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
