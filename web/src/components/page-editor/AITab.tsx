import { useState, useEffect } from 'react';
import {
  useBusinessProfile,
  useUpdateBusinessProfile,
  useAnalyzeContent,
  INDUSTRY_OPTIONS,
  BUSINESS_TYPE_OPTIONS,
  BRAND_VOICE_OPTIONS,
} from '../../lib/hooks/useAI';
import { useToast } from '../Toast';
import { type ChatConfig } from '../../lib/hooks/usePages';
import PillTabs from '../ui/PillTabs';
import KnowledgeBaseSettings from '../settings/KnowledgeBaseSettings';
import { Sparkles, Loader2, BookOpen } from 'lucide-react';

export type AISubTab = 'profile' | 'chat' | 'knowledge-base';

export interface AITabProps {
  workspaceId: string;
  pageId: string;
  chatConfig: Partial<ChatConfig> | undefined;
  onChatConfigChange: <K extends keyof ChatConfig>(key: K, value: ChatConfig[K]) => void;
  activeSubTab: AISubTab;
  onSubTabChange: (tab: AISubTab) => void;
}

const AI_SUB_TABS: { id: AISubTab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'chat', label: 'Chat' },
  { id: 'knowledge-base', label: 'Knowledge Base' },
];

export default function AITab({
  workspaceId,
  pageId,
  chatConfig,
  onChatConfigChange,
  activeSubTab,
  onSubTabChange,
}: AITabProps) {
  const toast = useToast();

  // AI Profile hooks - page-specific
  const { data: profile, isLoading: profileLoading } = useBusinessProfile(workspaceId, pageId);
  const updateProfile = useUpdateBusinessProfile(workspaceId || '', pageId);
  const analyzeContent = useAnalyzeContent(workspaceId || '');

  // Content analysis state
  const [showContentInput, setShowContentInput] = useState(false);
  const [pastedContent, setPastedContent] = useState('');

  // Local profile state to avoid API calls on every keystroke
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

  // Initialize profile form when profile data loads
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

  // Reset state when pageId changes (navigating to different page)
  useEffect(() => {
    setProfileInitialized(false);
  }, [pageId]);

  // Save profile field on blur (only if value changed)
  const handleProfileBlur = (field: string, value: string | string[]) => {
    updateProfile.mutate({ [field]: value });
  };

  return (
    <div className="space-y-6">
      {/* AI Subtab Navigation */}
      <PillTabs tabs={AI_SUB_TABS} activeTab={activeSubTab} onChange={onSubTabChange} />

      {/* Profile Subtab */}
      {activeSubTab === 'profile' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">AI Profile</h3>
              <p className="text-sm text-gray-600">
                Tell AI about this page's context to generate better content
              </p>
            </div>
            {profile && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Profile Score:</span>
                <span className="text-lg font-bold text-indigo-600">{profile.profile_score}%</span>
              </div>
            )}
          </div>

          {/* Quick Import */}
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

                        // Update local form with extracted values so user sees them immediately
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
                      } catch (err) {
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
              {/* Basic Info */}
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
                  placeholder="What does this page represent? What are you offering?"
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
                  placeholder="Who is this page for? Describe your ideal visitor."
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
      )}

      {/* Chat Subtab */}
      {activeSubTab === 'chat' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">AI Chat Widget</h3>
              <p className="text-sm text-gray-500">
                Enable visitors to chat with an AI assistant on this page.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={chatConfig?.enabled ?? true}
                onChange={(e) => onChatConfigChange('enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
            </label>
          </div>

          {chatConfig?.enabled !== false && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Widget Position
                </label>
                <select
                  value={chatConfig?.position || 'bottom-right'}
                  onChange={(e) => onChatConfigChange('position', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Initial Message
                </label>
                <input
                  type="text"
                  value={chatConfig?.initial_message || ''}
                  onChange={(e) =>
                    onChatConfigChange('initial_message', e.target.value || null)
                  }
                  placeholder="Hi! How can I help you today?"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  AI Persona Instructions
                </label>
                <textarea
                  value={chatConfig?.ai_persona || ''}
                  onChange={(e) =>
                    onChatConfigChange('ai_persona', e.target.value || null)
                  }
                  placeholder="You are a helpful assistant for our company. Be friendly and professional..."
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Knowledge Base Subtab */}
      {activeSubTab === 'knowledge-base' && (
        <div className="space-y-6">
          <div>
            <h3 className="font-medium text-gray-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Knowledge Base
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Upload documents to give this page's AI chat widget relevant context about your business.
            </p>
          </div>
          <KnowledgeBaseSettings workspaceId={workspaceId || ''} />
        </div>
      )}
    </div>
  );
}
