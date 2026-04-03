import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        surface: "#141414",
        "border-dark": "#262626",
        "text-muted": "#71717a",
        "modal-border": "#e4e4e7",
        "modal-text": "#18181b",
      },
    },
  },
  plugins: [],
} satisfies Config;
