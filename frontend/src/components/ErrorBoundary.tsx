import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Shown above the default error UI */
  context?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches any render-phase errors in children and shows a recovery UI
 * instead of crashing the whole app to a blank screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console so it's visible in Docker logs
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">
          Something went wrong
        </h2>
        {this.props.context && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">in {this.props.context}</p>
        )}
        {this.state.error && (
          <p className="text-xs font-mono text-slate-400 dark:text-slate-500 mb-4 max-w-md">
            {this.state.error.message}
          </p>
        )}
        <div className="flex gap-3">
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}

/** Convenience wrapper for use around individual page sections */
export function PageErrorBoundary({ children, context }: { children: ReactNode; context?: string }) {
  return <ErrorBoundary context={context}>{children}</ErrorBoundary>;
}
