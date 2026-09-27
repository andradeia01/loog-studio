import Link from "next/link";
import type { Metadata } from "next";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { ReelsFactory } from "@/components/reels/ReelsFactory";
import { supabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Fábrica de Reels — LOOG Studio",
};

export default function ReelsPage() {
  return (
    <main className="min-h-screen pb-24">
      <header className="border-b border-loog-border/60 bg-loog-bg/70 backdrop-blur">
        <div className="container-loog flex items-center justify-between py-4">
          <Link href="/studio" className="inline-flex">
            <LoogLogo className="h-8" priority />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/studio" className="btn-ghost !px-3 !py-2 !text-xs">← Voltar ao Studio</Link>
            {supabaseConfigured() && <LogoutButton className="!py-2 !px-3 !text-xs" />}
          </div>
        </div>
      </header>

      <section className="container-loog pt-8">
        <h1 className="font-display text-3xl font-bold sm:text-4xl">Fábrica de Reels</h1>
        <p className="mt-1 max-w-2xl text-loog-muted">
          Suba seus vídeos e cada um já entra cortado no template 9:16, com seu perfil do Instagram e a headline no topo.
          Baixe tudo pronto pra postar.
        </p>
      </section>

      <ReelsFactory />
    </main>
  );
}
