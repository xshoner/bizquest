/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Pretendard", "Inter", "system-ui", "sans-serif"]
      },
      boxShadow: {
        lift: "0 10px 30px rgba(15, 23, 42, 0.10)"
      }
    }
  },
  plugins: []
};
