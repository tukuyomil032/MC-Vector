/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': '#09090b',
        'bg-secondary': '#18181b',
        'bg-tertiary': '#27272a',
        'bg-hover': '#3f3f46',
        'text-primary': '#ffffff',
        'text-secondary': '#a1a1aa',
        'text-muted': '#71717a',
        accent: '#ffffff',
        'accent-hover': '#e4e4e7',
        success: '#10b981',
        danger: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6',
        'border-color': '#27272a',
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
