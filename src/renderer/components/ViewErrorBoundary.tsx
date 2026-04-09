import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ViewErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
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

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}
