/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /** TMAP product accent (screenshots ~ #0066FF) */
        brand: {
          DEFAULT: "#0066FF",
          dark: "#0052CC",
          light: "#E8F1FF",
        },
        tmap: {
          surface: "#F2F4F7",
          muted: "#8E8E93",
          ink: "#1A1A1A",
        },
      },
      fontFamily: {
        sans: [
          '"Pretendard Variable"',
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Apple SD Gothic Neo"',
          '"Noto Sans KR"',
          "sans-serif",
        ],
      },
      boxShadow: {
        note: "0 6px 20px rgba(0,0,0,0.12)",
        card: "0 2px 12px rgba(0, 0, 0, 0.06)",
        float: "0 4px 20px rgba(0, 0, 0, 0.08)",
      },
    },
  },
  plugins: [],
};
