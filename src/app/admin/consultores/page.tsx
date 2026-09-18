import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { ConsultantsManager, type ConsultantRow } from "@/components/admin/ConsultantsManager";

export const dynamic = "force-dynamic";

export default async function ConsultantsPage() {
  if (!supabaseConfigured()) {
    return (
      <ShellFallback>
        <p className="text-loog-muted">
          Aprovação de consultores requer Supabase configurado. Veja <code className="text-white">SUPABASE.md</code>.
        </p>
      </ShellFallback>
    );
  }

  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, instagram, city, photo_url, role, status, created_at, approved_at, rejected_reason")
    .order("created_at", { ascending: false });

  const rows: ConsultantRow[] = (data ?? []) as ConsultantRow[];
  const pendingCount = rows.filter((r) => r.status === "pending").length;

  return (
    <ShellFallback pendingCount={pendingCount}>
      <ConsultantsManager initial={rows} />
    </ShellFallback>
  );
}

function ShellFallback({ children, pendingCount }: { children: React.ReactNode; pendingCount?: number }) {
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
        <h1 className="font-display text-3xl font-bold">Consultores</h1>
        <p className="mt-1 text-loog-muted">Aprove novos cadastros, revogue acessos, promova administradores.</p>
        <AdminNav pendingCount={pendingCount} active="consultores" />
      </section>
      <section className="container-loog mt-6">{children}</section>
    </main>
  );
}
