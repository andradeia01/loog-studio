import { NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/sdr/metrics?date=YYYY-MM-DD
 *
 * Antes: era proxy puro pro Hub externo (`${HUB_URL}/v1/sdr/metrics`). Quando o Hub
 * ficava fora ou as env vars sumiam, respondia 502 e o dashboard mostrava
 * "Não foi possível carregar as métricas desta seção".
 *
 * Agora: tenta o Hub primeiro (fonte canônica quando disponível) e, se falhar
 * por qualquer motivo, cai pro cálculo direto do Supabase CRM — assim o dashboard
 * SEMPRE devolve uma resposta válida com números reais (nem que sejam zeros).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get("date"); // YYYY-MM-DD opcional

  // 1. Tenta Hub externo (se configurado)
  const hubUrl = process.env.HUB_URL;
  const hubKey = process.env.HUB_INTERNAL_API_KEY;
  if (hubUrl && hubKey) {
    try {
      const target = date
        ? `${hubUrl}/v1/sdr/metrics?date=${encodeURIComponent(date)}`
        : `${hubUrl}/v1/sdr/metrics`;
      const r = await fetch(target, {
        headers: { Authorization: `Bearer ${hubKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const payload = await r.json();
        return NextResponse.json({ ...payload, _source: "hub" });
      }
      console.warn("[sdr/metrics] Hub respondeu", r.status, "- caindo pro Supabase");
    } catch (err) {
      console.warn("[sdr/metrics] Hub inacessível, fallback Supabase:", (err as Error).message);
    }
  }

  // 2. Fallback: calcula do CRM Supabase
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;
  const admin = createSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(emptyMetrics(date), { headers: { "Cache-Control": "no-store" } });
  }

  // Horizonte: últimos 60 dias cobre todos os buckets (hoje/ontem/7d/30d/total)
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const [contactsRes, interactionsRes] = await Promise.all([
    admin
      .from("crm_contacts")
      .select("id, status_ciclo, temperatura, origem, created_at")
      .gte("created_at", since),
    admin
      .from("crm_interactions")
      .select("tipo, metadata, created_at")
      .in("tipo", ["cotacao_rapida", "cotacao_completa"])
      .gte("created_at", since),
  ]);

  if (contactsRes.error || interactionsRes.error) {
    console.error("[sdr/metrics] supabase error:", contactsRes.error ?? interactionsRes.error);
    return NextResponse.json(emptyMetrics(date), { headers: { "Cache-Control": "no-store" } });
  }

  const contacts = contactsRes.data ?? [];
  const interactions = interactionsRes.data ?? [];

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const ontem = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const semanaIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const mesIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  interface Bucket { leads: number; cotacoes: number; valorCotado: number; handoffs: number; negociando: number }
  const mk = (): Bucket => ({ leads: 0, cotacoes: 0, valorCotado: 0, handoffs: 0, negociando: 0 });
  const hoje = mk(), on = mk(), sem = mk(), mes = mk(), total = mk(), data = mk();
  let totalGanhos = 0;

  // Contagem de LEADS (crm_contacts)
  for (const c of contacts) {
    const createdAt = c.created_at as string;
    const createdDay = createdAt.slice(0, 10);
    const isNegociando = c.status_ciclo === "ativo" && c.temperatura === "quente";
    const isHandoff = c.status_ciclo === "ativo" && (c.origem === "sdr" || c.origem === "handoff");
    const isGanho = c.status_ciclo === "cliente";

    total.leads++;
    if (isNegociando) total.negociando++;
    if (isHandoff) total.handoffs++;
    if (isGanho) totalGanhos++;

    if (createdDay === todayIso) {
      hoje.leads++;
      if (isNegociando) hoje.negociando++;
      if (isHandoff) hoje.handoffs++;
    }
    if (createdDay === ontem) {
      on.leads++;
      if (isNegociando) on.negociando++;
      if (isHandoff) on.handoffs++;
    }
    if (createdAt >= semanaIso) {
      sem.leads++;
      if (isNegociando) sem.negociando++;
      if (isHandoff) sem.handoffs++;
    }
    if (createdAt >= mesIso) {
      mes.leads++;
      if (isNegociando) mes.negociando++;
      if (isHandoff) mes.handoffs++;
    }
    if (date && createdDay === date) {
      data.leads++;
      if (isNegociando) data.negociando++;
      if (isHandoff) data.handoffs++;
    }
  }

  // Contagem de COTAÇÕES (crm_interactions tipo cotacao_*)
  const normPlaca = (p: unknown) => String(p ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const vistos = new Set<string>(); // dedup placa+dia pra não contar re-cotação
  for (const i of [...interactions].reverse()) {
    const metadata = (i.metadata ?? {}) as Record<string, unknown>;
    if (metadata.tipo_errado === true) continue;
    const createdAt = i.created_at as string;
    const createdDay = createdAt.slice(0, 10);
    const placa = normPlaca(metadata.placa);
    const dedupKey = `${placa}|${createdDay}`;
    if (placa && vistos.has(dedupKey)) continue;
    if (placa) vistos.add(dedupKey);

    const cents = extractCents(metadata);
    total.cotacoes++; total.valorCotado += cents;
    if (createdDay === todayIso) { hoje.cotacoes++; hoje.valorCotado += cents; }
    if (createdDay === ontem) { on.cotacoes++; on.valorCotado += cents; }
    if (createdAt >= semanaIso) { sem.cotacoes++; sem.valorCotado += cents; }
    if (createdAt >= mesIso) { mes.cotacoes++; mes.valorCotado += cents; }
    if (date && createdDay === date) { data.cotacoes++; data.valorCotado += cents; }
  }

  const taxaConversao = total.leads > 0 ? Math.round((totalGanhos / total.leads) * 100) : 0;

  return NextResponse.json({
    hoje: withFmt(hoje),
    ontem: withFmt(on),
    semana: withFmt(sem),
    mes: withFmt(mes),
    total: { ...withFmt(total), ganhos: totalGanhos },
    data: date ? withFmt(data) : null,
    dataEspecifica: date,
    taxaConversao,
    _source: "supabase",
  }, { headers: { "Cache-Control": "no-store" } });
}

function withFmt(b: { leads: number; cotacoes: number; valorCotado: number; handoffs: number; negociando: number }) {
  return { ...b, valorCotadoFormatado: fmt(b.valorCotado) };
}
function fmt(cents: number): string {
  return `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Extrai cents do metadata (preferindo monthlyValueCents > whatsappMessage > fallback 1% FIPE). */
function extractCents(metadata: Record<string, unknown>): number {
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

  const fipeRaw = (metadata.valorFipe ?? metadata.fipeValor ?? "0") as unknown;
  if (typeof fipeRaw !== "string") return 0;
  const n = fipeRaw.replace(/[^\d,]/g, "").replace(",", ".");
  const fipe = parseFloat(n);
  return Number.isFinite(fipe) && fipe > 0 ? Math.round(fipe * 100 * 0.01) : 0;
}

/** Estrutura vazia válida — usada quando nenhum backend tá disponível. UI mostra zeros em vez de ErroCard. */
function emptyMetrics(date: string | null) {
  const zero = { leads: 0, cotacoes: 0, valorCotado: 0, valorCotadoFormatado: "R$ 0,00", handoffs: 0, negociando: 0 };
  return {
    hoje: zero, ontem: zero, semana: zero, mes: zero,
    total: { ...zero, ganhos: 0 },
    data: date ? zero : null,
    dataEspecifica: date,
    taxaConversao: 0,
    _source: "empty",
  };
}
