import { NextRequest, NextResponse } from "next/server";
import { getTemplate } from "@/lib/templates";
import { ConsultantSchema } from "@/lib/types";
import { generateArt } from "@/lib/image/generate";
import { slugify, timestamp } from "@/lib/utils";
import { requireApproved } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// rate limit em memória: 20 gerações / 60s por IP
const HITS = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 20;
const WINDOW_MS = 60_000;
function rateLimited(ip: string) {
  const now = Date.now();
  const rec = HITS.get(ip);
  if (!rec || rec.resetAt < now) {
    HITS.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  rec.count += 1;
  return rec.count > LIMIT;
}

const BodySchema = z.object({
  templateSlug: z.string().min(1),
  consultant: ConsultantSchema,
  format: z.enum(["png", "jpeg"]).default("png"),
});

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Se Supabase configurado, exige consultor aprovado.
  // Sem Supabase (modo dev sem auth), permite (compat com fase inicial).
  if (supabaseConfigured()) {
    const auth = await requireApproved();
    if (!auth.ok) return auth.res;
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "requisição inválida", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const template = await getTemplate(parsed.data.templateSlug);
  if (!template) {
    return NextResponse.json({ error: "template não encontrado" }, { status: 404 });
  }

  try {
    const buffer = await generateArt(template, parsed.data.consultant);
    const filename = `LOOG-${slugify(parsed.data.consultant.name)}-${slugify(template.slug)}-${timestamp()}.png`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(buffer.byteLength),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[generate] erro:", err);
    return NextResponse.json({ error: "falha na geração" }, { status: 500 });
  }
}
