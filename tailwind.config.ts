import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: [
          "var(--font-jetbrains)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      colors: {
        ink: {
          50: "#f7f7f8",
          100: "#eeeef1",
          200: "#d9dade",
          300: "#b8b9c0",
          400: "#83858f",
          500: "#5d5f6a",
          600: "#43454e",
          700: "#2f3138",
          800: "#1d1f25",
          900: "#0f1014",
        },
        pillar: {
          shipped: "#4f617a",
          leverage: "#6a6da6",
          reach: "#5b8a86",
        },
        accent: "#b65b3c",
      },
      boxShadow: {
        card: "0 1px 0 rgba(15, 16, 20, 0.04)",
        "card-hover": "0 2px 0 rgba(15, 16, 20, 0.06), 0 8px 24px -16px rgba(15, 16, 20, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
