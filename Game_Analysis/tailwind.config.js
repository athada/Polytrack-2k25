/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx,vue,html}", //General catch-all
    "./entrypoints/**/*.{js,jsx,ts,tsx,vue,html}",
    "./entrypoints/popup/**/*.{js,jsx,ts,tsx,vue,html}",
    "./public/**/*.html",
    "./index.html",
  ],
  darkMode: "class", // Enable class-based dark mode
  theme: {
    extend: {},
  },
  plugins: [],
};
