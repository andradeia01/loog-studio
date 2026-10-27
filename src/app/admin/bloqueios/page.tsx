import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { BlocksManager, type BlockRow } from "@/components/admin/BlocksManager";

export const dynamic = "force-dynamic";

export default async function BloqueiosPage() {
  let blocks: BlockRow[] = [];
  if (supabaseConfigured()) {
    const supabase = await createSupabaseServer();
    const { data } = await supabase.from("vehicle_blocks").select("*").order("created_at", { ascending: false });
    blocks = (data ?? []) as BlockRow[];
  }

  return (
    <main className="min-h-screen pb-24">
      <header className="border-b border-loog-border/60 bg-loog-bg/70 backdrop-blur">
        <div className="container-loog flex items-center justify-between py-4">
          <Link href="/" className="inline-flex">
            <LoogLogo className="h-8" priority />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/studio" className="text-xs text-loog-muted hover:text-white">studio</Link>
            <LogoutButton className="!py-2 !px-3 !text-xs" />
          </div>
        </div>
      </header>
      <section className="container-loog pt-8">
        <h1 className="font-display text-3xl font-bold">Bloqueios de veículos</h1>
        <p className="mt-1 text-loog-muted">
          Bloqueie marcas ou modelos que a LOOG não aceita cotar. Catálogo FIPE pré-carregado
          — 108 marcas carro, 103 moto, 29 caminhão.
        </p>
        <AdminNav active="bloqueios" />
      </section>
      <section className="container-loog mt-6">
        {!supabaseConfigured() ? (
          <p className="text-loog-muted">Supabase não configurado.</p>
        ) : (
          <BlocksManager initial={blocks} />
        )}
      </section>
    </main>
  );
}
