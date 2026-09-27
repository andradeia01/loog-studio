import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LOOG Studio",
  description:
    "Movimento conecta o amanhã. Personalize artes, gere conteúdo com IA e cresça sua base.",
  metadataBase: new URL("https://loogstudio.netlify.app"),
  openGraph: {
    title: "LOOG Studio",
    description: "Estúdio oficial dos consultores LOOG.",
    type: "website",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LOOG Studio",
  },
};

export const viewport: Viewport = {
  themeColor: "#050608",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <body>{children}</body>
    </html>
  );
}
