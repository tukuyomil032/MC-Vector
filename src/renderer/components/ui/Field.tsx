import { type VariantProps, cn, cva } from '@/lib/ui';
import React from 'react';

export type FieldVariant = 'default' | 'modal';

export const fieldVariants = cva(
  'w-full border text-text-primary transition-all focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'px-3 py-2.5 bg-bg-primary border-border-color rounded-md text-[0.95rem] focus:border-zinc-600 focus:ring-accent/20',
        modal:
          'mt-4 mb-5 box-border rounded-md border-zinc-700 bg-bg-primary p-2.5 text-base text-white focus:border-zinc-600 focus:ring-accent/20',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof fieldVariants> {
  variant?: FieldVariant;
}

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    VariantProps<typeof fieldVariants> {
  variant?: FieldVariant;
}

export interface NativeSelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement>,
    VariantProps<typeof fieldVariants> {
  variant?: FieldVariant;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, variant, ...props }, ref) => (
    <input ref={ref} className={cn(fieldVariants({ variant }), className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, variant, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldVariants({ variant }), className)} {...props} />
  ),
);
Textarea.displayName = 'Textarea';

export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, variant, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(fieldVariants({ variant }), 'native-select', className)}
      {...props}
    />
  ),
);
NativeSelect.displayName = 'NativeSelect';
