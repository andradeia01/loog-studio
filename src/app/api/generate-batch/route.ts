import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { getTemplate } from "@/lib/templates";
import { ConsultantSchema } from "@/lib/types";
import { generateArt } from "@/lib/image/generate";
import { slugify, timestamp } from "@/lib/utils";
import { requireApproved } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // netlify functions timeout

const BodySchema = z.object({
  templateSlugs: z.array(z.string().min(1)).min(1).max(30),
  consultant: ConsultantSchema,
});

/**
 * POST /api/generate-batch
 * Gera N artes personalizadas em paralelo (limite 30) e retorna um ZIP.
 * Cada arte usa o mesmo `consultant`. Erros individuais não abortam o lote.
 */
export async function POST(req: NextRequest) {
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

  const zip = new JSZip();
  const errors: { slug: string; reason: string }[] = [];
  const CONCURRENCY = 3;

  const slugs = parsed.data.templateSlugs;
  for (let i = 0; i < slugs.length; i += CONCURRENCY) {
    const chunk = slugs.slice(i, i + CONCURRENCY);
    await Promise.all(
      chunk.map(async (slug) => {
        try {
          const template = await getTemplate(slug);
          if (!template) {
            errors.push({ slug, reason: "template não encontrado" });
            return;
          }
          const buffer = await generateArt(template, parsed.data.consultant);
          const filename = `LOOG-${slugify(parsed.data.consultant.name)}-${slugify(template.slug)}.png`;
          zip.file(filename, buffer);
        } catch (err) {
          errors.push({ slug, reason: err instanceof Error ? err.message : "erro desconhecido" });
        }
      }),
    );
  }

  const generated = Object.keys(zip.files).length;
  if (generated === 0) {
    return NextResponse.json(
      { error: "nenhuma arte gerada", errors },
      { status: 500 },
    );
  }

  // metadata no zip
  zip.file(
    "info.txt",
    `LOOG Studio — Pacote de artes\nConsultor: ${parsed.data.consultant.name}\nData: ${new Date().toLocaleString("pt-BR")}\nGerado: ${generated}/${slugs.length}\n${
      errors.length > 0 ? `\nFalhas:\n${errors.map((e) => `- ${e.slug}: ${e.reason}`).join("\n")}` : ""
    }`,
  );

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const zipName = `LOOG-${slugify(parsed.data.consultant.name)}-${generated}artes-${timestamp()}.zip`;

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zipBuffer.byteLength),
      "Content-Disposition": `attachment; filename="${zipName}"`,
      "Cache-Control": "no-store",
      "X-Generated-Count": String(generated),
      "X-Failed-Count": String(errors.length),
    },
  });
}
