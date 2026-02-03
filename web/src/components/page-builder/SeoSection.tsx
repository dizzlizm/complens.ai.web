import { useState, useMemo } from 'react';
import { Search, Sparkles, AlertCircle, CheckCircle, Image as ImageIcon } from 'lucide-react';
import CollapsibleSection from './CollapsibleSection';

interface SeoSectionProps {
  metaTitle: string;
  metaDescription: string;
  ogImageUrl: string;
  pageUrl: string; // For preview display
  onMetaTitleChange: (value: string) => void;
  onMetaDescriptionChange: (value: string) => void;
  onOgImageUrlChange: (value: string) => void;
  onRegenerateSeo?: () => void;
  isRegenerating?: boolean;
}

// SEO character limits
const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESC_MIN = 120;
const DESC_MAX = 160;

export default function SeoSection({
  metaTitle,
  metaDescription,
  ogImageUrl,
  pageUrl,
  onMetaTitleChange,
  onMetaDescriptionChange,
  onOgImageUrlChange,
  onRegenerateSeo,
  isRegenerating = false,
}: SeoSectionProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  // Calculate SEO score
  const seoScore = useMemo(() => {
    let score = 0;
    const issues: string[] = [];
    const good: string[] = [];

    // Title checks
    if (metaTitle) {
      if (metaTitle.length >= TITLE_MIN && metaTitle.length <= TITLE_MAX) {
        score += 30;
        good.push('Title length is optimal');
      } else if (metaTitle.length > 0) {
        score += 15;
        if (metaTitle.length < TITLE_MIN) {
          issues.push(`Title is too short (${metaTitle.length}/${TITLE_MIN} min)`);
        } else {
          issues.push(`Title is too long (${metaTitle.length}/${TITLE_MAX} max)`);
        }
      }
    } else {
      issues.push('Missing meta title');
    }

    // Description checks
    if (metaDescription) {
      if (metaDescription.length >= DESC_MIN && metaDescription.length <= DESC_MAX) {
        score += 40;
        good.push('Description length is optimal');
      } else if (metaDescription.length > 0) {
        score += 20;
        if (metaDescription.length < DESC_MIN) {
          issues.push(`Description is too short (${metaDescription.length}/${DESC_MIN} min)`);
        } else {
          issues.push(`Description is too long (${metaDescription.length}/${DESC_MAX} max)`);
        }
      }
    } else {
      issues.push('Missing meta description');
    }

    // OG Image check
    if (ogImageUrl) {
      score += 30;
      good.push('Social sharing image set');
    } else {
      issues.push('Missing social sharing image');
    }

    return { score, issues, good };
  }, [metaTitle, metaDescription, ogImageUrl]);

  const scoreColor = seoScore.score >= 80 ? 'text-green-600' : seoScore.score >= 50 ? 'text-yellow-600' : 'text-red-600';
  const scoreBg = seoScore.score >= 80 ? 'bg-green-100' : seoScore.score >= 50 ? 'bg-yellow-100' : 'bg-red-100';

  return (
    <CollapsibleSection
      title="SEO & Social"
      icon={<Search className="w-4 h-4" />}
      badge={`${seoScore.score}%`}
    >
      <div className="pt-4 space-y-4">
        {/* Tab navigation */}
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('edit')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'edit'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Edit
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'preview'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Google Preview
          </button>
        </div>

        {activeTab === 'edit' ? (
          <div className="space-y-4">
            {/* SEO Score summary */}
            <div className={`p-3 rounded-lg ${scoreBg}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-lg font-bold ${scoreColor}`}>
                  SEO Score: {seoScore.score}%
                </span>
                {onRegenerateSeo && (
                  <button
                    onClick={onRegenerateSeo}
                    disabled={isRegenerating}
                    className="flex items-center gap-1 px-3 py-1 text-sm bg-white rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Sparkles className="w-4 h-4" />
                    {isRegenerating ? 'Generating...' : 'Auto-generate'}
                  </button>
                )}
              </div>
              <div className="space-y-1 text-sm">
                {seoScore.good.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-green-700">
                    <CheckCircle className="w-3 h-3" />
                    {item}
                  </div>
                ))}
                {seoScore.issues.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-3 h-3" />
                    {item}
                  </div>
                ))}
              </div>
            </div>

            {/* Meta Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meta Title
                <span className={`ml-2 text-xs ${
                  metaTitle.length >= TITLE_MIN && metaTitle.length <= TITLE_MAX
                    ? 'text-green-600'
                    : 'text-gray-400'
                }`}>
                  {metaTitle.length}/{TITLE_MAX}
                </span>
              </label>
              <input
                type="text"
                value={metaTitle}
                onChange={(e) => onMetaTitleChange(e.target.value)}
                placeholder="Page title for search engines..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
              <p className="mt-1 text-xs text-gray-500">
                Recommended: {TITLE_MIN}-{TITLE_MAX} characters
              </p>
            </div>

            {/* Meta Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meta Description
                <span className={`ml-2 text-xs ${
                  metaDescription.length >= DESC_MIN && metaDescription.length <= DESC_MAX
                    ? 'text-green-600'
                    : 'text-gray-400'
                }`}>
                  {metaDescription.length}/{DESC_MAX}
                </span>
              </label>
              <textarea
                value={metaDescription}
                onChange={(e) => onMetaDescriptionChange(e.target.value)}
                placeholder="Brief description of your page for search results..."
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm resize-none"
              />
              <p className="mt-1 text-xs text-gray-500">
                Recommended: {DESC_MIN}-{DESC_MAX} characters
              </p>
            </div>

            {/* OG Image */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Social Sharing Image (OG Image)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={ogImageUrl}
                  onChange={(e) => onOgImageUrlChange(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                />
              </div>
              {ogImageUrl && (
                <div className="mt-2 relative w-full aspect-[1.91/1] max-w-xs bg-gray-100 rounded-lg overflow-hidden">
                  <img
                    src={ogImageUrl}
                    alt="OG Preview"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <p className="mt-1 text-xs text-gray-500">
                Recommended size: 1200x630 pixels
              </p>
            </div>
          </div>
        ) : (
          /* Google Preview Tab */
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              This is how your page might appear in Google search results:
            </p>

            {/* Google Search Result Preview */}
            <div className="p-4 bg-white border border-gray-200 rounded-lg max-w-xl">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-6 h-6 bg-gray-200 rounded-full flex items-center justify-center">
                  <ImageIcon className="w-3 h-3 text-gray-400" />
                </div>
                <div className="text-sm text-gray-600 truncate">
                  {pageUrl || 'complens.ai'}
                </div>
              </div>
              <h3 className="text-xl text-blue-800 hover:underline cursor-pointer leading-tight mb-1">
                {metaTitle || 'Page Title'}
              </h3>
              <p className="text-sm text-gray-600 line-clamp-2">
                {metaDescription || 'Add a meta description to show a preview here...'}
              </p>
            </div>

            {/* Social Share Preview */}
            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500 mb-2">
                Social media share preview:
              </p>
              <div className="max-w-sm border border-gray-200 rounded-lg overflow-hidden">
                <div className="aspect-[1.91/1] bg-gray-100 flex items-center justify-center">
                  {ogImageUrl ? (
                    <img
                      src={ogImageUrl}
                      alt="Social preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-gray-400 text-sm">No image set</div>
                  )}
                </div>
                <div className="p-3 bg-gray-50">
                  <p className="text-xs text-gray-500 uppercase mb-1">
                    {pageUrl?.replace(/^https?:\/\//, '').split('/')[0] || 'complens.ai'}
                  </p>
                  <h4 className="font-medium text-gray-900 text-sm truncate">
                    {metaTitle || 'Page Title'}
                  </h4>
                  <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">
                    {metaDescription || 'Description will appear here'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
