export type FeedbackSeverity = 'info' | 'warning' | 'error';
export type FeedbackPresentation = 'toast' | 'inline' | 'dialog' | 'progress';
export type FeedbackNotificationKind = 'success' | FeedbackSeverity;

export interface FeedbackDialogAction {
  label: string;
  onSelect?: () => void | Promise<void>;
}

export interface FeedbackDialogRequest {
  severity: FeedbackSeverity;
  title: string;
  description: string;
  primaryAction?: FeedbackDialogAction;
  secondaryAction?: FeedbackDialogAction;
  dismissible?: boolean;
}

export interface FeedbackPolicyInput {
  success?: boolean;
  progress?: boolean;
  blocksAction?: boolean;
  retryable?: boolean;
  requiresDecision?: boolean;
}

/**
 * Shared presentation policy for user feedback. Screens describe the
 * interaction; they do not invent a new notification category.
 */
export function resolveFeedbackPresentation({
  progress = false,
  blocksAction = false,
  retryable = false,
  requiresDecision = false,
}: FeedbackPolicyInput): FeedbackPresentation {
  if (progress) {
    return 'progress';
  }
  if (blocksAction || requiresDecision) {
    return 'dialog';
  }
  if (retryable) {
    return 'inline';
  }
  return 'toast';
}
