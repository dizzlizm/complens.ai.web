import { useState, useEffect } from 'react';
import {
  useBusinessProfile,
  useUpdateBusinessProfile,
  useAnalyzeContent,
  useAnalyzeDomain,
  INDUSTRY_OPTIONS,
  BUSINESS_TYPE_OPTIONS,
  BRAND_VOICE_OPTIONS,
} from '../../lib/hooks/useAI';
import { useToast } from '../Toast';
import { Sparkles, Loader2, Globe } from 'lucide-react';

export interface BusinessProfileFormProps {
  workspaceId: string;
  pageId?: string;
  siteId?: string;
}

export default function BusinessProfileForm({
  workspaceId,
  pageId,
  siteId,
}: BusinessProfileFormProps) {
  const toast = useToast();

  const { data: profile, isLoading: profileLoading } = useBusinessProfile(workspaceId, pageId, siteId);
  const updateProfile = useUpdateBusinessProfile(workspaceId, pageId, siteId);
  const analyzeContent = useAnalyzeContent(workspaceId);
  const analyzeDomain = useAnalyzeDomain(workspaceId);

  const [websiteUrl, setWebsiteUrl] = useState('');
  const [showContentInput, setShowContentInput] = useState(false);
  const [pastedContent, setPastedContent] = useState('');

  const [profileForm, setProfileForm] = useState({
    business_name: '',
    tagline: '',
    description: '',
    industry: '',
    business_type: '',
    brand_voice: '',
    target_audience: '',
    unique_value_proposition: '',
    achievements: [] as string[],
  });
  const [profileInitialized, setProfileInitialized] = useState(false);

  useEffect(() => {
    if (profile && !profileInitialized) {
      setProfileForm({
        business_name: profile.business_name || '',
        tagline: profile.tagline || '',
        description: profile.description || '',
        industry: profile.industry || '',
        business_type: profile.business_type || '',
        brand_voice: profile.brand_voice || '',
        target_audience: profile.target_audience || '',
        unique_value_proposition: profile.unique_value_proposition || '',
        achievements: profile.achievements || [],
      });
      setProfileInitialized(true);
    }
  }, [profile, profileInitialized]);

  // Reset state when scope changes
  useEffect(() => {
    setProfileInitialized(false);
  }, [pageId, siteId]);

  const handleProfileBlur = (field: string, value: string | string[]) => {
    updateProfile.mutate({ [field]: value });
  };

  const handleAnalyzeUrl = async () => {
    const url = websiteUrl.trim();
    if (!url) return;
    try {
      const result = await analyzeDomain.mutateAsync({
        domain: url,
        site_id: siteId,
        auto_update: true,
      });
      setWebsiteUrl('');
      if (result) {
        setProfileForm({
          business_name: result.business_name || profileForm.business_name,
          tagline: result.tagline || profileForm.tagline,
          description: result.description || profileForm.description,
          industry: result.industry || profileForm.industry,
          business_type: result.business_type || profileForm.business_type,
          brand_voice: result.brand_voice || profileForm.brand_voice,
          target_audience: result.target_audience || profileForm.target_audience,
          unique_value_proposition: result.unique_value_proposition || profileForm.unique_value_proposition,
          achievements: result.achievements?.length ? result.achievements : profileForm.achievements,
        });
      }
      toast.success('Website analyzed! Profile fields updated.');
    } catch {
      // Error handled by mutation state
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Business Profile</h3>
          <p className="text-sm text-gray-600">
            Tell AI about your business to generate better content and chat responses
          </p>
        </div>
        {profile && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Profile Score:</span>
            <span className="text-lg font-bold text-indigo-600">{profile.profile_score}%</span>
          </div>
        )}
      </div>

      {/* Import from Website URL */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Globe className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900">Import from Website</p>
            <p className="text-sm text-gray-600">
              Enter your website URL to auto-fill your business profile
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && websiteUrl.trim()) {
                e.preventDefault();
                handleAnalyzeUrl();
              }
            }}
            placeholder="https://yourwebsite.com"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleAnalyzeUrl}
            disabled={!websiteUrl.trim() || analyzeDomain.isPending}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 whitespace-nowrap"
          >
            {analyzeDomain.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Globe className="w-4 h-4" />
                Analyze
              </>
            )}
          </button>
        </div>
        {analyzeDomain.isError && (
          <p className="text-xs text-red-500 mt-2">Failed to analyze website. Check the URL and try again.</p>
        )}
      </div>

      {/* Quick Import from Content */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-100">
        <button
          onClick={() => setShowContentInput(!showContentInput)}
          className="flex items-center gap-3 w-full text-left"
        >
          <div className="p-2 bg-purple-100 rounded-lg">
            <Sparkles className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-gray-900">Import from Content</p>
            <p className="text-sm text-gray-600">
              Paste your website, resume, or doc and AI will extract info
            </p>
          </div>
        </button>

        {showContentInput && (
          <div className="mt-4 space-y-3">
            <textarea
              value={pastedContent}
              onChange={(e) => setPastedContent(e.target.value)}
              placeholder="Paste your content here..."
              rows={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowContentInput(false);
                  setPastedContent('');
                }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!pastedContent.trim()) return;
                  try {
                    const result = await analyzeContent.mutateAsync({
                      content: pastedContent,
                      auto_update: true,
                      page_id: pageId,
                    });
                    setPastedContent('');
                    setShowContentInput(false);

                    if (result.profile) {
                      setProfileForm({
                        business_name: result.profile.business_name || '',
                        tagline: result.profile.tagline || '',
                        description: result.profile.description || '',
                        industry: result.profile.industry || '',
                        business_type: result.profile.business_type || '',
                        brand_voice: result.profile.brand_voice || '',
                        target_audience: result.profile.target_audience || '',
                        unique_value_proposition: result.profile.unique_value_proposition || '',
                        achievements: result.profile.achievements || [],
                      });
                    }

                    toast.success(`Extracted ${Object.keys(result.extracted).length} fields from your content!`);
                  } catch {
                    toast.error('Failed to analyze content');
                  }
                }}
                disabled={!pastedContent.trim() || analyzeContent.isPending}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
              >
                {analyzeContent.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Extract Info
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Profile Form */}
      {profileLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business/Person Name
              </label>
              <input
                type="text"
                value={profileForm.business_name}
                onChange={(e) => setProfileForm({ ...profileForm, business_name: e.target.value })}
                onBlur={(e) => handleProfileBlur('business_name', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Your business or your name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tagline
              </label>
              <input
                type="text"
                value={profileForm.tagline}
                onChange={(e) => setProfileForm({ ...profileForm, tagline: e.target.value })}
                onBlur={(e) => handleProfileBlur('tagline', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="A short memorable phrase"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={profileForm.description}
              onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
              onBlur={(e) => handleProfileBlur('description', e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="What does your business do? What are you offering?"
            />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Industry
              </label>
              <select
                value={profileForm.industry || 'other'}
                onChange={(e) => {
                  setProfileForm({ ...profileForm, industry: e.target.value });
                  updateProfile.mutate({ industry: e.target.value });
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {INDUSTRY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Type
              </label>
              <select
                value={profileForm.business_type || 'other'}
                onChange={(e) => {
                  setProfileForm({ ...profileForm, business_type: e.target.value });
                  updateProfile.mutate({ business_type: e.target.value });
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {BUSINESS_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Brand Voice
              </label>
              <select
                value={profileForm.brand_voice || 'professional'}
                onChange={(e) => {
                  setProfileForm({ ...profileForm, brand_voice: e.target.value });
                  updateProfile.mutate({ brand_voice: e.target.value });
                }}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {BRAND_VOICE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Audience
            </label>
            <textarea
              value={profileForm.target_audience}
              onChange={(e) => setProfileForm({ ...profileForm, target_audience: e.target.value })}
              onBlur={(e) => handleProfileBlur('target_audience', e.target.value)}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Who are your ideal customers? Describe your target audience."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Unique Value Proposition
            </label>
            <textarea
              value={profileForm.unique_value_proposition}
              onChange={(e) => setProfileForm({ ...profileForm, unique_value_proposition: e.target.value })}
              onBlur={(e) => handleProfileBlur('unique_value_proposition', e.target.value)}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="What makes you different? Why should visitors choose you?"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Achievements & Social Proof
            </label>
            <textarea
              value={profileForm.achievements.join('\n')}
              onChange={(e) => setProfileForm({
                ...profileForm,
                achievements: e.target.value.split('\n')
              })}
              onBlur={(e) => handleProfileBlur('achievements', e.target.value.split('\n').filter(a => a.trim()))}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="One per line: awards, metrics, notable clients, years of experience..."
            />
          </div>
        </div>
      )}
    </div>
  );
}
