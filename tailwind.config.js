/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./backend/static/index.html",
    "./backend/static/assets/app.js",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: '#1e293b',
        muted: '#64748b',
        line: '#e2e8f0',
        panel: '#f8fafc',
        brand: '#284f7d',
        'brand-light': '#3d83bd',
        'brand-hover': '#4f9ade',
      },
      boxShadow: {
        soft: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)',
      },
    },
  },
  plugins: [],
}
