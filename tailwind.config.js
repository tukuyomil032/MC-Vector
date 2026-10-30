/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': 'var(--background)',
        'bg-secondary': 'var(--surface)',
        'bg-tertiary': 'var(--surface-raised)',
        'bg-hover': 'var(--surface-muted)',
        'text-primary': 'var(--foreground)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        // Hex on purpose: Field.tsx uses focus:ring-accent/20, and Tailwind cannot apply
        // opacity to var() colors. Matches the dark --accent from data-accent="blue".
        accent: '#6ba3ff',
        'accent-hover': 'var(--accent-strong)',
        success: 'var(--success)',
        danger: 'var(--danger)',
        warning: 'var(--warning)',
        info: '#3b82f6',
        'border-color': 'var(--border)',
        'mv-surface-base': 'var(--mv-surface-base)',
        'mv-surface-text-primary': 'var(--mv-surface-text-primary)',
        'mv-surface-text-secondary': 'var(--mv-surface-text-secondary)',
        'mv-surface-text-muted': 'var(--mv-surface-text-muted)',
        'mv-surface-border': 'var(--mv-surface-border)',
        'mv-surface-border-strong': 'var(--mv-surface-border-strong)',
        'mv-panel-bg': 'var(--mv-panel-bg)',
        'mv-panel-bg-alt': 'var(--mv-panel-bg-alt)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['Menlo', 'Monaco', 'Consolas', 'Courier New', 'monospace'],
      },
      zIndex: {
        1000: '1000',
        2000: '2000',
        3000: '3000',
        9999: '9999',
        10000: '10000',
        99999: '99999',
      },
      animation: {
        pulse: 'pulse 1.5s infinite',
        fadeIn: 'fadeIn 0.2s ease-out',
        scaleIn: 'scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        pulse: {
          '0%, 100%': {
            opacity: '1',
            transform: 'scale(1)',
          },
          '50%': {
            opacity: '0.6',
            transform: 'scale(1.2)',
          },
        },
        fadeIn: {
          from: {
            opacity: '0',
            transform: 'translateY(20px)',
          },
          to: {
            opacity: '1',
            transform: 'translateY(0)',
          },
        },
        scaleIn: {
          from: {
            transform: 'scale(0.95)',
            opacity: '0',
          },
          to: {
            transform: 'scale(1)',
            opacity: '1',
          },
        },
      },
    },
  },
  plugins: [],
};
