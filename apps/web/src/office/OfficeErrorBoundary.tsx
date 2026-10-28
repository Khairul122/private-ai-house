import { Component, type ErrorInfo, type ReactNode } from 'react';

export type OfficeErrorBoundaryProps = {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class OfficeErrorBoundary extends Component<OfficeErrorBoundaryProps, State> {
  override state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div className="vo3d-fallback" role="alert">
          <div>
            <h3>Terjadi kendala pada tampilan visual kantor</h3>
            <p>{this.state.error.message}</p>
            <button type="button" onClick={this.reset}>Coba lagi</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
