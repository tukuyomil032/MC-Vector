import type { ReactElement } from 'react';
import { Tooltip as ArcTooltip } from '@/components/arc/tooltip/tooltip';

interface TooltipProps {
  content: string;
  children: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Accepted for existing call sites. Arc tooltips position on the side only, so this is ignored. */
  align?: 'start' | 'center' | 'end';
  /** Accepted for existing call sites. Arc tooltips use a fixed open delay, so this is ignored. */
  delayDuration?: number;
  disabled?: boolean;
}

export function Tooltip({
  content,
  children,
  side = 'right',
  align: _align,
  delayDuration: _delayDuration,
  disabled = false,
}: TooltipProps) {
  if (disabled || !content) {
    return children;
  }

  return (
    <ArcTooltip content={content} side={side}>
      {children}
    </ArcTooltip>
  );
}
