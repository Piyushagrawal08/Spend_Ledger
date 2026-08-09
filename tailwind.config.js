/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          950: 'rgb(var(--c-ink-950) / <alpha-value>)',
          900: 'rgb(var(--c-ink-900) / <alpha-value>)',
          850: 'rgb(var(--c-ink-850) / <alpha-value>)',
          800: 'rgb(var(--c-ink-800) / <alpha-value>)',
          700: 'rgb(var(--c-ink-700) / <alpha-value>)',
          600: 'rgb(var(--c-ink-600) / <alpha-value>)',
          border: 'rgb(var(--c-ink-border) / <alpha-value>)',
        },
        paper: {
          100: 'rgb(var(--c-paper-100) / <alpha-value>)',
          300: 'rgb(var(--c-paper-300) / <alpha-value>)',
          500: 'rgb(var(--c-paper-500) / <alpha-value>)',
        },
        signal: {
          amber: 'rgb(var(--c-signal-amber) / <alpha-value>)',
          amberDim: 'rgb(var(--c-signal-amberDim) / <alpha-value>)',
          green: 'rgb(var(--c-signal-green) / <alpha-value>)',
          red: 'rgb(var(--c-signal-red) / <alpha-value>)',
          blue: 'rgb(var(--c-signal-blue) / <alpha-value>)',
          violet: 'rgb(var(--c-signal-violet) / <alpha-value>)',
        },
      },
      fontFamily: {
        display: ['var(--font-display)', 'sans-serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 20px 40px -20px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};
