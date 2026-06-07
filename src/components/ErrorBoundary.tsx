import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('MyVinyl render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--bg)] p-8 text-center">
          <p className="text-sm font-medium text-[var(--text)]">Something went wrong</p>
          <p className="max-w-md text-xs text-[var(--text-secondary)]">
            {this.state.error.message}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}