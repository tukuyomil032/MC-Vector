import {
  Progress as ArcProgress,
  type ProgressProps as ArcProgressProps,
} from '@/components/arc/progress/progress';

export interface ProgressProps extends Omit<ArcProgressProps, 'value' | 'max'> {
  /** Percent, 0 to 100. Out-of-range values are clamped. */
  value: number;
}

export function Progress({ value, ...props }: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  return <ArcProgress value={clampedValue} max={100} {...props} />;
}
