/**
 * API /api/leads — CRUD do pipeline de leads do LOOG Studio.
 *
 * GET  → lista leads do consultor logado (gestor ve do group, admin ve tudo).
 * POST → cria lead novo + enfileira sync pro SIVIS.
 *
 * Padrao de resposta: { ok: true, lead, leads, total }
 * Erros: { error, message }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitKey } from "@/lib/errors/rate-limit";
import { LeadCreateSchema, LeadStatus, onlyDigits } from "@/lib/leads/schemas";
import { registrarEvento } from "@/lib/leads/timeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST_LIMIT = 50;
const LIST_MAX = 200;
const RATE_LIMIT_POST = 30; // 30 leads/min por consultor

export async function GET(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const search = (sp.get("search") || "").trim();
  const limit = Math.min(Number(sp.get("limit") || String(LIST_LIMIT)), LIST_MAX);
  const offset = Math.max(Number(sp.get("offset") || "0"), 0);

  const supabase = await createSupabaseServer();
  let q = supabase
    .from("leads")
    .select(
      "id, consultor_id, group_id, status, contratante_nome, contratante_email, contratante_cpf, " +
        "contratante_telefone, contratante_cidade, contratante_uf, procedencia, " +
        "sivis_id, sivis_sync_status, sivis_last_sync_at, created_at, updated_at",
      { count: "exact" }
    )
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const parsedStatus = LeadStatus.safeParse(status);
  if (parsedStatus.success) q = q.eq("status", parsedStatus.data);

  if (search) {
    const cpfDigits = onlyDigits(search);
    if (cpfDigits.length >= 3) {
      q = q.or(`contratante_nome.ilike.%${search}%,contratante_cpf.ilike.%${cpfDigits}%`);
    } else {
      q = q.ilike("contratante_nome", `%${search}%`);
    }
  }

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, leads: data ?? [], total: count ?? 0, limit, offset });
}

export async function POST(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = checkRateLimit(rateLimitKey(auth.auth.userId, ip, "lead_create"), RATE_LIMIT_POST);
  if (rl.limited) {
    return NextResponse.json(
      { error: "rate_limited", message: `Aguarda ${rl.retryAfterSecs}s pra criar outro lead.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = LeadCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: "Dados invalidos", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Normalizar antes de gravar
  const data = parsed.data;
  const insertRow = {
    consultor_id: auth.auth.userId,
    group_id: auth.auth.groupId ?? null,
    status: data.status ?? "lead",
    contratante_nome: data.contratante_nome,
    contratante_email: data.contratante_email || null,
    contratante_cpf: data.contratante_cpf ? onlyDigits(data.contratante_cpf) : null,
    contratante_telefone: data.contratante_telefone ? onlyDigits(data.contratante_telefone) : null,
    contratante_data_nasc: data.contratante_data_nasc || null,
    contratante_cep: data.contratante_cep ? onlyDigits(data.contratante_cep) : null,
    contratante_endereco: data.contratante_endereco || null,
    contratante_numero: data.contratante_numero || null,
    contratante_bairro: data.contratante_bairro || null,
    contratante_cidade: data.contratante_cidade || null,
    contratante_uf: data.contratante_uf || null,
    contratante_complemento: data.contratante_complemento || null,
    procedencia: data.procedencia || null,
    observacao: data.observacao || null,
    sivis_sync_status: "pending" as const,
  };

  const supabase = await createSupabaseServer();
  const { data: lead, error } = await supabase.from("leads").insert(insertRow).select().single();
  if (error) {
    return NextResponse.json({ error: "insert_failed", message: error.message }, { status: 500 });
  }

  // Enfileira sync pro SIVIS (nao bloqueia resposta)
  const { error: queueErr } = await supabase.from("sivis_sync_queue").insert({
    lead_id: lead.id,
    consultor_id: auth.auth.userId,
    action: "create_lead",
    payload: { lead_id: lead.id },
    status: "pending",
    next_attempt_at: new Date().toISOString(),
  });
  if (queueErr) console.warn("[leads POST] falha ao enfileirar sync:", queueErr.message);

  // Timeline (nao bloqueia tambem)
  await registrarEvento(supabase, {
    leadId: lead.id,
    actorId: auth.auth.userId,
    evento: "lead_criado",
    detalhes: { nome: lead.contratante_nome, cpf: lead.contratante_cpf ? "***" + String(lead.contratante_cpf).slice(-3) : null },
  });

  return NextResponse.json({ ok: true, lead }, { status: 201 });
}
