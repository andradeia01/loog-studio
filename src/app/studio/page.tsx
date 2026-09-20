import { listTemplates } from "@/lib/templates";
import { StudioApp } from "@/components/studio/StudioApp";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import type { ReadyFolder } from "@/components/studio/ReadyArtsGallery";

export const dynamic = "force-dynamic";

interface ReadyArt {
  id: string;
  title: string;
  category: string;
  format: string;
  image_url: string;
  thumbnail_url: string | null;
  folder_id: string | null;
}

export default async function StudioPage() {
  const templates = (await listTemplates()).filter((t) => t.active !== false);

  let readyArts: ReadyArt[] = [];
  let folders: ReadyFolder[] = [];
  let consultantSeed: { fullName?: string; phone?: string; instagram?: string; city?: string } | null = null;

  if (supabaseConfigured()) {
    const supabase = await createSupabaseServer();

    const [{ data: arts }, { data: folderRows }] = await Promise.all([
      supabase
        .from("ready_arts")
        .select("id, title, category, format, image_url, thumbnail_url, folder_id")
        .eq("active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("art_folders")
        .select("id, name, description, cover_url, position")
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    readyArts = arts ?? [];

    // count por pasta
    const counts: Record<string, number> = {};
    for (const a of readyArts) {
      if (a.folder_id) counts[a.folder_id] = (counts[a.folder_id] ?? 0) + 1;
    }
    folders = (folderRows ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      cover_url: f.cover_url,
      count: counts[f.id] ?? 0,
    }));

    const auth = await currentUser();
    if (auth) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, phone, instagram, city")
        .eq("id", auth.userId)
        .maybeSingle();
      if (profile) {
        consultantSeed = {
          fullName: profile.full_name ?? undefined,
          phone: profile.phone ?? undefined,
          instagram: profile.instagram ?? undefined,
          city: profile.city ?? undefined,
        };
      }
    }
  }

  const userAuth = supabaseConfigured() ? await currentUser() : null;

  return (
    <StudioApp
      initialTemplates={templates}
      readyArts={readyArts}
      readyFolders={folders}
      consultantSeed={consultantSeed}
      authEnabled={supabaseConfigured()}
      userId={userAuth?.userId ?? null}
    />
  );
}
