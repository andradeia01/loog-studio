import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LOOG Studio",
  description:
    "Movimento conecta o amanhã. Personalize artes, gere conteúdo com IA e cresça sua base.",
  metadataBase: new URL("https://loogstudio.netlify.app"),
  manifest: "/manifest.json",
  openGraph: {
    title: "LOOG Studio",
    description: "Estúdio oficial dos consultores LOOG.",
    type: "website",
    images: ["/icon-512.png"],
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "LOOG Studio",
    startupImage: ["/icon-512.png"],
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
