import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        loog: {
          // Paleta oficial LOOG Brand Book
          bg: "#050608",         // Preto Absoluto
          panel: "#14171C",      // meio-tom entre grafite e preto
          card: "#191D24",       // card lifted
          border: "#2A2E36",     // borda sutil (grafite claro)
          muted: "#5A6470",      // Cinza Médio (oficial)
          text: "#F6F7F9",       // Branco Puro (oficial)
          // Azul LOOG oficial
          brand: "#0047AB",      // Azul LOOG (primária)
          brand2: "#1C63FF",     // Azul Elétrico (interações, hover)
          brand3: "#5B8DFF",     // Azul Luz (highlights, ranges)
          accent: "#0E2B63",     // Azul Profundo (headers escuros)
          steel: "#C9CDD2",      // Prata Metálico
          soft: "#D7DCE2",       // Cinza Suave
          graphite: "#23262C",   // Grafite (surfaces)
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        // Títulos: Exo 2 (oficial LOOG)
        display: ['"Exo 2"', "Inter", "sans-serif"],
      },
      fontSize: {
        // Hierarquia oficial (adaptada para web: 1pt ≈ 1.333px)
        "loog-headline": ["3rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }], // ~48px web / 72pt print
        "loog-subhead":  ["1.5rem", { lineHeight: "1.15", letterSpacing: "-0.01em" }],
        "loog-body":     ["1rem",   { lineHeight: "1.55" }],
        "loog-caption":  ["0.75rem",{ lineHeight: "1.4", letterSpacing: "0.02em" }],
      },
      boxShadow: {
        glow: "0 0 36px -8px rgba(0, 71, 171, 0.55)",
        card: "0 2px 24px -8px rgba(0,0,0,0.7), 0 1px 0 0 rgba(255,255,255,0.04) inset",
        soft: "0 8px 32px -12px rgba(0,71,171,0.35)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      backgroundImage: {
        "grid-fade":
          "radial-gradient(1200px 400px at 50% -100px, rgba(0,71,171,0.22), transparent 60%)",
      },
      // Safe areas em mobile (iOS notch, home indicator)
      spacing: {
        "safe-t": "env(safe-area-inset-top)",
        "safe-b": "env(safe-area-inset-bottom)",
        "bottom-nav": "72px",
      },
    },
    screens: {
      xs: "375px",   // iPhone SE mín
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
  },
  plugins: [],
};

export default config;
