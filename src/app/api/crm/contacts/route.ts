import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { ContactCreateSchema, Temperatura, StatusCiclo, normTelefone } from "@/lib/crm/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HITS = new Map<string, { count: number; resetAt: number }>();
function rateLimited(ip: string, limit = 60, windowMs = 60_000) {
  const now = Date.now();
  const rec = HITS.get(ip);
  if (!rec || rec.resetAt < now) { HITS.set(ip, { count: 1, resetAt: now + windowMs }); return false; }
  rec.count += 1;
  return rec.count > limit;
}

export async function GET(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const sp = req.nextUrl.searchParams;
  const temperatura = sp.get("temperatura");
  const status = sp.get("status");
  const search = (sp.get("search") || "").trim();
  const limit = Math.min(Number(sp.get("limit") || "50"), 200);
  const offset = Math.max(Number(sp.get("offset") || "0"), 0);

  const supabase = await createSupabaseServer();
  let q = supabase
    .from("crm_contacts")
    .select("id, nome, telefone, email, cidade, origem, temperatura, status_ciclo, last_touch_at, created_at", { count: "exact" })
    .order("last_touch_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const t = Temperatura.safeParse(temperatura);
  if (t.success) q = q.eq("temperatura", t.data);
  const s = StatusCiclo.safeParse(status);
  if (s.success) q = q.eq("status_ciclo", s.data);
  if (search) {
    const telNorm = normTelefone(search);
    if (telNorm) {
      q = q.or(`nome.ilike.%${search}%,telefone_norm.ilike.%${telNorm}%`);
    } else {
      q = q.ilike("nome", `%${search}%`);
    }
  }

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data, total: count ?? 0, limit, offset });
}

export async function POST(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ error: "supabase_disabled" }, { status: 503 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const body = await req.json().catch(() => null);
  const parsed = ContactCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });

  const supabase = await createSupabaseServer();

  // dedup por telefone_norm
  const telNorm = normTelefone(parsed.data.telefone);
  if (telNorm) {
    const { data: existing } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("owner_id", auth.auth.userId)
      .eq("telefone_norm", telNorm)
      .maybeSingle();
    if (existing?.id) {
      return NextResponse.json({ ok: true, deduped: true, id: existing.id }, { status: 200 });
    }
  }

  const { data, error } = await supabase
    .from("crm_contacts")
    .insert({
      owner_id: auth.auth.userId,
      group_id: auth.auth.groupId ?? null,
      nome: parsed.data.nome,
      telefone: parsed.data.telefone ?? null,
      email: parsed.data.email || null,
      cidade: parsed.data.cidade ?? null,
      origem: parsed.data.origem ?? "manual",
      temperatura: parsed.data.temperatura,
      status_ciclo: parsed.data.status_ciclo,
      metadata: parsed.data.metadata,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "db", message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data }, { status: 201 });
}
