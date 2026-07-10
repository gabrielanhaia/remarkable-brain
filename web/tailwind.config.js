/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      // Warm editorial dark palette. Coral accent + ivory text on warm charcoal.
      colors: {
        coral: {
          DEFAULT: '#D97757',
          soft: '#f0a988',
          deep: '#b85c3f',
        },
        ivory: {
          DEFAULT: '#f3ece2',
          dim: '#c9bfb2',
          faint: '#8f857a',
        },
        // Warm near-black surfaces (never pure black; a touch of red/brown warmth).
        ink: {
          950: '#100d0b',
          900: '#16110e',
          850: '#1c1713',
          800: '#231d18',
          700: '#2e261f',
          600: '#3b3128',
          500: '#4c3f34',
        },
      },
      fontFamily: {
        display: ['"Iowan Old Style"', '"Palatino Linotype"', 'Palatino', '"Book Antiqua"', 'Georgia', 'serif'],
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6)',
        lift: '0 2px 4px rgba(0,0,0,0.5), 0 16px 40px -16px rgba(0,0,0,0.7)',
        glow: '0 0 0 1px rgba(217,119,87,0.35), 0 8px 30px -8px rgba(217,119,87,0.25)',
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
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
