/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
    "./index.html",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "WenQuanYi Micro Hei",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

