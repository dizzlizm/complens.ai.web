import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { checkSubdomainAvailability } from '../../lib/hooks/usePages';

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
}

export default function DomainTab({
  workspaceId,
  pageId,
  pageSlug,
  subdomain,
  onSaveSubdomain,
  isSaving,
  siteId: _siteId,
  siteDomain,
}: DomainTabProps) {
  const [subdomainInput, setSubdomainInput] = useState(subdomain);
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
      } catch (err) {
        setSubdomainStatus({ checking: false, message: 'Failed to check availability' });
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [subdomainInput, subdomain, workspaceId, pageId]);

  const handleSubdomainSave = () => {
    // Block only if we've explicitly checked and it's unavailable
    if (subdomainStatus.available === false && subdomainInput !== subdomain) {
      return;
    }
    // Call the save callback with the new subdomain value
    onSaveSubdomain(subdomainInput);
  };

  return (
    <div className="space-y-6">
      {/* Subdomain Section - Free and Easy */}
      <div className="border border-gray-200 rounded-lg p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 bg-green-100 rounded-lg">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h4 className="font-medium text-gray-900">Free Subdomain</h4>
            <p className="text-sm text-gray-600 mt-1">
              Get a short, memorable URL instantly. No DNS setup required.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 flex items-center">
            <input
              type="text"
              value={subdomainInput}
              onChange={(e) => setSubdomainInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="mypage"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-l-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <span className="px-4 py-2 bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-500 text-sm">
              {`.${SUBDOMAIN_SUFFIX}`}
            </span>
          </div>
          <button
            onClick={handleSubdomainSave}
            disabled={
              isSaving ||
              subdomainStatus.checking ||
              // Only disable if we've explicitly checked and it's not available
              Boolean(subdomainInput && subdomainStatus.available === false && subdomainInput !== subdomain)
            }
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Status messages */}
        {subdomainStatus.checking && (
          <p className="text-sm text-gray-500 mt-2 flex items-center gap-2">
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Checking availability...
          </p>
        )}
        {!subdomainStatus.checking && subdomainStatus.available === true && subdomainInput && (
          <p className="text-sm text-green-600 mt-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Available! Your page will be at: <span className="font-medium">{subdomainStatus.url}</span>
          </p>
        )}
        {!subdomainStatus.checking && subdomainStatus.available === false && (
          <p className="text-sm text-red-600 mt-2 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            {subdomainStatus.message}
          </p>
        )}
        {subdomain && !subdomainInput && (
          <p className="text-sm text-gray-500 mt-2">
            Current subdomain will be removed when you save.
          </p>
        )}
        {subdomain && subdomainInput === subdomain && (
          <p className="text-sm text-gray-500 mt-2">
            Your page is live at:{' '}
            <a
              href={`https://${subdomain}.${SUBDOMAIN_SUFFIX}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-600 hover:underline"
            >
              {`https://${subdomain}.${SUBDOMAIN_SUFFIX}`}
            </a>
          </p>
        )}
      </div>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-3 bg-white text-gray-500">or use your own domain</span>
        </div>
      </div>

      {/* Custom Domain Section - Read-only display */}
      <div className="border border-gray-200 rounded-lg p-5">
        <div className="flex items-start gap-3 mb-3">
          <svg className="w-5 h-5 text-indigo-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <div>
            <h4 className="font-medium text-gray-900">Custom Domain</h4>
          </div>
        </div>

        {siteDomain ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-sm text-green-800 flex items-center gap-2">
              <svg className="w-4 h-4 text-green-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              This page is available at{' '}
              <a
                href={`https://${siteDomain}/${pageSlug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-green-700 hover:underline"
              >
                {`https://${siteDomain}/${pageSlug}`}
              </a>
            </p>
          </div>
        ) : (
          <div className="text-sm text-gray-600">
            <p>
              Set up a custom domain in{' '}
              <Link
                to="/settings"
                className="text-indigo-600 hover:underline font-medium"
              >
                Settings &gt; Domains &amp; Email
              </Link>
            </p>
          </div>
        )}
      </div>

      {/* Default URL */}
      <div className="border-t border-gray-200 pt-6">
        <h4 className="font-medium text-gray-900 mb-2">Default URL</h4>
        <p className="text-sm text-gray-600">
          Your page is always accessible at:
        </p>
        <a
          href={`/p/${pageSlug}?ws=${workspaceId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:underline text-sm font-mono"
        >
          {window.location.origin}/p/{pageSlug}?ws={workspaceId}
        </a>
      </div>
    </div>
  );
}
