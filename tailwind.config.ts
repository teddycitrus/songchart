import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  future: {
    // Scopes all `hover:` utilities to `@media (hover: hover)`, so hover
    // styles don't trigger on touch devices — fixes the iOS/Android
    // "tap once to hover, tap again to click" double-tap bug.
    hoverOnlyWhenSupported: true,
  },
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
