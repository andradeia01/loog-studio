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
 *
 * Query params opcionais:
 * - date=YYYY-MM-DD → inclui o período extra "data específica"
 */
export async function GET(req: Request) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  if (auth.auth.role !== "admin" && auth.auth.role !== "consultant_sdr") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const admin = createSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "no supabase admin" }, { status: 500 });

  const url = new URL(req.url);
  const dataEspecifica = url.searchParams.get("date"); // YYYY-MM-DD ou null

  // Puxa cotações manuais desde 2026-10-01 (início do período que o gestor acompanha)
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
  const hoje = mk(), on = mk(), sem = mk(), mes = mk(), total = mk(), data = mk();
  type OwnerAgg = { nome: string; cotacoes: number; oportunidade: number };
  const mkOwnerMap = () => new Map<string, OwnerAgg>();
  const ownersPorPeriodo = {
    hoje: mkOwnerMap(),
    ontem: mkOwnerMap(),
    semana: mkOwnerMap(),
    mes: mkOwnerMap(),
    total: mkOwnerMap(),
    data: mkOwnerMap(),
  };

  const addOwner = (map: Map<string, OwnerAgg>, ownerId: string, cents: number) => {
    if (!ownerId) return;
    const existing = map.get(ownerId) ?? { nome: ownersMap.get(ownerId) ?? "sem nome", cotacoes: 0, oportunidade: 0 };
    existing.cotacoes++;
    existing.oportunidade += cents;
    map.set(ownerId, existing);
  };

  // Dedup: mesma placa cotada N vezes pelo mesmo consultor no mesmo dia conta 1x
  const normPlaca = (p: unknown) => String(p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const vistos = new Set<string>();

  // Iterar do mais ANTIGO pro mais NOVO garante que a 1a cotação do dia é a que fica.
  // (rows vem ordenado desc por created_at — invertemos aqui.)
  const ordered = [...(rows ?? [])].reverse();

  for (const r of ordered) {
    const metadata = (r.metadata ?? {}) as Record<string, unknown>;
    // Cotações flaggadas como tipo_errado (utilitário/diesel cotado como carro)
    // ficam fora do dashboard até o consultor refazer manualmente — senão
    // o faturamento potencial fica subestimado.
    if (metadata.tipo_errado === true) continue;
    const placa = normPlaca(metadata.placa);
    const createdAt = r.created_at as string;
    const createdDay = createdAt.slice(0, 10);
    const ownerId = r.owner_id as string;
    const dedupKey = `${ownerId}|${placa}|${createdDay}`;
    // Se já contei (owner+placa+dia), pula — sem incrementar nada
    if (placa && vistos.has(dedupKey)) continue;
    if (placa) vistos.add(dedupKey);

    // Valor da oportunidade = valor MENSAL da cotação (não o FIPE do veículo).
    // Ordem de preferência:
    // 1) monthlyValueCents salvo direto no metadata (cotações novas)
    // 2) extraído por regex do whatsappMessage armazenado (igual ao SDR)
    // 3) fallback: 1% do valor FIPE (padrão aproximado proteção veicular)
    const cents = (() => {
      const direct = metadata.monthlyValueCents;
      if (typeof direct === "number" && direct > 0) return direct;

      const msg = metadata.whatsappMessage;
      if (typeof msg === "string") {
        const match = msg.match(/Valor (?:Mensal|Total) do Plano:\s*\*?R\$\s*([\d.,]+)/i);
        if (match && match[1]) {
          const v = parseFloat(match[1].replace(/\./g, "").replace(",", "."));
          if (Number.isFinite(v) && v > 0) return Math.round(v * 100);
        }
      }

      // Fallback: 1% do FIPE
      const fipeRaw = (metadata.valorFipe ?? metadata.fipeValor ?? "0") as unknown;
      if (typeof fipeRaw !== "string") return 0;
      const n = fipeRaw.replace(/[^\d,]/g, "").replace(",", ".");
      const fipe = parseFloat(n);
      return Number.isFinite(fipe) && fipe > 0 ? Math.round(fipe * 100 * 0.01) : 0;
    })();
    total.cotacoes++; total.oportunidade += cents;
    addOwner(ownersPorPeriodo.total, ownerId, cents);
    if (createdDay === todayIso) { hoje.cotacoes++; hoje.oportunidade += cents; addOwner(ownersPorPeriodo.hoje, ownerId, cents); }
    if (createdDay === ontem) { on.cotacoes++; on.oportunidade += cents; addOwner(ownersPorPeriodo.ontem, ownerId, cents); }
    if (createdAt >= semanaIso) { sem.cotacoes++; sem.oportunidade += cents; addOwner(ownersPorPeriodo.semana, ownerId, cents); }
    if (createdAt >= mesIso) { mes.cotacoes++; mes.oportunidade += cents; addOwner(ownersPorPeriodo.mes, ownerId, cents); }
    if (dataEspecifica && createdDay === dataEspecifica) {
      data.cotacoes++; data.oportunidade += cents; addOwner(ownersPorPeriodo.data, ownerId, cents);
    }
  }

  const fmt = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const withFmt = (b: Bucket) => ({ ...b, oportunidadeFormatada: fmt(b.oportunidade) });

  const rankingCompleto = (map: Map<string, OwnerAgg>) =>
    Array.from(map.entries())
      .map(([id, v]) => ({ id, nome: v.nome, cotacoes: v.cotacoes, oportunidade: v.oportunidade, oportunidadeFormatada: fmt(v.oportunidade) }))
      .sort((a, b) => b.oportunidade - a.oportunidade);

  return NextResponse.json({
    hoje: withFmt(hoje),
    ontem: withFmt(on),
    semana: withFmt(sem),
    mes: withFmt(mes),
    total: withFmt(total),
    data: dataEspecifica ? withFmt(data) : null,
    dataEspecifica,
    rankings: {
      hoje: rankingCompleto(ownersPorPeriodo.hoje),
      ontem: rankingCompleto(ownersPorPeriodo.ontem),
      semana: rankingCompleto(ownersPorPeriodo.semana),
      mes: rankingCompleto(ownersPorPeriodo.mes),
      total: rankingCompleto(ownersPorPeriodo.total),
      data: dataEspecifica ? rankingCompleto(ownersPorPeriodo.data) : [],
    },
    // mantém backward-compat
    topConsultores: rankingCompleto(ownersPorPeriodo.total).slice(0, 5),
  });
}
