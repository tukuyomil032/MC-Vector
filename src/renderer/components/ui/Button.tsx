import { type VariantProps, cn, cva } from '@/lib/ui';
import React from 'react';

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

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all focus:outline-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: [
          'px-4 py-2 rounded-md font-bold bg-white text-black hover:bg-zinc-200 hover:-translate-y-px',
        ],
        secondary: [
          'border text-text-secondary',
          'px-4 py-2 rounded-md text-sm transition-colors',
          'border-[var(--mv-border-soft)] bg-[rgba(39,39,42,0.45)]',
          'hover:bg-[rgba(63,63,70,0.45)] hover:text-text-primary',
        ],
        start: [
          'flex items-center justify-center gap-1.5 min-w-[100px] px-5 py-2 rounded-md font-semibold text-white',
          'bg-green-600 hover:bg-green-700 hover:-translate-y-0.5',
        ],
        stop: [
          'flex items-center justify-center gap-1.5 min-w-[100px] px-5 py-2 rounded-md font-semibold text-white',
          'bg-red-600 hover:bg-red-700 hover:-translate-y-0.5',
        ],
        restart: [
          'flex items-center justify-center gap-1.5 min-w-[100px] px-5 py-2 rounded-md font-semibold text-white',
          'border border-zinc-700 bg-zinc-700 hover:bg-zinc-600 hover:-translate-y-0.5',
        ],
        // アクセントカラー (#5865F2) ベースの汎用ボタン（モーダル内主要アクション）
        accent: [
          'text-white',
          'bg-[#5865F2] hover:bg-[#4752c4]',
          'shadow-[0_4px_14px_rgba(88,101,242,0.28)]',
          'hover:-translate-y-px',
        ],
        ghost: ['bg-transparent text-text-secondary', 'hover:bg-white/10 hover:text-text-primary'],
        danger: [
          'text-white',
          'bg-gradient-to-br from-red-500 to-red-600',
          'shadow-lg shadow-red-500/25',
          'hover:brightness-110 hover:-translate-y-0.5',
        ],
        modalPrimary: [
          'px-4 py-2 rounded-lg border-none bg-accent text-black text-sm font-bold',
          'hover:bg-accent-hover disabled:opacity-50',
        ],
        modalSecondary: [
          'px-4 py-2 rounded-lg border border-zinc-700 bg-transparent text-zinc-300 text-sm font-bold',
          'hover:bg-zinc-800',
        ],
      },
      size: {
        sm: 'h-7 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-5 text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  variant?: ButtonVariant;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
