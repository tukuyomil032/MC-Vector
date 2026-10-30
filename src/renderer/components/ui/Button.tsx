import * as React from 'react';
import {
  Button as ArcButton,
  type ButtonProps as ArcButtonProps,
  type ButtonVariant as ArcButtonVariant,
} from '@/components/arc/button/button';

/**
 * Legacy variant names, kept so existing call sites compile unchanged. Each one maps onto one of
 * the four Arc variants. The old colors (green start, red stop, gray restart, accent modal buttons)
 * are not kept; server actions now share the Arc primary, secondary, and danger looks.
 */
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'start'
  | 'stop'
  | 'restart'
  | 'accent'
  | 'ghost'
  | 'danger'
  | 'modalPrimary'
  | 'modalSecondary';

const ARC_VARIANT: Record<ButtonVariant, ArcButtonVariant> = {
  primary: 'primary',
  secondary: 'secondary',
  ghost: 'ghost',
  danger: 'danger',
  stop: 'danger',
  start: 'primary',
  restart: 'secondary',
  accent: 'primary',
  modalPrimary: 'primary',
  modalSecondary: 'secondary',
};

export interface ButtonProps extends Omit<ArcButtonProps, 'variant'> {
  variant?: ButtonVariant;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', ...props },
  ref,
) {
  return <ArcButton ref={ref} variant={ARC_VARIANT[variant]} {...props} />;
});
Button.displayName = 'Button';
