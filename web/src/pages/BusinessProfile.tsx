import { useState } from 'react';
import { Sparkles, Building2, Target, MessageSquare, Trophy, Loader2, Check } from 'lucide-react';
import { useCurrentWorkspace } from '../lib/hooks/useWorkspaces';
import {
  useBusinessProfile,
  useUpdateBusinessProfile,
  useAnalyzeContent,
  useOnboardingQuestion,
  useSubmitOnboardingAnswer,
  INDUSTRY_OPTIONS,
  BUSINESS_TYPE_OPTIONS,
  BRAND_VOICE_OPTIONS,
} from '../lib/hooks/useAI';
import { useToast } from '../components/Toast';

export default function BusinessProfile() {
  const { workspaceId } = useCurrentWorkspace();
  const toast = useToast();

  const { data: profile, isLoading } = useBusinessProfile(workspaceId);
  const updateProfile = useUpdateBusinessProfile(workspaceId || '');
  const analyzeContent = useAnalyzeContent(workspaceId || '');

  // Onboarding state
  const { data: currentQuestion } = useOnboardingQuestion(workspaceId);
  const submitAnswer = useSubmitOnboardingAnswer(workspaceId || '');
  const [answer, setAnswer] = useState('');

  // Content paste for analysis
  const [pastedContent, setPastedContent] = useState('');
  const [showContentInput, setShowContentInput] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const handleSubmitAnswer = async () => {
    if (!answer.trim() || !currentQuestion) return;

    try {
      await submitAnswer.mutateAsync({
        question: currentQuestion.question,
        answer: answer,
        field: currentQuestion.field,
      });
      setAnswer('');
      toast.success('Got it! Let me ask you another question...');
    } catch (err) {
      toast.error('Failed to save answer');
    }
  };

  const handleAnalyzeContent = async () => {
    if (!pastedContent.trim()) return;

    try {
      const result = await analyzeContent.mutateAsync({
        content: pastedContent,
        auto_update: true,
      });
      setPastedContent('');
      setShowContentInput(false);
      toast.success(`Extracted ${Object.keys(result.extracted).length} fields from your content!`);
    } catch (err) {
      toast.error('Failed to analyze content');
    }
  };

  const handleMarkComplete = async () => {
    try {
      await submitAnswer.mutateAsync({
        question: 'Final confirmation',
        answer: 'Onboarding complete',
        mark_complete: true,
      });
      toast.success('Profile setup complete! AI now has context for all your content.');
    } catch (err) {
      toast.error('Failed to complete setup');
    }
  };

  // Profile completeness score
  const score = profile?.profile_score || 0;
  const isComplete = profile?.onboarding_completed || false;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Business Profile</h1>
        <p className="text-gray-600">
          Help AI understand your business to create better content
        </p>
      </div>

      {/* Profile Score */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold mb-1">Profile Completeness</h2>
            <p className="text-indigo-100 text-sm">
              {isComplete
                ? 'Great! Your profile is set up. AI has context for your content.'
                : 'The more AI knows about your business, the better your content will be.'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold">{score}%</div>
            {isComplete && <Check className="w-6 h-6 inline-block ml-2" />}
          </div>
        </div>
        <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-white rounded-full transition-all duration-500"
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid md:grid-cols-2 gap-4">
        <button
          onClick={() => setShowContentInput(!showContentInput)}
          className="flex items-center gap-4 p-6 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-lg transition-all text-left"
        >
          <div className="p-3 bg-purple-100 rounded-lg">
            <Sparkles className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Import from Content</h3>
            <p className="text-sm text-gray-500">Paste your website, resume, or doc and AI will extract info</p>
          </div>
        </button>

        {!isComplete && currentQuestion && !currentQuestion.is_complete && (
          <button
            onClick={handleMarkComplete}
            className="flex items-center gap-4 p-6 bg-white rounded-xl border border-gray-200 hover:border-green-300 hover:shadow-lg transition-all text-left"
          >
            <div className="p-3 bg-green-100 rounded-lg">
              <Check className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Mark Complete</h3>
              <p className="text-sm text-gray-500">Done for now? AI will work with what you've provided</p>
            </div>
          </button>
        )}
      </div>

      {/* Content Import */}
      {showContentInput && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Paste Your Content</h3>
          <p className="text-sm text-gray-500 mb-4">
            Paste your website copy, resume, business plan, or any content that describes your business.
            AI will extract relevant information automatically.
          </p>
          <textarea
            value={pastedContent}
            onChange={(e) => setPastedContent(e.target.value)}
            placeholder="Paste your content here..."
            rows={8}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex justify-end gap-3 mt-4">
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
              onClick={handleAnalyzeContent}
              disabled={!pastedContent.trim() || analyzeContent.isPending}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
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

      {/* AI Q&A Onboarding */}
      {!isComplete && currentQuestion && !currentQuestion.is_complete && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-indigo-100 rounded-lg">
              <MessageSquare className="w-6 h-6 text-indigo-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 text-lg mb-1">
                {currentQuestion.question}
              </h3>
              <p className="text-sm text-gray-500">
                Question {currentQuestion.progress + 1} • This helps AI personalize your content
              </p>
            </div>
          </div>

          {currentQuestion.input_type === 'select' && currentQuestion.options ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {currentQuestion.options.map((option) => (
                <button
                  key={option}
                  onClick={() => setAnswer(option)}
                  className={`p-4 text-left rounded-lg border-2 transition-all ${
                    answer === option
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="font-medium text-gray-900 capitalize">
                    {option.replace(/_/g, ' ')}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={currentQuestion.placeholder || 'Type your answer...'}
              rows={currentQuestion.input_type === 'textarea' ? 4 : 2}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
            />
          )}

          <div className="flex justify-end">
            <button
              onClick={handleSubmitAnswer}
              disabled={!answer.trim() || submitAnswer.isPending}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
            >
              {submitAnswer.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Continue'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Current Profile Summary */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            Your Business Profile
          </h3>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Info */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Business Name
              </label>
              <input
                type="text"
                value={profile?.business_name || ''}
                onChange={(e) => updateProfile.mutate({ business_name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Your business name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tagline
              </label>
              <input
                type="text"
                value={profile?.tagline || ''}
                onChange={(e) => updateProfile.mutate({ tagline: e.target.value })}
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
              value={profile?.description || ''}
              onChange={(e) => updateProfile.mutate({ description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="What does your business do?"
            />
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Industry
              </label>
              <select
                value={profile?.industry || 'other'}
                onChange={(e) => updateProfile.mutate({ industry: e.target.value })}
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
                value={profile?.business_type || 'other'}
                onChange={(e) => updateProfile.mutate({ business_type: e.target.value })}
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
                value={profile?.brand_voice || 'professional'}
                onChange={(e) => updateProfile.mutate({ brand_voice: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {BRAND_VOICE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Target Audience */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <Target className="w-4 h-4 text-indigo-600" />
              Target Audience
            </label>
            <textarea
              value={profile?.target_audience || ''}
              onChange={(e) => updateProfile.mutate({ target_audience: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Who is your ideal customer?"
            />
          </div>

          {/* Value Proposition */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Unique Value Proposition
            </label>
            <textarea
              value={profile?.unique_value_proposition || ''}
              onChange={(e) => updateProfile.mutate({ unique_value_proposition: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="What makes you different from competitors?"
            />
          </div>

          {/* Achievements */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              Achievements & Social Proof
            </label>
            <textarea
              value={profile?.achievements?.join('\n') || ''}
              onChange={(e) => updateProfile.mutate({
                achievements: e.target.value.split('\n').filter(a => a.trim())
              })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="One per line: awards, metrics, notable clients..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
