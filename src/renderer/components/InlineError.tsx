import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

interface InlineErrorProps {
  message: string;
  onRetry?: () => void | Promise<void>;
  retryLabel?: string;
  action?: ReactNode;
  className?: string;
  testId?: string;
}

export default function InlineError({
  message,
  onRetry,
  retryLabel = 'Retry',
  action,
  className = '',
  testId,
}: InlineErrorProps) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className={`flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100 ${className}`}
    >
      <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-red-300" />
      <span className="min-w-0 flex-1">{message}</span>
      {action}
      {onRetry ? (
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-300/40 px-2 py-1 text-xs font-semibold text-red-100 hover:bg-red-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-200"
          onClick={() => void onRetry()}
        >
          <RefreshCw size={12} aria-hidden="true" />
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
