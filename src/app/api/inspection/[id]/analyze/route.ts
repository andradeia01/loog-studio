import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { analyzeInspection } from "@/lib/inspection/analyze";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/inspection/[id]/analyze
 * Body: { transcript?: string, gps?: {lat, lng, accuracy} }
 * Pega os captures (frames + odômetro + chassi), extrai bytes, chama Claude Sonnet 4.5,
 * grava ai_result na vistoria e marca APPROVED/REJECTED/NEEDS_REVIEW.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "supabase admin indisponível" }, { status: 500 });

  const { id } = await ctx.params;

  const { data: insp, error: inspErr } = await admin
    .from("inspections")
    .select("id, owner_id, placa, marca, modelo")
    .eq("id", id)
    .single();
  if (inspErr || !insp) return NextResponse.json({ error: "vistoria não encontrada" }, { status: 404 });
  if (insp.owner_id !== auth.auth.userId && auth.auth.role !== "admin") {
    return NextResponse.json({ error: "não autorizado" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { transcript?: string; gps?: { lat: number; lng: number; accuracy?: number } };

  // Marca PROCESSING
  await admin.from("inspections").update({
    status: "PROCESSING",
    audio_transcript: body.transcript ?? null,
    gps_lat: body.gps?.lat ?? null,
    gps_lng: body.gps?.lng ?? null,
    gps_accuracy_m: body.gps?.accuracy ?? null,
    gps_timestamp: body.gps ? new Date().toISOString() : null,
  }).eq("id", id);

  // Puxa captures: FRAMES + ODOMETER + CHASSIS + ENGINE
  const { data: caps, error: capsErr } = await admin
    .from("inspection_captures")
    .select("kind, storage_path, metadata")
    .eq("inspection_id", id)
    .in("kind", ["FRAME", "ODOMETER_PHOTO", "CHASSIS_PHOTO", "ENGINE_PHOTO"]);
  if (capsErr) return NextResponse.json({ error: capsErr.message }, { status: 500 });

  const frames = (caps ?? []).filter((c) => c.kind === "FRAME");
  const odometer = (caps ?? []).find((c) => c.kind === "ODOMETER_PHOTO");
  const chassis = (caps ?? []).find((c) => c.kind === "CHASSIS_PHOTO");
  const engine = (caps ?? []).find((c) => c.kind === "ENGINE_PHOTO");

  if (frames.length === 0) {
    await admin.from("inspections").update({
      status: "REJECTED",
      ai_approved: false,
      ai_reason: "nenhum frame enviado",
      ai_processed_at: new Date().toISOString(),
    }).eq("id", id);
    return NextResponse.json({ error: "sem frames pra analisar" }, { status: 400 });
  }

  // Download dos bytes do Supabase Storage
  const framesBase64 = await Promise.all(
    frames.map((c) => downloadAsBase64(admin, c.storage_path as string)),
  );
  const odometerBase64 = odometer ? await downloadAsBase64(admin, odometer.storage_path as string) : undefined;
  const chassisBase64 = chassis ? await downloadAsBase64(admin, chassis.storage_path as string) : undefined;
  const engineBase64 = engine ? await downloadAsBase64(admin, engine.storage_path as string) : undefined;

  // Chama a IA
  let aiResult;
  try {
    aiResult = await analyzeInspection({
      framesBase64,
      odometerBase64,
      chassisBase64,
      engineBase64,
      placa: insp.placa as string,
      marca: insp.marca as string | null,
      modelo: insp.modelo as string | null,
      audioTranscript: body.transcript ?? null,
    });
  } catch (err) {
    const msg = (err as Error).message;
    await admin.from("inspections").update({
      status: "NEEDS_REVIEW",
      ai_reason: `erro na IA: ${msg.slice(0, 300)}`,
      ai_processed_at: new Date().toISOString(),
    }).eq("id", id);
    return NextResponse.json({ error: `análise falhou: ${msg}` }, { status: 500 });
  }

  // Grava resultado
  const nextStatus = aiResult.recommendation === "approve"
    ? "APPROVED"
    : aiResult.recommendation === "reject"
    ? "REJECTED"
    : "NEEDS_REVIEW";

  await admin.from("inspections").update({
    status: nextStatus,
    ai_result: aiResult,
    ai_approved: aiResult.recommendation === "approve",
    ai_reason: aiResult.rejectionReason ?? (aiResult.reasons[0] ?? null),
    ai_model_used: "claude-sonnet-5-5",
    ai_processed_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  }).eq("id", id);

  return NextResponse.json({ status: nextStatus, ai: aiResult });
}

async function downloadAsBase64(
  admin: ReturnType<typeof createSupabaseAdmin>,
  path: string,
): Promise<string> {
  if (!admin) throw new Error("admin indisponível");
  const { data, error } = await admin.storage.from("inspection-media").download(path);
  if (error || !data) throw new Error(`download falhou: ${error?.message ?? "sem dados"}`);
  const buf = Buffer.from(await data.arrayBuffer());
  return buf.toString("base64");
}
