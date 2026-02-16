/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0F0F14',
        foreground: '#E2E2E5',
        primary: {
          DEFAULT: '#0EA5E9',
          foreground: '#FFFFFF',
          hover: '#0284C7',
        },
        secondary: {
          DEFAULT: '#1E1E2A',
          foreground: '#A1A1AA',
        },
        accent: {
          DEFAULT: '#06B6D4',
          foreground: '#E0F2FE',
        },
        muted: {
          DEFAULT: '#18181B',
          foreground: '#71717A',
        },
      },
      animation: {
        'bounce-slow': 'bounce 3s infinite',
      },
    },
  },
  plugins: [],
};