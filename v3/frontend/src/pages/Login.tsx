import { Shield, Eye, Lock, Zap } from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { Button, Spinner } from '../components/ui';

export default function Login() {
  const { signInWithGoogle, isLoading, error, clearError } = useAppStore();

  const features = [
    {
      icon: <Eye className="w-5 h-5" />,
      title: 'See Everything',
      description: 'Discover all apps with access to your Google account',
    },
    {
      icon: <Shield className="w-5 h-5" />,
      title: '100% Private',
      description: 'Your data stays on your device. No cloud storage.',
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: 'Instant Insights',
      description: 'AI-powered risk scoring in seconds',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-600 to-brand-800 flex flex-col">
      {/* Logo & Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center mb-6 shadow-lg">
          <Shield className="w-10 h-10 text-brand-600" />
        </div>

        <h1 className="text-3xl font-bold text-white mb-2">Complens</h1>
        <p className="text-brand-100 text-lg mb-8">
          See who has access to your digital life
        </p>

        {/* Features */}
        <div className="space-y-4 w-full max-w-sm mb-8">
          {features.map((feature, i) => (
            <div
              key={i}
              className="flex items-start gap-3 bg-white/10 backdrop-blur rounded-xl p-4 text-left"
            >
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center text-white flex-shrink-0">
                {feature.icon}
              </div>
              <div>
                <h3 className="font-semibold text-white">{feature.title}</h3>
                <p className="text-brand-100 text-sm">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sign In Button */}
      <div className="px-6 pb-8 safe-area-bottom">
        {error && (
          <div className="bg-red-500/20 border border-red-400/30 rounded-xl p-4 mb-4">
            <p className="text-white text-sm text-center">{error}</p>
            <button
              onClick={clearError}
              className="text-white/70 text-xs underline mt-2 block mx-auto"
            >
              Dismiss
            </button>
          </div>
        )}

        <Button
          onClick={signInWithGoogle}
          disabled={isLoading}
          fullWidth
          size="lg"
          className="bg-white text-gray-800 hover:bg-gray-100 shadow-lg"
          icon={
            isLoading ? (
              <Spinner size="sm" className="text-gray-600" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )
          }
        >
          {isLoading ? 'Signing in...' : 'Continue with Google'}
        </Button>

        <p className="text-brand-200 text-xs text-center mt-4">
          By continuing, you agree to our{' '}
          <a href="#" className="underline">
            Terms
          </a>{' '}
          and{' '}
          <a href="#" className="underline">
            Privacy Policy
          </a>
        </p>

        <div className="flex items-center justify-center gap-2 mt-4 text-brand-200 text-xs">
          <Lock className="w-3 h-3" />
          <span>All data stored locally on your device</span>
        </div>
      </div>
    </div>
  );
}
