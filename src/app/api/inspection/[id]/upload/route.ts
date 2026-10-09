import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import type { CaptureKind } from "@/lib/inspection/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // vídeos podem ser grandes

/**
 * POST /api/inspection/[id]/upload
 * FormData: { kind: CaptureKind, file: Blob, metadata?: JSON string }
 * Faz upload no bucket inspection-media e cria registro em inspection_captures.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "supabase admin indisponível" }, { status: 500 });

  const { id } = await ctx.params;

  // Confirma que a vistoria é do consultor
  const { data: insp, error: inspErr } = await admin
    .from("inspections")
    .select("id, owner_id, status")
    .eq("id", id)
    .single();
  if (inspErr || !insp) return NextResponse.json({ error: "vistoria não encontrada" }, { status: 404 });
  if (insp.owner_id !== auth.auth.userId && auth.auth.role !== "admin") {
    return NextResponse.json({ error: "não autorizado" }, { status: 403 });
  }

  const form = await req.formData();
  const kind = (form.get("kind") as string) as CaptureKind;
  const file = form.get("file") as File | null;
  const metadataRaw = form.get("metadata") as string | null;

  if (!file) return NextResponse.json({ error: "file ausente" }, { status: 400 });
  if (!["OPERATOR_SELFIE", "VIDEO", "FRAME", "ODOMETER_PHOTO", "CHASSIS_PHOTO", "DAMAGE_PHOTO"].includes(kind)) {
    return NextResponse.json({ error: "kind inválido" }, { status: 400 });
  }

  const ext = (file.type.split("/")[1] || "bin").split(";")[0];
  const timestamp = Date.now();
  const storagePath = `${insp.owner_id}/${id}/${kind.toLowerCase()}-${timestamp}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage.from("inspection-media").upload(storagePath, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) return NextResponse.json({ error: `upload falhou: ${upErr.message}` }, { status: 500 });

  const metadata = metadataRaw ? safeJson(metadataRaw) : null;

  const { data: cap, error: capErr } = await admin
    .from("inspection_captures")
    .insert({
      inspection_id: id,
      kind,
      storage_path: storagePath,
      mime_type: file.type,
      size_bytes: file.size,
      metadata,
    })
    .select("id")
    .single();
  if (capErr) return NextResponse.json({ error: capErr.message }, { status: 500 });

  // Atualiza status pra RECORDING/UPLOADING na primeira captura
  if (insp.status === "DRAFT") {
    await admin.from("inspections").update({ status: "UPLOADING" }).eq("id", id);
  }

  return NextResponse.json({ captureId: cap.id, storagePath });
}

function safeJson(s: string): Record<string, unknown> | null {
  try { return JSON.parse(s); } catch { return null; }
}
