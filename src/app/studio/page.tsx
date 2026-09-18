import { listTemplates } from "@/lib/templates";
import { StudioApp } from "@/components/studio/StudioApp";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface ReadyArt {
  id: string;
  title: string;
  category: string;
  format: string;
  image_url: string;
  thumbnail_url: string | null;
}

export default async function StudioPage() {
  const templates = (await listTemplates()).filter((t) => t.active !== false);

  let readyArts: ReadyArt[] = [];
  let consultantSeed: { fullName?: string; phone?: string; instagram?: string; city?: string } | null = null;

  if (supabaseConfigured()) {
    const supabase = await createSupabaseServer();
    const { data } = await supabase
      .from("ready_arts")
      .select("id, title, category, format, image_url, thumbnail_url")
      .eq("active", true)
      .order("created_at", { ascending: false });
    readyArts = data ?? [];

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

  return (
    <StudioApp
      initialTemplates={templates}
      readyArts={readyArts}
      consultantSeed={consultantSeed}
      authEnabled={supabaseConfigured()}
    />
  );
}
