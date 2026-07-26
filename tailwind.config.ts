import type { Config } from "tailwindcss";

/**
 * MathVision design tokens.
 * Single source of truth for the brand palette — from the MathVision logo:
 * indigo (brand primary, #2e3192) + orange (accent, #f05a2b) + white, with
 * teal kept for "approved/success" status, on cool neutral surfaces.
 */
const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Primary brand — MathVision indigo (#2e3192)
        brand: {
          50: "#eef0fb",
          100: "#dfe1f6",
          200: "#c2c5ec",
          300: "#989cdd",
          400: "#6d72c9",
          500: "#4a4fb0",
          600: "#2e3192", // primary — the logo indigo
          700: "#282a7a",
          800: "#222463",
          900: "#1d1f50",
          950: "#101132",
        },
        // Accent — MathVision orange (#f05a2b). (Kept the key name "gold" so the
        // whole app's accent recolours from here; values are now the brand orange.)
        gold: {
          50: "#fef1ea",
          100: "#fcdcc9",
          200: "#f9b995",
          300: "#f6905f",
          400: "#f2703c",
          500: "#f05a2b", // accent — the logo orange
          600: "#d5451b",
          700: "#b23815",
          800: "#8f2f16",
          900: "#742915",
        },
        // Teal — secondary / "approved"
        teal: {
          50: "#e9f7f7",
          100: "#c9ecec",
          200: "#95d6d8",
          300: "#5cbabd",
          400: "#329ba0",
          500: "#177f85",
          600: "#0e666c",
          700: "#0d5257",
          800: "#0d4246",
          900: "#0c373a",
        },
        // Cool neutral scale for text + surfaces
        ink: {
          50: "#f6f8fa",
          100: "#eceff3",
          200: "#dbe1e9",
          300: "#c0cad6",
          400: "#93a1b3",
          500: "#6b7a8e",
          600: "#4f5d70",
          700: "#3c4859",
          800: "#28313d",
          900: "#161c25",
        },
      },
      fontFamily: {
        serif: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-plex-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(29, 31, 80, 0.05), 0 1px 3px rgba(29, 31, 80, 0.06)",
        "card-hover": "0 4px 12px rgba(29, 31, 80, 0.10), 0 2px 4px rgba(29, 31, 80, 0.06)",
        pop: "0 12px 40px rgba(29, 31, 80, 0.18)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out both",
        "scale-in": "scale-in 0.15s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
