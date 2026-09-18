import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LOOG Studio — crie suas artes",
  description:
    "Personalize, gere e publique artes exclusivas da LOOG Proteção Veicular em segundos.",
  metadataBase: new URL("http://localhost:3005"),
  openGraph: {
    title: "LOOG Studio",
    description: "Crie suas artes LOOG em segundos.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#08090B",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body>{children}</body>
    </html>
  );
}
