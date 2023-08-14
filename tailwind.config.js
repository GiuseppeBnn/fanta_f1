/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './views/**/**/*.ejs',

  ],
  theme: {
    extend: {},
    colors: {
      "primary": "#e10600",
      "secondary": "#15151e",
      "content": "#fff",
      "primary-focus": "#9B0400",
      "secondary-focus": "#343448",
    }
  },
  plugins: [],
}

