import type { Config } from 'tailwindcss';

// 29cm 정통 미니멀 — 토큰은 globals.css의 CSS 변수와 연결된다.
const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: 'var(--ink)',
        paper: 'var(--paper)',
        'paper-off': 'var(--paper-off)',
        gray: 'var(--gray)',
        hairline: 'var(--hairline)',
        accent: 'var(--accent)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
      },
      letterSpacing: {
        label: '0.12em',
        tight: '-0.02em',
      },
      maxWidth: {
        content: '720px',
        wide: '960px',
      },
      borderRadius: {
        DEFAULT: '2px',
        sm: '2px',
        md: '4px',
      },
    },
  },
  plugins: [],
};

export default config;
