import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { GestorDashboard } from "@/components/gestor/GestorDashboard";

export const dynamic = "force-dynamic";

export default async function GestorPage() {
  if (!supabaseConfigured()) {
    return <main className="min-h-screen p-8 text-center text-loog-muted">Requer Supabase.</main>;
  }
  const auth = await currentUser();
  if (!auth) return <main className="min-h-screen p-8 text-center text-loog-muted">Não autenticado.</main>;

  const supabase = await createSupabaseServer();
  const [{ data: group }, { data: consultants }, { data: pending }, { data: checkinsRow }] = await Promise.all([
    auth.groupId
      ? supabase.from("groups").select("id, name, region, description").eq("id", auth.groupId).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, city, status, total_points, current_streak, longest_streak, last_checkin_date, photo_url")
      .eq("role", "consultant")
      .eq("group_id", auth.groupId ?? "00000000-0000-0000-0000-000000000000")
      .order("total_points", { ascending: false }),
    supabase
      .from("profiles")
      .select("id, full_name, email, phone, city, created_at")
      .eq("role", "consultant")
      .eq("group_id", auth.groupId ?? "00000000-0000-0000-0000-000000000000")
      .eq("status", "pending"),
    supabase
      .from("checkins")
      .select("id, consultant_id, post_url, post_type, posted_at, points_awarded, approved, invalidated_at, profiles!inner(full_name, group_id)")
      .eq("profiles.group_id", auth.groupId ?? "00000000-0000-0000-0000-000000000000")
      .order("created_at", { ascending: false })
      .limit(30),
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
        <div className="flex items-center gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-loog-brand2">Área do gestor</div>
            <h1 className="font-display text-3xl font-bold">
              {group?.name ?? "Grupo não atribuído"}
            </h1>
            {group?.region && <p className="mt-1 text-loog-muted">{group.region}</p>}
          </div>
        </div>
      </section>
      <section className="container-loog mt-6">
        <GestorDashboard
          hasGroup={!!group}
          consultants={consultants ?? []}
          pending={pending ?? []}
          checkins={(checkinsRow ?? []) as never[]}
        />
      </section>
    </main>
  );
}
