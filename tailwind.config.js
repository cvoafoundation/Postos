/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0A0A0B',
        charcoal: '#17181A',
        surface: '#1F2023',
        elevated: '#26272B',
        hairline: '#2E2F33',
        ink: '#EDEBE4',
        muted: '#9A9A93',
        gold: {
          DEFAULT: '#C9A227',
          bright: '#E8C468',
          dim: '#8A6F1D',
        },
        status: {
          active: '#4A7C59',
          developing: '#C9A227',
          attention: '#A3423D',
        },
      },
      fontFamily: {
        display: ['"Bebas Neue"', 'sans-serif'],
        body: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      letterSpacing: {
        widest2: '0.2em',
      },
    },
  },
  plugins: [],
}
