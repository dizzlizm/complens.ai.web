import { useState } from 'react';
import { Code, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import CollapsibleSection from './CollapsibleSection';

interface ScriptsSectionProps {
  gaTrackingId: string;
  fbPixelId: string;
  scriptsHead: string;
  scriptsBody: string;
  onGaTrackingIdChange: (value: string) => void;
  onFbPixelIdChange: (value: string) => void;
  onScriptsHeadChange: (value: string) => void;
  onScriptsBodyChange: (value: string) => void;
  defaultOpen?: boolean;
}

export default function ScriptsSection({
  gaTrackingId,
  fbPixelId,
  scriptsHead,
  scriptsBody,
  onGaTrackingIdChange,
  onFbPixelIdChange,
  onScriptsHeadChange,
  onScriptsBodyChange,
  defaultOpen = false,
}: ScriptsSectionProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasScripts = gaTrackingId || fbPixelId || scriptsHead || scriptsBody;

  return (
    <CollapsibleSection
      title="Scripts & Tracking"
      icon={<Code className="w-4 h-4" />}
      badge={hasScripts ? 'Active' : undefined}
      defaultOpen={defaultOpen}
    >
      <div className="pt-4 space-y-4">
        {/* Quick Setup - Common Tracking */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-700">Quick Setup</h4>

          {/* Google Analytics */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Google Analytics
            </label>
            <div className="flex gap-2">
              <div className="flex-shrink-0 px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l-lg text-sm text-gray-500">
                G-
              </div>
              <input
                type="text"
                value={gaTrackingId.replace(/^G-/i, '')}
                onChange={(e) => {
                  const val = e.target.value.replace(/^G-/i, '');
                  onGaTrackingIdChange(val ? `G-${val}` : '');
                }}
                placeholder="XXXXXXXXXX"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-r-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Find this in Google Analytics {'->'} Admin {'->'} Data Streams
            </p>
          </div>

          {/* Facebook Pixel */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Facebook Pixel ID
            </label>
            <input
              type="text"
              value={fbPixelId}
              onChange={(e) => onFbPixelIdChange(e.target.value)}
              placeholder="123456789012345"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono"
            />
            <p className="mt-1 text-xs text-gray-500">
              Find this in Meta Events Manager {'->'} Data Sources
            </p>
          </div>
        </div>

        {/* Advanced - Custom Scripts */}
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            {showAdvanced ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            Custom Scripts
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4">
              {/* Warning */}
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <strong>Caution:</strong> Custom scripts run on your live page.
                  Only add scripts from trusted sources.
                </div>
              </div>

              {/* Head Scripts */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Head Scripts
                </label>
                <textarea
                  value={scriptsHead}
                  onChange={(e) => onScriptsHeadChange(e.target.value)}
                  placeholder="<!-- Scripts added before </head> -->"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono resize-none"
                  spellCheck={false}
                />
                <p className="mt-1 text-xs text-gray-500">
                  For meta tags, verification codes, and scripts that need to load early
                </p>
              </div>

              {/* Body Scripts */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Body Scripts (End of Page)
                </label>
                <textarea
                  value={scriptsBody}
                  onChange={(e) => onScriptsBodyChange(e.target.value)}
                  placeholder="<!-- Scripts added before </body> -->"
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono resize-none"
                  spellCheck={false}
                />
                <p className="mt-1 text-xs text-gray-500">
                  For chat widgets, conversion tracking, and other scripts
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}
