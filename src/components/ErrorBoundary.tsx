import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-black flex flex-col items-center justify-center text-foreground p-4">
          <div className="bg-black/40 border border-white/10 p-8 rounded-2xl max-w-lg w-full flex flex-col items-center text-center shadow-2xl">
            <div className="bg-red-500/20 p-4 rounded-full mb-6">
              <AlertTriangle className="w-12 h-12 text-red-500" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Oops! Something went wrong.</h1>
            <p className="text-muted-foreground mb-6">
              We've encountered an unexpected issue. Don't worry, your data is safe.
            </p>
            
            <div className="bg-black/50 border border-white/5 p-4 rounded-lg text-left w-full overflow-hidden mb-6">
              <p className="text-sm font-mono text-red-400 break-words truncate">
                {this.state.error?.message || "Unknown Application Error"}
              </p>
            </div>

            <button 
              onClick={() => window.location.reload()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors"
            >
              <RefreshCcw className="w-4 h-4" /> Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
