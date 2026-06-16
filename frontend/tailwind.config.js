/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // All platform colors via CSS variables — supports opacity modifiers (bg-platform-bg/50)
        'platform-bg':              'rgb(var(--platform-bg-rgb) / <alpha-value>)',
        'platform-surface':         'rgb(var(--platform-surface-rgb) / <alpha-value>)',
        'platform-surface-raised':  'rgb(var(--platform-surface-raised-rgb) / <alpha-value>)',
        'platform-surface-overlay': 'rgb(var(--platform-surface-overlay-rgb) / <alpha-value>)',
        'platform-sidebar':         'rgb(var(--platform-sidebar-rgb) / <alpha-value>)',
        'platform-border':          'rgb(var(--platform-border-rgb) / <alpha-value>)',
        'platform-border-strong':   'rgb(var(--platform-border-strong-rgb) / <alpha-value>)',
        'platform-text-primary':    'rgb(var(--platform-text-primary-rgb) / <alpha-value>)',
        'platform-text-secondary':  'rgb(var(--platform-text-secondary-rgb) / <alpha-value>)',
        'platform-text-muted':      'rgb(var(--platform-text-muted-rgb) / <alpha-value>)',
        'platform-accent':          'rgb(var(--platform-accent-rgb) / <alpha-value>)',
        'platform-accent-hover':    'rgb(var(--platform-accent-hover-rgb) / <alpha-value>)',
        'platform-accent-active':   'rgb(var(--platform-accent-active-rgb) / <alpha-value>)',
        'platform-accent-muted':    'rgb(var(--platform-accent-rgb) / 0.1)',
        // Semantic (static — same in both themes)
        'platform-success': '#10B981',
        'platform-warning': '#F59E0B',
        'platform-error':   '#EF4444',
        'platform-info':    '#3B82F6',
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"]
      },
      borderRadius: {
        'card':   '8px',
        'button': '6px',
        'input':  '6px',
        'badge':  '4px',
        'avatar': '50%',
        'tab':    '6px'
      }
    },
  },
  plugins: [],
}
