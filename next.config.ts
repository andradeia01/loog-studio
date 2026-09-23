import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["sharp", "@napi-rs/canvas"],
  // Sem isso, o Next 15 pode pegar o home dir como workspace root
  // (se houver algum lockfile no parent) e o plugin Netlify gera paths errados.
  outputFileTracingRoot: path.resolve("."),
  // Garante que os TTFs de public/fonts vão pro bundle da function serverless
  // (o /api/generate lê essas fontes via `fontfile` do sharp).
  outputFileTracingIncludes: {
    "/api/generate": ["./public/fonts/**"],
    "/api/**/*": ["./public/fonts/**"],
  },
  eslint: { ignoreDuringBuilds: true },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "*.supabase.in" },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
