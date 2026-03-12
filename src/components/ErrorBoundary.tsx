import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertIcon as AlertCircle } from './Icons';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      let parsedError = null;
      try {
        if (this.state.error?.message) {
          parsedError = JSON.parse(this.state.error.message);
        }
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-[#0a0502] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
          <div className="atmosphere"></div>
          <div className="max-w-2xl w-full glass-panel p-8 md:p-12 flex flex-col items-center text-center z-10">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-6 border border-red-500/30">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <h1 className="text-3xl font-serif mb-4 tracking-tight">Something went wrong</h1>
            
            {parsedError ? (
              <div className="bg-black/40 border border-white/10 rounded-xl p-6 text-left w-full mb-6">
                <h3 className="text-sm font-semibold text-red-400 mb-4 uppercase tracking-wider">Firestore Permission Error</h3>
                <div className="space-y-3 text-sm font-mono text-white/80">
                  <p><span className="text-white/40">Operation:</span> {parsedError.operationType}</p>
                  <p><span className="text-white/40">Path:</span> {parsedError.path}</p>
                  <p><span className="text-white/40">Error:</span> {parsedError.error}</p>
                  {parsedError.authInfo && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <p className="text-white/40 mb-2">Auth Context:</p>
                      <p>UID: {parsedError.authInfo.userId || 'Not authenticated'}</p>
                      <p>Email: {parsedError.authInfo.email || 'N/A'}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-black/40 border border-white/10 rounded-xl p-6 text-left w-full mb-6 overflow-auto max-h-[300px]">
                <p className="text-sm font-mono text-red-400 mb-2">{this.state.error?.toString()}</p>
                <pre className="text-xs font-mono text-white/50 whitespace-pre-wrap">
                  {this.state.errorInfo?.componentStack}
                </pre>
              </div>
            )}
            
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-white text-black font-medium rounded-xl hover:bg-orange-50 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
