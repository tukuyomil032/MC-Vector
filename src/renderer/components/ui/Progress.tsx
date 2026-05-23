import { cn } from '@/lib/ui';
import * as ProgressPrimitive from '@radix-ui/react-progress';

interface ProgressProps {
  value: number;
  className?: string;
}

export function Progress({ value, className }: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <ProgressPrimitive.Root
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-zinc-700', className)}
      value={clampedValue}
    >
      <ProgressPrimitive.Indicator
        className="h-full w-full flex-1 bg-[#5865F2] transition-all duration-200"
        style={{ transform: `translateX(-${100 - clampedValue}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
