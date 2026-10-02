import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { consultarPlaca } from "@/lib/placafipe";
import { calcularCotacao } from "@/lib/cotacao";
import { gerarPdfCotacao } from "@/lib/pdf/cotacao-pdf";
import { slugify, timestamp } from "@/lib/utils";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  placa: z.string().min(7).max(10),
  consultant: z.object({
    name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    instagram: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
  }).default({}),
  format: z.enum(["pdf", "json"]).default("pdf"),
});

export async function POST(req: NextRequest) {
  if (supabaseConfigured()) {
    const auth = await requireApproved();
    if (!auth.ok) return auth.res;
  }

  const body = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });
  }

  const result = await consultarPlaca(parsed.data.placa);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, message: result.message }, { status: result.status });
  }

  const cotacao = calcularCotacao(result.veiculo, result.fipe_recomendado);

  if (parsed.data.format === "json") {
    return NextResponse.json({ ok: true, veiculo: result.veiculo, fipe: result.fipe_recomendado, cotacao });
  }

  try {
    const pdfBytes = await gerarPdfCotacao({
      veiculo: result.veiculo,
      cotacao,
      consultant: parsed.data.consultant,
    });
    const filename = `LOOG-cotacao-${slugify(result.veiculo.placa)}-${timestamp()}.pdf`;
    return new NextResponse(new Uint8Array(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdfBytes.byteLength),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Mensalidade-Essencial": String(cotacao.planos[0]?.mensalidade ?? 0),
        "X-Mensalidade-Completo": String(cotacao.planos[1]?.mensalidade ?? 0),
        "X-Mensalidade-Premium": String(cotacao.planos[2]?.mensalidade ?? 0),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cotacao] erro pdf:", msg);
    return NextResponse.json({ error: "pdf_falhou", message: msg }, { status: 500 });
  }
}
