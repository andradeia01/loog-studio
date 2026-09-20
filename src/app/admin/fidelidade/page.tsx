import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { FidelityAdmin } from "@/components/admin/FidelityAdmin";

export const dynamic = "force-dynamic";

export default async function FidelityAdminPage() {
  if (!supabaseConfigured()) {
    return (
      <main className="min-h-screen p-8 text-center text-loog-muted">
        Fidelidade requer Supabase configurado.
      </main>
    );
  }

  const supabase = await createSupabaseServer();
  const [{ data: ranking }, { data: recent }, { count: pendingCount }] = await Promise.all([
    supabase
      .from("consultant_ranking")
      .select("*")
      .order("total_points", { ascending: false }),
    supabase
      .from("checkins")
      .select("id, consultant_id, post_url, post_type, posted_at, points_awarded, streak_at_time, approved, invalidated_at, invalidated_reason, created_at, profiles:consultant_id(full_name, email, photo_url)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

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
        <h1 className="font-display text-3xl font-bold">Fidelidade 🔥</h1>
        <p className="mt-1 text-loog-muted">
          Acompanhe pontos, streaks e engajamento dos consultores. Invalide check-ins suspeitos ou ajuste pontos manualmente.
        </p>
        <AdminNav pendingCount={pendingCount ?? 0} active="fidelidade" />
      </section>
      <section className="container-loog mt-6">
        <FidelityAdmin
          initialRanking={ranking ?? []}
          initialRecent={(recent ?? []) as never[]}
        />
      </section>
    </main>
  );
}
