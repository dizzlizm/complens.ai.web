import { useState, useEffect } from 'react';
import { checkSubdomainAvailability, type ChatConfig } from '../../lib/hooks/usePages';
import { Check, ChevronDown, ChevronRight, Code2, Copy, ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import CustomDomainSection from '../domains/CustomDomainSection';

// Extract subdomain suffix from API URL (e.g., "dev.complens.ai" from "https://api.dev.complens.ai")
const API_URL = import.meta.env.VITE_API_URL || '';
const SUBDOMAIN_SUFFIX = API_URL.replace(/^https?:\/\/api\./, '') || 'complens.ai';

export interface DomainTabProps {
  workspaceId: string;
  pageId: string;
  pageSlug: string;
  subdomain: string;
  onSaveSubdomain: (subdomain: string) => void;
  isSaving: boolean;
  siteId?: string;
  siteDomain?: string;
  chatConfig?: Partial<ChatConfig>;
  pageStatus?: string;
}

export default function DomainTab({
  workspaceId,
  pageId,
  pageSlug,
  subdomain,
  onSaveSubdomain,
  isSaving,
  siteId,
  chatConfig,
  pageStatus,
}: DomainTabProps) {
  const [subdomainInput, setSubdomainInput] = useState(subdomain);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [subdomainStatus, setSubdomainStatus] = useState<{
    checking: boolean;
    available?: boolean;
    message?: string;
    url?: string;
  }>({ checking: false });

  // Sync local state with prop when page data changes (e.g., after save)
  useEffect(() => {
    setSubdomainInput(subdomain);
  }, [subdomain]);

  // Check subdomain availability with debounce
  useEffect(() => {
    if (!subdomainInput || subdomainInput === subdomain) {
      setSubdomainStatus({ checking: false });
      return;
    }

    const timeoutId = setTimeout(async () => {
      setSubdomainStatus({ checking: true });
      try {
        const result = await checkSubdomainAvailability(workspaceId, subdomainInput, pageId);
        setSubdomainStatus({
          checking: false,
          available: result.available,
          message: result.message,
          url: result.url,
        });
      } catch {
        setSubdomainStatus({ checking: false, message: 'Failed to check availability' });
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [subdomainInput, subdomain, workspaceId, pageId]);

  const handleSubdomainSave = () => {
    if (subdomainStatus.available === false && subdomainInput !== subdomain) return;
    onSaveSubdomain(subdomainInput);
  };

  return (
    <div className="space-y-3">
      {/* Subdomain */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Free Subdomain</label>
        <div className="flex gap-1.5">
          <div className="flex-1 flex items-center">
            <input
              type="text"
              value={subdomainInput}
              onChange={(e) => setSubdomainInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="mypage"
              className="flex-1 px-2.5 py-1 text-sm border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <span className="px-2 py-1 bg-gray-50 border border-l-0 border-gray-300 rounded-r-md text-gray-500 text-xs whitespace-nowrap">
              .{SUBDOMAIN_SUFFIX}
            </span>
          </div>
          <button
            onClick={handleSubdomainSave}
            disabled={
              isSaving ||
              subdomainStatus.checking ||
              Boolean(subdomainInput && subdomainStatus.available === false && subdomainInput !== subdomain)
            }
            className="px-2.5 py-1 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Status messages */}
        {subdomainStatus.checking && (
          <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Checking...
          </p>
        )}
        {!subdomainStatus.checking && subdomainStatus.available === true && subdomainInput && (
          <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
            <Check className="w-3 h-3" />
            Available! <span className="font-medium">{subdomainStatus.url}</span>
          </p>
        )}
        {!subdomainStatus.checking && subdomainStatus.available === false && (
          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {subdomainStatus.message}
          </p>
        )}
        {subdomain && !subdomainInput && (
          <p className="text-xs text-gray-500 mt-1">Subdomain will be removed on save.</p>
        )}
        {subdomain && subdomainInput === subdomain && (
          <p className="text-xs text-gray-500 mt-1">
            Live at{' '}
            <a
              href={`https://${subdomain}.${SUBDOMAIN_SUFFIX}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              {subdomain}.{SUBDOMAIN_SUFFIX}
            </a>
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2">
        <div className="flex-1 border-t border-gray-200" />
        <span className="text-xs text-gray-400 shrink-0">or</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>

      {/* Custom Domain */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Custom Domain</label>
        {siteId ? (
          <CustomDomainSection workspaceId={workspaceId} siteId={siteId} subdomain={subdomain} />
        ) : (
          <p className="text-xs text-gray-500">Save this page to a site first to connect a custom domain.</p>
        )}
      </div>

      {/* URLs */}
      <div className="border-t border-gray-100 pt-2.5">
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Page URLs</label>
        <div className="space-y-0.5 text-xs">
          {subdomain && (
            <a
              href={`https://${subdomain}.${SUBDOMAIN_SUFFIX}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline flex items-center gap-1"
            >
              {subdomain}.{SUBDOMAIN_SUFFIX}
              <ExternalLink className="w-3 h-3" />
            </a>
          )}
          <a
            href={`/p/${pageSlug}?ws=${workspaceId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:underline font-mono flex items-center gap-1"
          >
            {window.location.host}/p/{pageSlug}
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Chat Embed — collapsible */}
      <div className="border-t border-gray-100 pt-2.5">
        <button
          onClick={() => setEmbedOpen(!embedOpen)}
          className="flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-900 w-full"
        >
          {embedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <Code2 className="w-3.5 h-3.5" />
          Embed Chat Widget
        </button>

        {embedOpen && (
          <div className="mt-2">
            {pageStatus !== 'published' ? (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2.5 py-1.5">
                Publish this page first to enable the embed widget.
              </p>
            ) : !chatConfig?.enabled ? (
              <p className="text-xs text-amber-700 bg-amber-50 rounded px-2.5 py-1.5">
                Add a Chat block to your page and enable it to get the embed code.
              </p>
            ) : (
              <div className="relative">
                <pre className="bg-gray-900 text-gray-100 rounded-md p-2.5 text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed">
{`<script>
  window.ComplensChat = {
    pageId: "${pageId}",
    workspaceId: "${workspaceId}"
  };
</script>
<script src="${window.location.origin}/embed/chat-loader.js" async></script>`}
                </pre>
                <button
                  onClick={() => {
                    const snippet = `<script>\n  window.ComplensChat = {\n    pageId: "${pageId}",\n    workspaceId: "${workspaceId}"\n  };\n</script>\n<script src="${window.location.origin}/embed/chat-loader.js" async></script>`;
                    navigator.clipboard.writeText(snippet);
                    setEmbedCopied(true);
                    setTimeout(() => setEmbedCopied(false), 2000);
                  }}
                  className="absolute top-1.5 right-1.5 p-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
                  title="Copy to clipboard"
                >
                  {embedCopied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
