import type { Config } from "tailwindcss";

/**
 * MathVision design tokens.
 * This is the single source of truth for the brand palette — rebrand the whole
 * app by editing the values below. Deep academic blue (brand) + warm gold accent
 * + teal secondary, on cool neutral surfaces.
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
        // Primary brand — MathVision deep blue
        brand: {
          50: "#eef4fb",
          100: "#d7e5f4",
          200: "#b0cae9",
          300: "#82a9d8",
          400: "#5184c1",
          500: "#3066a6",
          600: "#1d4e89", // primary
          700: "#163d6e",
          800: "#122f53",
          900: "#0d223d",
          950: "#071627",
        },
        // Warm gold — accents, highlights, secondary CTAs
        gold: {
          50: "#fbf6ea",
          100: "#f5e8c6",
          200: "#ecd28c",
          300: "#e2b94f",
          400: "#d6a32e",
          500: "#c08a22", // accent
          600: "#9c6c1c",
          700: "#7a521b",
          800: "#66451c",
          900: "#573a1b",
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
        card: "0 1px 2px rgba(13, 34, 61, 0.05), 0 1px 3px rgba(13, 34, 61, 0.06)",
        "card-hover": "0 4px 12px rgba(13, 34, 61, 0.10), 0 2px 4px rgba(13, 34, 61, 0.06)",
        pop: "0 12px 40px rgba(13, 34, 61, 0.18)",
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
