import Link from "next/link";
import { listTemplates } from "@/lib/templates";
import { CATEGORY_LABEL, FORMAT_LABEL } from "@/lib/types";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const templates = await listTemplates();

  let pendingCount = 0;
  if (supabaseConfigured()) {
    const supabase = await createSupabaseServer();
    const { count } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    pendingCount = count ?? 0;
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
        <h1 className="font-display text-3xl font-bold">Área do gestor</h1>
        <p className="mt-1 text-loog-muted">Aprove consultores, publique artes prontas e edite os templates personalizáveis.</p>
        <AdminNav pendingCount={pendingCount} active="templates" />
      </section>

      <section className="container-loog mt-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Templates personalizáveis</h2>
            <p className="text-xs text-loog-muted/80">Artes com áreas de foto/nome/telefone que o consultor customiza.</p>
          </div>
          <Link href="/admin/new" className="btn-primary !py-2 !text-xs">Novo template</Link>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-loog-border p-10 text-center">
            <p className="text-loog-muted">Nenhum template cadastrado.</p>
            <Link href="/admin/new" className="btn-primary mt-4 inline-flex">Criar primeiro template</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <Link key={t.slug} href={`/admin/${t.slug}`} className="card group overflow-hidden transition hover:border-loog-brand/50">
                <div className="relative aspect-[4/5] w-full bg-black">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.thumbnail} alt={t.name} className="h-full w-full object-cover" />
                  {!t.active && (
                    <span className="absolute left-2 top-2 rounded bg-red-500/80 px-2 py-0.5 text-[10px] font-bold uppercase">inativo</span>
                  )}
                  <span className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur">
                    {FORMAT_LABEL[t.format]}
                  </span>
                </div>
                <div className="p-4">
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="text-xs text-loog-muted">{CATEGORY_LABEL[t.category]}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
