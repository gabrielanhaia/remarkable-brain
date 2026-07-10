/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      // "Fine writing tool" palette — fountain-pen ink on fine paper. Tokens live in index.css as
      // "R G B" triplets so every utility supports an /opacity modifier and both themes switch for free.
      colors: {
        paper: 'rgb(var(--paper) / <alpha-value>)',
        sheet: 'rgb(var(--sheet) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        pen: {
          DEFAULT: 'rgb(var(--pen) / <alpha-value>)',
          soft: 'rgb(var(--pen-soft) / <alpha-value>)',
        },
        good: 'rgb(var(--good) / <alpha-value>)',
        med: 'rgb(var(--med) / <alpha-value>)',
        high: 'rgb(var(--high) / <alpha-value>)',
        low: 'rgb(var(--low) / <alpha-value>)',
        scan: {
          paper: 'rgb(var(--scan-paper) / <alpha-value>)',
          ink: 'rgb(var(--scan-ink) / <alpha-value>)',
        },
      },
      fontFamily: {
        // Newsreader is both the display voice and the "manuscript" (transcription) voice.
        display: ['Newsreader', 'Iowan Old Style', 'Palatino', 'Georgia', 'serif'],
        serif: ['Newsreader', 'Iowan Old Style', 'Palatino', 'Georgia', 'serif'],
        sans: ['Geist', 'system-ui', '-apple-system', '"Segoe UI"', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'monospace'],
      },
      boxShadow: {
        // A page has weight: a soft, real drop shadow, not a glassy glow.
        card: '0 1px 0 rgb(var(--ink) / 0.03), 0 10px 24px -14px rgb(var(--ink) / 0.28)',
        lift: '0 1px 0 rgb(var(--ink) / 0.03), 0 24px 44px -22px rgb(var(--ink) / 0.30), 0 5px 12px -8px rgb(var(--ink) / 0.22)',
      },
      keyframes: {
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'ink-draw': { '0%': { strokeDashoffset: '1' }, '100%': { strokeDashoffset: '0' } },
      },
      animation: {
        shimmer: 'shimmer 1.6s infinite',
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.4s ease both',
      },
    },
  },
  plugins: [],
};
