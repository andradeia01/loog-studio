import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { gerarPdfPremium, PROTECAO_BASE, DIFERENCIAIS_LOOG, protocolo } from "@/lib/pdf/loog-premium";
import { slugify, timestamp } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  cliente: z.object({ nome: z.string().min(1), telefone: z.string().optional() }),
  veiculo: z.object({
    placa: z.string(),
    brand: z.string(),
    model: z.string(),
    modelYear: z.number(),
    color: z.string().nullable().optional(),
    categoria: z.string(),
    fipeFormatted: z.string(),
  }),
  valores: z.object({
    mensalidade: z.number(),
    adesao: z.number(),
    investimentoInicial: z.number(),
    mensalidadeFormatted: z.string(),
    adesaoFormatted: z.string(),
    investimentoInicialFormatted: z.string(),
  }),
  adicionais: z.array(z.string()).default([]),
  validadeDias: z.number().int().positive().default(5),
  consultor: z.object({
    name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    instagram: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
  }).default({}),
  quoteId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  if (supabaseConfigured()) {
    const auth = await requireApproved();
    if (!auth.ok) return auth.res;
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const pdf = await gerarPdfPremium({
      cliente: parsed.data.cliente,
      veiculo: parsed.data.veiculo,
      valores: parsed.data.valores,
      protecaoBase: PROTECAO_BASE,
      adicionais: parsed.data.adicionais,
      diferenciais: DIFERENCIAIS_LOOG,
      validadeDias: parsed.data.validadeDias,
      consultor: parsed.data.consultor,
      protocolo: parsed.data.quoteId ? `LG-${parsed.data.quoteId}` : protocolo(),
    });

    const filename = `LOOG-cotacao-${slugify(parsed.data.veiculo.placa)}-${timestamp()}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.byteLength),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cotacao/pdf] erro:", msg);
    return NextResponse.json({ error: "pdf_falhou", message: msg }, { status: 500 });
  }
}
