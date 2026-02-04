import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-16 h-16 text-amber-500 mx-auto" />
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Something went wrong</h1>
            <p className="mt-2 text-gray-500">
              An unexpected error occurred. Try refreshing the page.
            </p>
            {this.state.error && import.meta.env.DEV && (
              <p className="mt-3 text-xs text-gray-400 font-mono bg-gray-100 rounded p-2 break-all">
                {this.state.error.message}
              </p>
            )}
            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh page
              </button>
              <a
                href="/dashboard"
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
              >
                <Home className="w-4 h-4" />
                Dashboard
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
