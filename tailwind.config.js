/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './views/**/**/*.ejs',
  ],
  theme: {
    extend: {
      fontFamily:{
        f1Regular: "F1Regular",
        f1Bold: "F1Bold",
        f1Black: "F1Black",
        f1Wide: "F1Wide",
      }
    },
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

