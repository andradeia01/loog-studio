import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Busca unificada "Tríplice": procura por CPF/CNPJ ou nome em todas as fontes
 * locais (STUDIO) e devolve dados pro admin comparar com PlusAssist (coluna B,
 * aberta manualmente) e SIVIS/Hub (coluna C, futura).
 *
 * Hoje consulta: members + vehicles + plans + crm_contacts.
 */
const Query = z.object({
  cpf: z.string().trim().optional(),
  nome: z.string().trim().optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_off" }, { status: 503 });

  const url = new URL(req.url);
  const parsed = Query.safeParse({
    cpf: url.searchParams.get("cpf") ?? undefined,
    nome: url.searchParams.get("nome") ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid_query" }, { status: 400 });

  const { cpf, nome } = parsed.data;
  if (!cpf && !nome) return NextResponse.json({ error: "cpf_ou_nome_obrigatorio" }, { status: 400 });

  const supabase = await createSupabaseServer();
  const cpfLimpo = cpf ? cpf.replace(/\D/g, "") : null;

  // ─── 1. Members (associados LOOG) ────────────────────────────────────────
  let memberQuery = supabase
    .from("members")
    .select("id, matricula, nome, cpf_cnpj, email, telefone, cidade, uf, status, created_at, group_id, owner_consultant_id")
    .limit(10);
  if (cpfLimpo) memberQuery = memberQuery.ilike("cpf_cnpj", `%${cpfLimpo}%`);
  else if (nome) memberQuery = memberQuery.ilike("nome", `%${nome}%`);
  const { data: members, error: mErr } = await memberQuery;
  if (mErr) console.warn("[triplice] members query error:", mErr);

  // ─── 2. Vehicles do primeiro member encontrado ──────────────────────────
  const firstMemberId = members?.[0]?.id;
  let vehicles: Array<Record<string, unknown>> = [];
  if (firstMemberId) {
    const { data: v } = await supabase
      .from("vehicles")
      .select("id, placa, tipo, marca, modelo, ano_modelo, fipe_code, fipe_value_cents, active, created_at")
      .eq("member_id", firstMemberId)
      .limit(10);
    vehicles = v ?? [];
  }

  // ─── 3. CRM contact (se tiver tido contato comercial) ──────────────────
  let crmQuery = supabase
    .from("crm_contacts")
    .select("id, nome, telefone, email, temperatura, status_ciclo, pipeline_stage, last_touch_at")
    .limit(5);
  if (cpfLimpo) crmQuery = crmQuery.or(`telefone.ilike.%${cpfLimpo}%,email.ilike.%${cpfLimpo}%`);
  else if (nome) crmQuery = crmQuery.ilike("nome", `%${nome}%`);
  const { data: crm } = await crmQuery;

  return NextResponse.json({
    query: { cpf, nome },
    studio: {
      members: members ?? [],
      vehicles,
      crm_contacts: crm ?? [],
      counts: {
        members: members?.length ?? 0,
        vehicles: vehicles.length,
        crm: crm?.length ?? 0,
      },
    },
    plusassist: {
      status: "manual",
      url: "https://sistemas.infornet.com.br/webassist/plusassist/cliente/consultabeneficiario.php",
      instruction: "Abre em nova aba e busca pelo mesmo CPF/nome. Integração automática pendente (reCAPTCHA v3 bloqueia scraping sem API oficial da Infornet).",
    },
    hub_sivis: {
      status: "pending_integration",
      note: "Visão SIVIS via Hub Fastify será adicionada quando o Hub expor endpoint de busca por associado.",
    },
  });
}
