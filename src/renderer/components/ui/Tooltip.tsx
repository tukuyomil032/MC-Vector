import { cn } from '@/lib/ui';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delayDuration?: number;
  disabled?: boolean;
}

export function Tooltip({
  content,
  children,
  side = 'right',
  align = 'center',
  delayDuration = 400,
  disabled = false,
}: TooltipProps) {
  if (disabled || !content) {
    return <>{children}</>;
  }

  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            align={align}
            sideOffset={6}
            className={cn(
              'z-50 max-w-xs rounded-md px-2.5 py-1.5',
              'bg-zinc-800 border border-zinc-700',
              'text-xs text-zinc-100 leading-snug',
              'shadow-lg',
              'animate-in fade-in-0 zoom-in-95',
              'data-[side=bottom]:slide-in-from-top-1',
              'data-[side=left]:slide-in-from-right-1',
              'data-[side=right]:slide-in-from-left-1',
              'data-[side=top]:slide-in-from-bottom-1',
            )}
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-zinc-700" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
