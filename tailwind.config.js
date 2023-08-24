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
      "secondary": "#1e1e1e",
      "content": "#fff",
      "content-dark": "#1e1e1e",
      "primary-focus": "#9B0400",
      "secondary-focus": "#343448",
      "base-100": "#EDEDED",

      "mercedes": "#6CD3BF",
      "red_bull": "#3671C6",
      "ferrari": "#F91536",
      "mclaren": "#F58020",
      "alpine": "#2293D1",
      "alphatauri": "#5E8FAA",
      "aston_martin": "#358C75",
      "williams": "#37BEDD",
      "haas": "#B6BABD",
      "alfa": "#C92D4B",

    }
  },
  plugins: [],
}

