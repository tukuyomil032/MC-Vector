import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ViewErrorBoundaryProps {
  children: ReactNode;
  /** Shown after a render error. A function receives `reset`, which clears the error and retries the children. */
  fallback: ReactNode | ((reset: () => void) => ReactNode);
}

interface ViewErrorBoundaryState {
  hasError: boolean;
}

export default class ViewErrorBoundary extends Component<
  ViewErrorBoundaryProps,
  ViewErrorBoundaryState
> {
  state: ViewErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): ViewErrorBoundaryState {
    return {
      hasError: true,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ViewErrorBoundary] Render error:', error, errorInfo);
  }

  componentDidUpdate(prevProps: ViewErrorBoundaryProps) {
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  reset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      return typeof fallback === 'function' ? fallback(this.reset) : fallback;
    }
    return this.props.children;
  }
}
