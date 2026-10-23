/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'] },
      colors: {
        ink: { 950: '#121212', 900: '#181818', 850: '#1e1e1e', 800: '#242424', 700: '#2e2e2e', 600: '#3a3a3a', 500: '#555', 400: '#7a7a7a', 300: '#a3a3a3', 200: '#cfcfcf', 100: '#ededed' },
        accent: { DEFAULT: '#e8a33d', dim: '#b87f2a' },
      },
    },
  },
  plugins: [],
}
