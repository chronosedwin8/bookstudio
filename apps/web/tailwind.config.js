/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,ts}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcdaff',
          300: '#8ec3ff',
          400: '#59a1ff',
          500: '#337dff',
          600: '#1c5df5',
          700: '#1549e1',
          800: '#183db6',
          900: '#19388f',
        },
        // Fondos suaves recomendados para lectura inclusiva.
        paper: '#F7F4EC',
        opal: '#EDF2F0',
      },
      fontFamily: {
        sans: ['Lato', 'Cabin', 'Noto Sans', 'system-ui', 'sans-serif'],
        dyslexic: ['OpenDyslexic', 'Lato', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
