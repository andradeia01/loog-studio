import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { ConfigApp } from "@/components/admin/ConfigApp";

export const dynamic = "force-dynamic";

export default async function ConfigPage() {
  if (!supabaseConfigured()) {
    return (
      <main className="min-h-screen p-8 text-center text-loog-muted">
        Configurações exigem Supabase.
      </main>
    );
  }

  const supabase = await createSupabaseServer();
  const { count: pendingCount } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

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
        <h1 className="font-display text-3xl font-bold">Configurações</h1>
        <p className="mt-1 text-loog-muted">
          API keys de providers, grupos regionais, gestores/consultores e quotas do sistema.
        </p>
        <AdminNav pendingCount={pendingCount ?? 0} active="config" />
      </section>
      <section className="container-loog mt-6">
        <ConfigApp />
      </section>
    </main>
  );
}
