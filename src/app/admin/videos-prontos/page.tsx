import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { ReadyVideosManager, type ReadyVideoRow } from "@/components/admin/ReadyVideosManager";

export const dynamic = "force-dynamic";

export default async function ReadyVideosPage() {
  let rows: ReadyVideoRow[] = [];
  let pendingCount = 0;

  if (supabaseConfigured()) {
    const supabase = await createSupabaseServer();
    const [{ data: videos }, { count }] = await Promise.all([
      supabase
        .from("ready_videos")
        .select("id, title, category, format, video_url, thumbnail_url, folder_id, duration_sec, size_bytes, active, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    rows = (videos ?? []) as ReadyVideoRow[];
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
        <h1 className="font-display text-3xl font-bold">Vídeos prontos</h1>
        <p className="mt-1 text-loog-muted">
          Publique Reels e vídeos finalizados. Consultores baixam direto pra postar.
        </p>
        <AdminNav pendingCount={pendingCount} active="videos-prontos" />
      </section>
      <section className="container-loog mt-6">
        {!supabaseConfigured() ? (
          <div className="rounded-xl border border-dashed border-loog-border p-10 text-center text-loog-muted">
            Publicar vídeos requer Supabase configurado.
          </div>
        ) : (
          <ReadyVideosManager initial={rows} />
        )}
      </section>
    </main>
  );
}
