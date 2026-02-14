import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, ArrowRight, FileText, Flame, GitBranch, SkipForward } from 'lucide-react';
import { useCurrentWorkspace } from '@/lib/hooks/useWorkspaces';
import {
  useUpdateBusinessProfile,
  useAnalyzeContent,
  useOnboardingQuestion,
  useSubmitOnboardingAnswer,
} from '@/lib/hooks/useAI';

interface OnboardingWizardProps {
  onComplete: () => void;
}

export default function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const navigate = useNavigate();
  const { workspaceId } = useCurrentWorkspace();
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState('');
  const [pastedContent, setPastedContent] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [questionsAnswered, setQuestionsAnswered] = useState(0);

  const updateProfile = useUpdateBusinessProfile(workspaceId || '');
  const analyzeContent = useAnalyzeContent(workspaceId || '');
  const { data: currentQuestion } = useOnboardingQuestion(workspaceId);
  const submitAnswer = useSubmitOnboardingAnswer(workspaceId || '');

  const markComplete = async () => {
    try {
      await updateProfile.mutateAsync({ onboarding_completed: true });
    } catch {
      // Best-effort
    }
    localStorage.setItem('onboarding_dismissed', 'true');
    onComplete();
  };

  const handleSubmitAnswer = async () => {
    if (!answer.trim() || !currentQuestion) return;
    try {
      const result = await submitAnswer.mutateAsync({
        question: currentQuestion.question,
        answer: answer,
        field: currentQuestion.field,
      });
      setAnswer('');
      setQuestionsAnswered((c) => c + 1);
      // After 4 questions or if complete, advance to step 2
      if (result.is_complete || questionsAnswered + 1 >= 4) {
        setStep(1);
      }
    } catch {
      // Error handled by mutation
    }
  };

  const handleAnalyzeContent = async () => {
    if (!pastedContent.trim()) return;
    try {
      await analyzeContent.mutateAsync({
        content: pastedContent,
        auto_update: true,
      });
      setPastedContent('');
      setShowImport(false);
      setStep(1);
    } catch {
      // Error handled by mutation
    }
  };

  const handleActionClick = async (path: string) => {
    await markComplete();
    navigate(path);
  };

  const totalSteps = 2;

  return (
    <div className="max-w-2xl mx-auto py-8">
      {/* Skip link */}
      <div className="flex justify-end mb-4">
        <button
          onClick={markComplete}
          className="text-sm text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
        >
          <SkipForward className="w-4 h-4" />
          Skip setup
        </button>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full transition-all duration-300 ${
              i === step ? 'w-8 bg-primary-600' : i < step ? 'w-2 bg-primary-400' : 'w-2 bg-gray-200'
            }`}
          />
        ))}
      </div>

      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary-500 to-violet-500 flex items-center justify-center mx-auto mb-4">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">
          {step === 0 ? 'Tell us about your business' : 'What would you like to do first?'}
        </h1>
        <p className="text-gray-500 mt-2">
          {step === 0
            ? 'This helps AI create better content for you'
            : 'Pick an action to get started, or explore on your own'}
        </p>
      </div>

      {/* Step 1: Business Info */}
      {step === 0 && (
        <div className="space-y-6">
          {/* Import from content option */}
          {!showImport && (
            <button
              onClick={() => setShowImport(true)}
              className="w-full flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all text-left"
            >
              <div className="p-2.5 bg-violet-100 rounded-lg">
                <Sparkles className="w-5 h-5 text-violet-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900">Import from website or content</p>
                <p className="text-sm text-gray-500">Paste text and AI will extract your business info</p>
              </div>
              <ArrowRight className="w-4 h-4 text-gray-400" />
            </button>
          )}

          {/* Content import form */}
          {showImport && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-medium text-gray-900 mb-2">Paste your content</h3>
              <p className="text-sm text-gray-500 mb-3">
                Website copy, resume, business plan - AI will extract relevant info.
              </p>
              <textarea
                value={pastedContent}
                onChange={(e) => setPastedContent(e.target.value)}
                placeholder="Paste your content here..."
                rows={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => { setShowImport(false); setPastedContent(''); }}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAnalyzeContent}
                  disabled={!pastedContent.trim() || analyzeContent.isPending}
                  className="btn btn-primary btn-sm inline-flex items-center gap-2"
                >
                  {analyzeContent.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</>
                  ) : (
                    <><Sparkles className="w-4 h-4" /> Extract Info</>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Q&A section */}
          {!showImport && currentQuestion && !currentQuestion.is_complete && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs text-gray-400 mb-3">
                Question {questionsAnswered + 1} of ~4
              </p>
              <h3 className="font-medium text-gray-900 text-lg mb-4">
                {currentQuestion.question}
              </h3>

              {currentQuestion.input_type === 'select' && currentQuestion.options ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                  {currentQuestion.options.map((option) => (
                    <button
                      key={option}
                      onClick={() => setAnswer(option)}
                      className={`p-3 text-left rounded-lg border-2 transition-all text-sm ${
                        answer === option
                          ? 'border-primary-500 bg-primary-50'
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
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4 text-sm"
                />
              )}

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="text-sm text-gray-400 hover:text-gray-600"
                >
                  Skip to actions
                </button>
                <button
                  onClick={handleSubmitAnswer}
                  disabled={!answer.trim() || submitAnswer.isPending}
                  className="btn btn-primary inline-flex items-center gap-2"
                >
                  {submitAnswer.isPending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : (
                    <>Continue <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* If onboarding questions are already complete, auto-advance */}
          {!showImport && currentQuestion?.is_complete && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
              <p className="text-gray-600 mb-4">Your business profile is already set up.</p>
              <button onClick={() => setStep(1)} className="btn btn-primary">
                Continue <ArrowRight className="w-4 h-4 ml-1 inline" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Action Cards */}
      {step === 1 && (
        <div className="space-y-3">
          {[
            {
              title: 'Create a landing page',
              description: 'Use the AI page builder to generate a complete marketing page in minutes',
              icon: FileText,
              path: '/pages',
              color: 'bg-primary-100 text-primary-700',
            },
            {
              title: 'Set up email warmup',
              description: 'Start warming up your domain to improve email deliverability',
              icon: Flame,
              path: '/settings?section=domains',
              color: 'bg-orange-100 text-orange-700',
            },
            {
              title: 'Build a workflow',
              description: 'Automate your follow-ups, notifications, and marketing sequences',
              icon: GitBranch,
              path: '/workflows/new',
              color: 'bg-emerald-100 text-emerald-700',
            },
          ].map((action) => (
            <button
              key={action.path}
              onClick={() => handleActionClick(action.path)}
              className="w-full flex items-center gap-4 p-5 bg-white rounded-xl border border-gray-200 hover:border-primary-300 hover:shadow-sm transition-all text-left"
            >
              <div className={`p-3 rounded-lg ${action.color}`}>
                <action.icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900">{action.title}</p>
                <p className="text-sm text-gray-500 mt-0.5">{action.description}</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400" />
            </button>
          ))}

          <div className="text-center pt-4">
            <button
              onClick={markComplete}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Skip for now — go to dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
