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
      }

      return (
        <div style={{
          minHeight: '100vh', background: 'var(--frame-base)', color: 'var(--frame-text)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '24px', position: 'relative', overflow: 'hidden',
        }}>
          <div className="atmosphere" />
          <div style={{
            maxWidth: 640, width: '100%', background: 'var(--frame-card)',
            border: '1px solid var(--frame-ghost)', borderRadius: 'var(--radius-lg)',
            padding: 'clamp(32px, 6vw, 48px)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', textAlign: 'center', position: 'relative', zIndex: 10,
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: 'var(--vermillion-dim)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 24, border: '1px solid rgba(194,59,34,0.3)',
            }}>
              <AlertCircle className="w-8 h-8" style={{ color: 'var(--vermillion)' }} />
            </div>
            <h1 style={{
              fontFamily: 'var(--font-display)', fontSize: '1.8rem', fontWeight: 400,
              letterSpacing: '-0.02em', marginBottom: 16,
            }}>
              Something went wrong
            </h1>

            {parsedError ? (
              <div style={{
                background: 'rgba(0,0,0,0.3)', border: '1px solid var(--frame-ghost)',
                borderRadius: 'var(--radius-md)', padding: 24, textAlign: 'left',
                width: '100%', marginBottom: 24,
              }}>
                <h3 style={{
                  fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--vermillion)',
                  marginBottom: 16, letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>
                  Firestore Permission Error
                </h3>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--frame-dim)', lineHeight: 2 }}>
                  <p><span style={{ color: 'var(--frame-dim)', opacity: 0.5 }}>Operation:</span> {parsedError.operationType}</p>
                  <p><span style={{ color: 'var(--frame-dim)', opacity: 0.5 }}>Path:</span> {parsedError.path}</p>
                  <p><span style={{ color: 'var(--frame-dim)', opacity: 0.5 }}>Error:</span> {parsedError.error}</p>
                  {parsedError.authInfo && (
                    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--frame-ghost)' }}>
                      <p style={{ opacity: 0.5, marginBottom: 8 }}>Auth Context:</p>
                      <p>UID: {parsedError.authInfo.userId || 'Not authenticated'}</p>
                      <p>Email: {parsedError.authInfo.email || 'N/A'}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{
                background: 'rgba(0,0,0,0.3)', border: '1px solid var(--frame-ghost)',
                borderRadius: 'var(--radius-md)', padding: 24, textAlign: 'left',
                width: '100%', marginBottom: 24, overflow: 'auto', maxHeight: 300,
              }}>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--vermillion)', marginBottom: 8 }}>
                  {this.state.error?.toString()}
                </p>
                <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--frame-dim)', whiteSpace: 'pre-wrap' }}>
                  {this.state.errorInfo?.componentStack}
                </pre>
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="btn-primary"
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
