import { useState, useMemo } from 'react';
import { Search, Sparkles, AlertCircle, CheckCircle, Image as ImageIcon, Loader2, Bot, Code } from 'lucide-react';
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
  onGenerateOgImage?: () => void;
  isGeneratingOgImage?: boolean;
  defaultOpen?: boolean;
  // AEO-relevant data
  blocks?: Array<{ type: string; config?: Record<string, unknown> }>;
  profileScore?: number;
}

// SEO character limits
const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESC_MIN = 120;
const DESC_MAX = 160;

// --- AEO Tab sub-component ---

interface AeoTabProps {
  metaTitle: string;
  metaDescription: string;
  pageUrl: string;
  faqBlockData: { present: boolean; qualifies: boolean; count: number };
  profileScore: number;
  seoScore: number;
  blocks: Array<{ type: string; config?: Record<string, unknown> }>;
}

function AeoTab({ metaTitle, metaDescription, pageUrl, faqBlockData, profileScore, seoScore, blocks }: AeoTabProps) {
  const [showJsonLd, setShowJsonLd] = useState(false);

  // Build tips based on current state
  const tips: { text: string; done: boolean }[] = [];

  if (faqBlockData.qualifies) {
    tips.push({ text: 'FAQ block with 3+ Q&As detected -- great for AI search visibility', done: true });
  } else if (faqBlockData.present) {
    tips.push({ text: `Add more Q&As to your FAQ block (${faqBlockData.count}/3 minimum) to improve AI search visibility`, done: false });
  } else {
    tips.push({ text: 'Add an FAQ block to improve AI search visibility', done: false });
  }

  if (profileScore >= 60) {
    tips.push({ text: 'Business profile is sufficiently complete for entity recognition', done: true });
  } else {
    tips.push({ text: `Complete your business profile for better entity recognition (${profileScore}% -- 60% recommended)`, done: false });
  }

  if (metaTitle && metaDescription) {
    tips.push({ text: 'Meta title and description are set for structured data', done: true });
  } else {
    tips.push({ text: 'Set both meta title and description to enable richer structured data', done: false });
  }

  // Build a JSON-LD preview
  const faqBlock = blocks.find(b => b.type === 'faq');
  const faqItems = (faqBlock?.config?.items as Array<{ question?: string; answer?: string }> | undefined) ?? [];

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: metaTitle || '(meta title)',
    description: metaDescription || '(meta description)',
    url: pageUrl || '(page url)',
  };

  if (faqItems.length > 0) {
    jsonLd.mainEntity = {
      '@type': 'FAQPage',
      mainEntity: faqItems.map(item => ({
        '@type': 'Question',
        name: item.question || '',
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer || '',
        },
      })),
    };
  }

  const aeoScoreColor = seoScore >= 80 ? 'text-green-600' : seoScore >= 50 ? 'text-yellow-600' : 'text-red-600';
  const aeoScoreBg = seoScore >= 80 ? 'bg-green-100' : seoScore >= 50 ? 'bg-yellow-100' : 'bg-red-100';

  return (
    <div className="space-y-4">
      {/* AEO Score */}
      <div className={`p-3 rounded-lg ${aeoScoreBg}`}>
        <div className="flex items-center gap-2 mb-2">
          <Bot className="w-5 h-5 text-indigo-600" />
          <span className={`text-lg font-bold ${aeoScoreColor}`}>
            AEO Score: {seoScore}%
          </span>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Answer Engine Optimization helps your page get cited by AI assistants like ChatGPT, Perplexity, and Claude.
        </p>

        {/* Score breakdown */}
        <div className="space-y-2 mb-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700">Meta title</span>
            <span className="font-medium">25%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700">Meta description</span>
            <span className="font-medium">30%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700">OG image</span>
            <span className="font-medium">15%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700">FAQ block (3+ Q&As)</span>
            <span className="font-medium">15%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-700">Business profile (60%+)</span>
            <span className="font-medium">15%</span>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700">Tips</h4>
        {tips.map((tip, i) => (
          <div key={i} className={`flex items-start gap-2 text-sm ${tip.done ? 'text-green-700' : 'text-amber-700'}`}>
            {tip.done ? (
              <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            )}
            <span>{tip.text}</span>
          </div>
        ))}
      </div>

      {/* JSON-LD Preview */}
      <div>
        <button
          onClick={() => setShowJsonLd(!showJsonLd)}
          className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          <Code className="w-4 h-4" />
          {showJsonLd ? 'Hide' : 'Preview'} Structured Data (JSON-LD)
        </button>
        {showJsonLd && (
          <pre className="mt-2 p-3 bg-gray-900 text-green-400 text-xs rounded-lg overflow-x-auto max-h-64 overflow-y-auto">
            {JSON.stringify(jsonLd, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

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
  onGenerateOgImage,
  isGeneratingOgImage = false,
  defaultOpen = false,
  blocks = [],
  profileScore = 0,
}: SeoSectionProps) {
  const [activeTab, setActiveTab] = useState<'edit' | 'preview' | 'aeo'>('edit');

  // Check FAQ blocks: need at least one FAQ block with 3+ Q&As
  const faqBlockData = useMemo(() => {
    const faqBlocks = blocks.filter(b => b.type === 'faq');
    if (faqBlocks.length === 0) return { present: false, qualifies: false, count: 0 };
    // Check if any FAQ block has 3+ items
    const bestFaq = faqBlocks.find(b => {
      const items = b.config?.items as Array<unknown> | undefined;
      return items && items.length >= 3;
    });
    const maxCount = faqBlocks.reduce((max, b) => {
      const items = b.config?.items as Array<unknown> | undefined;
      return Math.max(max, items?.length ?? 0);
    }, 0);
    return { present: true, qualifies: !!bestFaq, count: maxCount };
  }, [blocks]);

  // Calculate SEO score (with AEO factors)
  const seoScore = useMemo(() => {
    let score = 0;
    const issues: string[] = [];
    const good: string[] = [];

    // Title checks (25%, was 30%)
    if (metaTitle) {
      if (metaTitle.length >= TITLE_MIN && metaTitle.length <= TITLE_MAX) {
        score += 25;
        good.push('Title length is optimal');
      } else if (metaTitle.length > 0) {
        score += 12;
        if (metaTitle.length < TITLE_MIN) {
          issues.push(`Title is too short (${metaTitle.length}/${TITLE_MIN} min)`);
        } else {
          issues.push(`Title is too long (${metaTitle.length}/${TITLE_MAX} max)`);
        }
      }
    } else {
      issues.push('Missing meta title');
    }

    // Description checks (30%, was 40%)
    if (metaDescription) {
      if (metaDescription.length >= DESC_MIN && metaDescription.length <= DESC_MAX) {
        score += 30;
        good.push('Description length is optimal');
      } else if (metaDescription.length > 0) {
        score += 15;
        if (metaDescription.length < DESC_MIN) {
          issues.push(`Description is too short (${metaDescription.length}/${DESC_MIN} min)`);
        } else {
          issues.push(`Description is too long (${metaDescription.length}/${DESC_MAX} max)`);
        }
      }
    } else {
      issues.push('Missing meta description');
    }

    // OG Image check (15%, was 30%)
    if (ogImageUrl) {
      score += 15;
      good.push('Social sharing image set');
    } else {
      issues.push('Missing social sharing image');
    }

    // FAQ block with 3+ Q&As (15%, new)
    if (faqBlockData.qualifies) {
      score += 15;
      good.push('FAQ block with 3+ questions improves AI search visibility');
    } else if (faqBlockData.present) {
      score += 7;
      issues.push(`FAQ block has ${faqBlockData.count} Q&As (3+ recommended for AEO)`);
    } else {
      issues.push('Add an FAQ block to improve AI search visibility');
    }

    // Business profile completeness 60%+ (15%, new)
    if (profileScore >= 60) {
      score += 15;
      good.push('Business profile supports entity recognition');
    } else {
      issues.push(`Business profile ${profileScore}% complete (60%+ recommended for AEO)`);
    }

    return { score, issues, good };
  }, [metaTitle, metaDescription, ogImageUrl, faqBlockData, profileScore]);

  const scoreColor = seoScore.score >= 80 ? 'text-green-600' : seoScore.score >= 50 ? 'text-yellow-600' : 'text-red-600';
  const scoreBg = seoScore.score >= 80 ? 'bg-green-100' : seoScore.score >= 50 ? 'bg-yellow-100' : 'bg-red-100';

  return (
    <CollapsibleSection
      title="Discoverability"
      icon={<Search className="w-4 h-4" />}
      badge={`${seoScore.score}%`}
      defaultOpen={defaultOpen}
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
          <button
            onClick={() => setActiveTab('aeo')}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'aeo'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            AEO
          </button>
        </div>

        {activeTab === 'edit' && (
          <div className="space-y-4">
            {/* SEO Score summary */}
            <div className={`p-3 rounded-lg ${scoreBg}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-lg font-bold ${scoreColor}`}>
                  Discoverability Score: {seoScore.score}%
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
                {onGenerateOgImage && (
                  <button
                    onClick={onGenerateOgImage}
                    disabled={isGeneratingOgImage}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 whitespace-nowrap"
                  >
                    {isGeneratingOgImage ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generate with AI
                      </>
                    )}
                  </button>
                )}
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
        )}

        {activeTab === 'preview' && (
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

        {activeTab === 'aeo' && (
          <AeoTab
            metaTitle={metaTitle}
            metaDescription={metaDescription}
            pageUrl={pageUrl}
            faqBlockData={faqBlockData}
            profileScore={profileScore}
            seoScore={seoScore.score}
            blocks={blocks}
          />
        )}
      </div>
    </CollapsibleSection>
  );
}
