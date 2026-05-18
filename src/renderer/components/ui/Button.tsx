import { cn, cva, type VariantProps } from '@/lib/ui';
import React from 'react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-all focus:outline-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: [
          'text-white',
          'bg-gradient-to-r from-[#0ea5e9] to-[#06b6d4]',
          'shadow-[0_8px_20px_rgba(14,165,233,0.22)]',
          'hover:brightness-105 hover:-translate-y-px',
        ],
        secondary: [
          'border text-text-secondary',
          'bg-[rgba(39,39,42,0.45)]',
          'border-[rgba(82,82,91,0.72)]',
          'hover:bg-[rgba(63,63,70,0.45)] hover:text-text-primary',
        ],
        start: [
          'text-white font-semibold min-w-[100px]',
          'bg-gradient-to-br from-green-500 to-green-600',
          'shadow-lg shadow-green-500/25',
          'hover:brightness-110 hover:-translate-y-0.5',
        ],
        stop: [
          'text-white font-semibold min-w-[100px]',
          'bg-gradient-to-br from-red-500 to-red-600',
          'shadow-lg shadow-red-500/25',
          'hover:brightness-110 hover:-translate-y-0.5',
        ],
        restart: [
          'text-white font-semibold min-w-[100px]',
          'bg-gradient-to-br from-blue-500 to-blue-600',
          'shadow-lg shadow-blue-500/25',
          'hover:brightness-110 hover:-translate-y-0.5',
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
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
