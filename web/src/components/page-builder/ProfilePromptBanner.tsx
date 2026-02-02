import { useState, useEffect } from 'react';
import { Sparkles, X, ChevronRight } from 'lucide-react';

interface ProfilePromptBannerProps {
  profileScore: number;
  threshold?: number;
  onGoToProfile: () => void;
}

const DISMISS_STORAGE_KEY = 'complens_profile_prompt_dismissed';

export default function ProfilePromptBanner({
  profileScore,
  threshold = 50,
  onGoToProfile,
}: ProfilePromptBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Check if banner was dismissed this session
  useEffect(() => {
    const dismissed = sessionStorage.getItem(DISMISS_STORAGE_KEY);
    if (dismissed) {
      setIsDismissed(true);
    } else if (profileScore < threshold) {
      // Small delay for animation
      setTimeout(() => setIsVisible(true), 100);
    }
  }, [profileScore, threshold]);

  // Don't show if score is above threshold or dismissed
  if (profileScore >= threshold || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      setIsDismissed(true);
      sessionStorage.setItem(DISMISS_STORAGE_KEY, 'true');
    }, 300);
  };

  const handleGoToProfile = () => {
    onGoToProfile();
  };

  // Calculate progress bar percentage
  const progressPercent = Math.min(profileScore, 100);

  // Determine encouragement message based on score
  const getMessage = () => {
    if (profileScore < 20) {
      return "Complete your AI profile to unlock better content generation";
    } else if (profileScore < 35) {
      return "Your profile is getting started! Add more details for better AI results";
    } else {
      return "Almost there! A few more details will supercharge your AI content";
    }
  };

  return (
    <div
      className={`
        overflow-hidden transition-all duration-300 ease-out
        ${isVisible ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}
      `}
    >
      <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 border border-amber-200 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex-shrink-0 p-2 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl shadow-lg shadow-amber-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  Boost your AI-generated content
                </h4>
                <p className="text-sm text-gray-600 mt-1">
                  {getMessage()}
                </p>
              </div>

              {/* Dismiss button */}
              <button
                onClick={handleDismiss}
                className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-lg transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Progress bar */}
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-2 bg-amber-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs font-medium text-amber-700 whitespace-nowrap">
                {profileScore}% complete
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handleGoToProfile}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium rounded-lg hover:from-amber-600 hover:to-orange-600 transition-all shadow-md shadow-amber-500/25"
              >
                Complete Profile
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={handleDismiss}
                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-white/60 rounded-lg transition-colors"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
