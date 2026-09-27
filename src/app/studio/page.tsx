import { listTemplates } from "@/lib/templates";
import { StudioApp } from "@/components/studio/StudioApp";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import type { ReadyFolder } from "@/components/studio/ReadyArtsGallery";
import type { ReadyVideo, VideoFolder } from "@/components/studio/ReadyVideosGallery";

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
  let readyVideos: ReadyVideo[] = [];
  let videoFolders: VideoFolder[] = [];
  let consultantSeed: { fullName?: string; phone?: string; instagram?: string; city?: string } | null = null;

  if (supabaseConfigured()) {
    const supabase = await createSupabaseServer();

    const [
      { data: arts },
      { data: folderRows },
      { data: videos },
      { data: vFolderRows },
    ] = await Promise.all([
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
      supabase
        .from("ready_videos")
        .select("id, title, category, format, video_url, thumbnail_url, folder_id, duration_sec")
        .eq("active", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("ready_video_folders")
        .select("id, name, description, cover_url, position")
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    readyArts = arts ?? [];
    readyVideos = (videos ?? []) as ReadyVideo[];

    // count por pasta (artes)
    const artCounts: Record<string, number> = {};
    for (const a of readyArts) if (a.folder_id) artCounts[a.folder_id] = (artCounts[a.folder_id] ?? 0) + 1;
    folders = (folderRows ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      cover_url: f.cover_url,
      count: artCounts[f.id] ?? 0,
    }));

    // count por pasta (vídeos)
    const vidCounts: Record<string, number> = {};
    for (const v of readyVideos) if (v.folder_id) vidCounts[v.folder_id] = (vidCounts[v.folder_id] ?? 0) + 1;
    videoFolders = (vFolderRows ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      cover_url: f.cover_url,
      count: vidCounts[f.id] ?? 0,
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
      readyVideos={readyVideos}
      readyVideoFolders={videoFolders}
      consultantSeed={consultantSeed}
      authEnabled={supabaseConfigured()}
      userId={userAuth?.userId ?? null}
    />
  );
}
