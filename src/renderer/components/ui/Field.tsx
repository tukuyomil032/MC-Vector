import * as React from 'react';
import { Input as ArcInput } from '@/components/arc/input/input';
import { Textarea as ArcTextarea } from '@/components/arc/textarea/textarea';
import { cn } from '@/lib/ui';
import styles from './Field.module.css';

/**
 * Legacy field variants. Arc fields have one look, so `variant` is accepted for existing call sites
 * and ignored. The old modal spacing (`modal`) is not kept.
 */
export type FieldVariant = 'default' | 'modal';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: FieldVariant;
  /** Visible label. Arc always renders one; without it the label is hidden and aria-label or placeholder names the field. */
  label?: string;
  description?: string;
  error?: string;
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: FieldVariant;
  label?: string;
  description?: string;
  error?: string;
}

export interface NativeSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  variant?: FieldVariant;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { variant: _variant, label, description, error, className, ...props },
  ref,
) {
  if (label) {
    return (
      <ArcInput
        {...props}
        ref={ref}
        label={label}
        description={description}
        error={error}
        className={className}
      />
    );
  }
  // Call sites label their fields outside this component. Arc always renders a label element, so
  // the bare variant hides it and the name comes from aria-label or the placeholder instead.
  return (
    <div className={styles.bare}>
      <ArcInput
        {...props}
        ref={ref}
        label={props['aria-label'] ?? props.placeholder ?? ''}
        description={description}
        error={error}
        className={className}
      />
    </div>
  );
});
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { variant: _variant, label, description, error, className, ...props },
  ref,
) {
  if (label) {
    return (
      <ArcTextarea
        {...props}
        ref={ref}
        label={label}
        description={description}
        error={error}
        className={className}
      />
    );
  }
  return (
    <div className={styles.bare}>
      <ArcTextarea
        {...props}
        ref={ref}
        label={props['aria-label'] ?? props.placeholder ?? ''}
        description={description}
        error={error}
        className={className}
      />
    </div>
  );
});
Textarea.displayName = 'Textarea';

/**
 * Arc's Select is a Radix popover with a visible label and no native onChange, so call sites that
 * depend on native select behavior keep a real <select>. It is restyled with the Arc tokens here,
 * to match the Arc input and select trigger beside it.
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  function NativeSelect({ variant: _variant, className, ...props }, ref) {
    return <select ref={ref} className={cn(styles.nativeSelect, className)} {...props} />;
  },
);
NativeSelect.displayName = 'NativeSelect';
