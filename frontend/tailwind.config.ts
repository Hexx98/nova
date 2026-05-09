import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        nova: {
          bg:       '#0b0f1a',
          surface:  '#111827',
          elevated: '#1a2235',
          border:   '#1f2d40',
          accent:   '#00c8f0',
          'accent-dim': '#0891b2',
          muted:    '#64748b',
        },
        severity: {
          critical: '#ef4444',
          high:     '#f97316',
          medium:   '#eab308',
          low:      '#3b82f6',
          info:     '#64748b',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
