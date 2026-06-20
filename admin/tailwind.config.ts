import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        mova: {
          midnight: "#0D0D1A",
          violet: "#6366F1",
          "violet-light": "#8B5CF6",
          green: "#10B981",
          orange: "#F97316",
          gold: "#FBBF24",
          border: "#E2E8F0",
          cloud: "#F4F3FF",
        },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        mova: "18px",
      },
      boxShadow: {
        mova: "0 8px 24px rgba(13, 13, 26, 0.08)",
      },
    },
  },
  plugins: [],
};

export default config;
