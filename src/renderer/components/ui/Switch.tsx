import * as React from 'react';
import {
  Switch as ArcSwitch,
  type SwitchProps as ArcSwitchProps,
} from '@/components/arc/switch/switch';

export interface SwitchProps extends Omit<ArcSwitchProps, 'checked' | 'onCheckedChange'> {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, ...props },
  ref,
) {
  return <ArcSwitch ref={ref} checked={checked} onCheckedChange={onCheckedChange} {...props} />;
});
Switch.displayName = 'Switch';
