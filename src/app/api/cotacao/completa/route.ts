import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { quoteFromPlate, HubError } from "@/lib/loog-hub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  placa: z.string().min(7).max(10),
  cliente: z.object({
    nome: z.string().min(2).max(120),
    telefone: z.string().min(8).max(20),
    cpf: z.string().optional(),
    data_nascimento: z.string().optional(),
    cep: z.string().optional(),
    endereco: z.string().optional(),
    cidade: z.string().optional(),
    uf: z.string().optional(),
  }),
  leadId: z.string().optional(),
});

/**
 * Cotação COMPLETA — já com todos os dados do cliente (CPF, endereço, etc)
 * extraídos via OCR dos documentos. Dispara mesmo endpoint do Hub (from-plate)
 * mas enriquecendo o customer com os campos extras.
 */
export async function POST(req: NextRequest) {
  let consultorId: string | undefined;
  if (supabaseConfigured()) {
    const auth = await requireApproved();
    if (!auth.ok) return auth.res;
    consultorId = auth.auth.userId;
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });
  }

  const telDigits = parsed.data.cliente.telefone.replace(/[^0-9]/g, "");
  if (telDigits.length < 10) {
    return NextResponse.json({ error: "telefone_invalido", message: "Telefone precisa ter DDD + número." }, { status: 400 });
  }
  const customerPhone = telDigits.startsWith("55") ? telDigits : `55${telDigits}`;

  try {
    const result = await quoteFromPlate({
      plate: parsed.data.placa,
      customerName: parsed.data.cliente.nome,
      customerPhone,
      customerCpf: parsed.data.cliente.cpf?.replace(/[^0-9]/g, ""),
      customerBirthDate: parsed.data.cliente.data_nascimento,
      customerCep: parsed.data.cliente.cep?.replace(/[^0-9]/g, ""),
      customerAddress: parsed.data.cliente.endereco,
      customerCity: parsed.data.cliente.cidade,
      customerState: parsed.data.cliente.uf,
      leadId: parsed.data.leadId ?? (consultorId ? `loogstudio:${consultorId}` : undefined),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof HubError) {
      const user = err.status === 404
        ? "Placa não encontrada no sistema oficial — verifique CRLV."
        : err.status === 502 || err.status === 503
          ? "Sistema interno LOOG indisponível no momento."
          : err.message;
      return NextResponse.json({ error: err.code ?? "hub_error", message: user, status: err.status }, { status: err.status >= 400 && err.status < 500 ? err.status : 502 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cotacao/completa] erro:", msg);
    return NextResponse.json({ error: "falha", message: msg }, { status: 500 });
  }
}
