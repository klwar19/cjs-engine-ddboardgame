import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  readonly children: ReactNode;
  // Optional custom fallback; receives the error and a reset() that clears the
  // boundary so the children re-mount and retry.
  readonly fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  readonly error: Error | null;
}

// ErrorBoundary — catches render / lazy-chunk-load failures below it so one
// broken tab (a throwing component, or a stale chunk hash after a deploy that
// 404s) shows a recoverable message instead of unmounting the whole campaign
// shell. React requires a class component for error boundaries.
//
// The shell keys this by the active tab, so switching tabs remounts the
// boundary and clears a stale error; the Reload button is the escape hatch for
// a stale-chunk case (a fresh page load fetches the current index + hashes).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Campaign tab failed to render:", error, info.componentStack);
  }

  private reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div className="campaign-error" role="alert">
        <p>This panel failed to load.</p>
        <div className="campaign-panel-actions">
          <button className="campaign-action" onClick={this.reset}>Retry</button>
          <button className="campaign-action" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </div>
    );
  }
}
