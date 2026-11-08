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
      // Colour roles live as CSS custom properties in app/globals.css.
      colors: {
        ground: "var(--ground)",
        surface: "var(--surface)",
        hover: "var(--hover)",
        raised: "var(--raised)",
        "raised-hover": "var(--raised-hover)",
        line: "var(--border)",
        rule: "var(--rule)",
        control: "var(--control)",
        ink: "var(--text)",
        "ink-hover": "var(--text-hover)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        accent: "var(--accent)",
        "accent-tint": "var(--accent-tint)",
        negative: "var(--negative)",
        "negative-hover": "var(--negative-hover)",
        "negative-bg": "var(--negative-bg)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
