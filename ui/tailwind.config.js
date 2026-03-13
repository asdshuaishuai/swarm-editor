/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'editor-bg': '#1e1e1e',
        'editor-line': '#2d2d2d',
        'panel-bg': '#252526',
        'panel-border': '#3c3c3c',
        'accent': '#0e639c',
        'accent-hover': '#1177bb',
        'text-primary': '#cccccc',
        'text-secondary': '#858585',
        'success': '#4ec9b0',
        'warning': '#dcdcaa',
        'error': '#f14c4c',
        'info': '#75beff',
      },
    },
  },
  plugins: [],
}