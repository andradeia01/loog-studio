import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sdr/studio-metrics
 * Agrega as cotações manuais feitas por consultores humanos
 * (via PlacaStudio / CotacaoCompleta → gravadas em crm_interactions).
 * Visão "geral" tipo gestor: só admin + consultant_sdr enxergam.
 */
export async function GET() {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  if (auth.auth.role !== "admin" && auth.auth.role !== "consultant_sdr") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "no supabase admin" }, { status: 500 });

  // Puxa cotações manuais desde 2026-10-01 (início do rankingperíodo que o gestor acompanha)
  const since = "2026-10-01T00:00:00.000Z";
  const { data: rows, error } = await admin
    .from("crm_interactions")
    .select("tipo, owner_id, metadata, created_at")
    .in("tipo", ["cotacao_rapida", "cotacao_completa"])
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Nome dos owners pra ranking
  const ownerIds = Array.from(new Set((rows ?? []).map((r) => r.owner_id).filter(Boolean)));
  let ownersMap = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: owners } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ownerIds);
    ownersMap = new Map((owners ?? []).map((o) => [o.id as string, (o.full_name as string) || (o.email as string) || "sem nome"]));
  }

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const ontem = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const semanaIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const mesIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  interface Bucket { cotacoes: number; oportunidade: number; }
  const mk = (): Bucket => ({ cotacoes: 0, oportunidade: 0 });
  const hoje = mk(), on = mk(), sem = mk(), mes = mk(), total = mk();
  type OwnerAgg = { nome: string; cotacoes: number; oportunidade: number };
  const mkOwnerMap = () => new Map<string, OwnerAgg>();
  const ownersPorPeriodo = {
    hoje: mkOwnerMap(),
    ontem: mkOwnerMap(),
    semana: mkOwnerMap(),
    mes: mkOwnerMap(),
    total: mkOwnerMap(),
  };

  const addOwner = (map: Map<string, OwnerAgg>, ownerId: string, cents: number) => {
    if (!ownerId) return;
    const existing = map.get(ownerId) ?? { nome: ownersMap.get(ownerId) ?? "sem nome", cotacoes: 0, oportunidade: 0 };
    existing.cotacoes++;
    existing.oportunidade += cents;
    map.set(ownerId, existing);
  };

  for (const r of rows ?? []) {
    const metadata = (r.metadata ?? {}) as Record<string, unknown>;
    const fipeRaw = (metadata.valorFipe ?? metadata.fipeValor ?? "0") as string;
    // "R$ 114.093,00" -> 11409300 cents
    const cents = (() => {
      if (typeof fipeRaw !== "string") return 0;
      const n = fipeRaw.replace(/[^\d,]/g, "").replace(",", ".");
      const v = parseFloat(n);
      return Number.isFinite(v) ? Math.round(v * 100) : 0;
    })();
    const createdAt = r.created_at as string;
    const createdDay = createdAt.slice(0, 10);
    const ownerId = r.owner_id as string;
    total.cotacoes++; total.oportunidade += cents;
    addOwner(ownersPorPeriodo.total, ownerId, cents);
    if (createdDay === todayIso) { hoje.cotacoes++; hoje.oportunidade += cents; addOwner(ownersPorPeriodo.hoje, ownerId, cents); }
    if (createdDay === ontem) { on.cotacoes++; on.oportunidade += cents; addOwner(ownersPorPeriodo.ontem, ownerId, cents); }
    if (createdAt >= semanaIso) { sem.cotacoes++; sem.oportunidade += cents; addOwner(ownersPorPeriodo.semana, ownerId, cents); }
    if (createdAt >= mesIso) { mes.cotacoes++; mes.oportunidade += cents; addOwner(ownersPorPeriodo.mes, ownerId, cents); }
  }

  const fmt = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const withFmt = (b: Bucket) => ({ ...b, oportunidadeFormatada: fmt(b.oportunidade) });

  const top5 = (map: Map<string, OwnerAgg>) =>
    Array.from(map.entries())
      .map(([id, v]) => ({ id, nome: v.nome, cotacoes: v.cotacoes, oportunidade: v.oportunidade, oportunidadeFormatada: fmt(v.oportunidade) }))
      .sort((a, b) => b.oportunidade - a.oportunidade)
      .slice(0, 5);

  return NextResponse.json({
    hoje: withFmt(hoje),
    ontem: withFmt(on),
    semana: withFmt(sem),
    mes: withFmt(mes),
    total: withFmt(total),
    rankings: {
      hoje: top5(ownersPorPeriodo.hoje),
      ontem: top5(ownersPorPeriodo.ontem),
      semana: top5(ownersPorPeriodo.semana),
      mes: top5(ownersPorPeriodo.mes),
      total: top5(ownersPorPeriodo.total),
    },
    // mantém backward-compat
    topConsultores: top5(ownersPorPeriodo.total),
  });
}
