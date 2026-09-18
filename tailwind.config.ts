import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        loog: {
          bg: "#08090B",
          panel: "#0F1114",
          card: "#14171C",
          border: "#1F242C",
          muted: "#8A93A0",
          text: "#F5F7FA",
          // azul oficial da marca — amostrado do logo real
          brand: "#0040F0",
          brand2: "#1E5AFF",
          accent: "#3B82F6",
          steel: "#C7CDD6", // cinza metálico do símbolo infinito
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "Inter", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 36px -8px rgba(0, 64, 240, 0.55)",
        card: "0 2px 24px -8px rgba(0,0,0,0.6), 0 1px 0 0 rgba(255,255,255,0.04) inset",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(1200px 400px at 50% -100px, rgba(0,71,171,0.18), transparent 60%)",
      },
    },
  },
  plugins: [],
};

export default config;
