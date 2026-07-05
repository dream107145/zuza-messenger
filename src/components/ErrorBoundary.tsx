import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Dashboard crashed:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#050505',
          color: '#fff',
          padding: '2rem',
          fontFamily: 'system-ui, sans-serif',
        }}>
          <h1 style={{ color: '#f87171', marginBottom: '1rem' }}>Dashboard error</h1>
          <pre style={{
            background: '#111',
            padding: '1rem',
            borderRadius: '8px',
            overflow: 'auto',
            fontSize: '14px',
            lineHeight: 1.5,
          }}>
            {this.state.error.message}
          </pre>
          <p style={{ marginTop: '1rem', color: '#94a3b8' }}>
            Try restarting the dev server after updating <code>.env</code>:{' '}
            <code>npm run dev</code>
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: '1rem',
              padding: '0.75rem 1.5rem',
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
