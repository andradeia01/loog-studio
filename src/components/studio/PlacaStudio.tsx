"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { loadConsultant } from "@/lib/storage";
import { montarMensagemWhats, type CoberturaItem } from "@/lib/mensagem-whats";

interface HubPlan {
  productId: string | number;
  name: string;
  monthlyValueCents?: number;
  monthlyValueFormatted?: string;
  joinFeeValueCents?: number;
  joinFeeFormatted?: string;
  defaultCoverages?: Array<{ id: string; name: string; valueFormatted: string }>;
  defaultServices?: Array<{ id: string; name: string; valueFormatted: string }>;
}
interface HubVehicle {
  plate: string; brand: string; model: string; modelYear: number;
  color?: string | null; fipeCode: string; fipeFormatted: string;
  vehicleCategory: string;
}
interface HubResult {
  ok: true;
  quoteId: string;
  plan?: HubPlan;
  whatsappMessage?: string;
  portalUrl?: string;
  pdfUrl?: string;
  printUrl?: string;
  vehicle?: HubVehicle;
}

interface HistItem { placa: string; marca: string; modelo: string; ano: string; at: number }

const HIST_KEY = "loog-placa-hist-v1";
const HIST_MAX = 10;
const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function formatPlacaMask(raw: string): string {
  const only = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 7);
  if (only.length <= 3) return only;
  return only.slice(0, 3) + "-" + only.slice(3);
}
function loadHist(): HistItem[] {
  try { const raw = typeof window !== "undefined" ? window.localStorage.getItem(HIST_KEY) : null; return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveHist(list: HistItem[]) {
  try { window.localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, HIST_MAX))); } catch {}
}

export function PlacaStudio() {
  const [placa, setPlaca] = useState("");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTel, setClienteTel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HubResult | null>(null);
  const [hist, setHist] = useState<HistItem[]>([]);
  const [coberturas, setCoberturas] = useState<CoberturaItem[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => { setHist(loadHist()); }, []);

  // Quando chega nova cotação, inicializa toggles de coberturas (todas ligadas)
  useEffect(() => {
    if (!result?.plan) { setCoberturas([]); return; }
    // Preferir defaultCoverages. defaultServices entra junto se for diferente de "reboque" (que já é fixo).
    const seen = new Set<string>();
    const base: CoberturaItem[] = [];
    for (const c of result.plan.defaultCoverages ?? []) {
      // reboque já aparece na "Proteção Contratada" fixa — não duplicar
      if (/reboque|assist.?ncia/i.test(c.name)) continue;
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      base.push({ id: c.id, nome: c.name, ligado: true });
    }
    for (const s of result.plan.defaultServices ?? []) {
      if (/reboque|assist.?ncia/i.test(s.name)) continue;
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      base.push({ id: s.id, nome: s.name, ligado: true });
    }
    setCoberturas(base);
  }, [result]);

  const valores = useMemo(() => {
    if (!result?.plan) return null;
    const mensalCents = result.plan.monthlyValueCents ?? 0;
    const adesaoCents = result.plan.joinFeeValueCents ?? 0;
    const mensalidade = mensalCents / 100;
    const adesao = adesaoCents / 100;
    const investimentoInicial = mensalidade + adesao;
    return {
      mensalidade, adesao, investimentoInicial,
      mensalidadeFormatted: result.plan.monthlyValueFormatted ?? BRL(mensalidade),
      adesaoFormatted: result.plan.joinFeeFormatted ?? BRL(adesao),
      investimentoInicialFormatted: BRL(investimentoInicial),
    };
  }, [result]);

  const mensagemWhats = useMemo(() => {
    if (!result?.vehicle || !valores) return "";
    return montarMensagemWhats({
      cliente: { nome: clienteNome },
      veiculo: {
        placa: result.vehicle.plate,
        brand: result.vehicle.brand,
        model: result.vehicle.model,
        modelYear: result.vehicle.modelYear,
        categoria: result.vehicle.vehicleCategory,
        fipeFormatted: result.vehicle.fipeFormatted,
      },
      valores: {
        mensalidadeFormatted: valores.mensalidadeFormatted,
        adesaoFormatted: valores.adesaoFormatted,
        investimentoInicialFormatted: valores.investimentoInicialFormatted,
      },
      coberturas,
      validadeDias: 5,
    });
  }, [result, valores, coberturas, clienteNome]);

  const consultar = useCallback(async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    const raw = placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (raw.length !== 7) { setError("Placa precisa ter 7 caracteres (ex.: ABC1D23)."); return; }
    if (!clienteNome.trim()) { setError("Preencha o nome do cliente."); return; }
    if (clienteTel.replace(/[^0-9]/g, "").length < 10) { setError("Telefone precisa ter DDD + número."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/cotacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: raw,
          cliente: { nome: clienteNome.trim(), telefone: clienteTel.trim() },
        }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const msg = (data as { message?: string }).message ?? `Falha (${res.status}).`;
        throw new Error(msg);
      }
      const r = data as HubResult;
      setResult(r);
      if (r.vehicle) {
        const next: HistItem[] = [
          { placa: r.vehicle.plate, marca: r.vehicle.brand, modelo: r.vehicle.model, ano: String(r.vehicle.modelYear), at: Date.now() },
          ...hist.filter((h) => h.placa !== r.vehicle!.plate),
        ].slice(0, HIST_MAX);
        setHist(next); saveHist(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha inesperada.");
    } finally { setLoading(false); }
  }, [placa, clienteNome, clienteTel, hist]);

  async function baixarPdfPremium() {
    if (!result?.vehicle || !valores) return;
    setPdfLoading(true);
    try {
      const stored = loadConsultant();
      const res = await fetch("/api/cotacao/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: { nome: clienteNome, telefone: clienteTel },
          veiculo: {
            placa: result.vehicle.plate,
            brand: result.vehicle.brand,
            model: result.vehicle.model,
            modelYear: result.vehicle.modelYear,
            color: result.vehicle.color ?? null,
            categoria: result.vehicle.vehicleCategory,
            fipeFormatted: result.vehicle.fipeFormatted,
          },
          valores,
          adicionais: coberturas.filter((c) => c.ligado).map((c) => c.nome),
          validadeDias: 5,
          consultor: {
            name: stored?.name ?? null,
            phone: stored?.phone ?? null,
            instagram: stored?.instagram ?? null,
            city: stored?.city ?? null,
          },
          quoteId: result.quoteId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Falha PDF (${res.status})`);
      }
      const blob = await res.blob();
      const filename = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1]
        ?? `LOOG-cotacao-${result.vehicle.plate}.pdf`;
      await entregarPdf(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar PDF.");
    } finally { setPdfLoading(false); }
  }

  async function entregarPdf(blob: Blob, filename: string) {
    const file = new File([blob], filename, { type: "application/pdf" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean; share?: (d: ShareData) => Promise<void> };
    if (nav.canShare?.({ files: [file] }) && nav.share) {
      try { await nav.share({ files: [file], title: filename }); return; } catch {}
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 6000);
  }

  function enviarWhatsapp() {
    if (!mensagemWhats) return;
    const telLimpo = clienteTel.replace(/[^0-9]/g, "");
    const telFinal = telLimpo.startsWith("55") ? telLimpo : (telLimpo.length === 11 ? "55" + telLimpo : telLimpo);
    const url = `https://wa.me/${telFinal}?text=${encodeURIComponent(mensagemWhats)}`;
    window.open(url, "_blank");
  }

  function copiarMensagem() {
    if (!mensagemWhats) return;
    try { navigator.clipboard.writeText(mensagemWhats); } catch {}
  }

  function toggleCobertura(id: string) {
    setCoberturas((prev) => prev.map((c) => c.id === id ? { ...c, ligado: !c.ligado } : c));
  }

  function novaConsulta() {
    setPlaca(""); setClienteNome(""); setClienteTel(""); setResult(null); setError(null);
  }

  function limparHist() {
    setHist([]); try { window.localStorage.removeItem(HIST_KEY); } catch {}
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="space-y-4">
        <form onSubmit={consultar} className="card space-y-3 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Cotação LOOG</h2>
          <p className="text-xs text-loog-muted/90">
            Fluxo: placa + cliente → cotação criada no sistema LOOG (pasta SDR) → PDF premium + mensagem WhatsApp oficial.
          </p>

          <label className="label">Placa</label>
          <input
            type="text" inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            className="input text-center font-display text-2xl font-extrabold tracking-[0.3em]"
            placeholder="ABC-1D23" value={formatPlacaMask(placa)}
            onChange={(e) => setPlaca(e.target.value)} maxLength={8} required
          />

          <label className="label">Nome do cliente</label>
          <input
            type="text" className="input" value={clienteNome}
            onChange={(e) => setClienteNome(e.target.value)} required placeholder="Nome completo"
          />

          <label className="label">Telefone com DDD</label>
          <input
            type="tel" className="input" value={clienteTel}
            onChange={(e) => setClienteTel(e.target.value)} required placeholder="(11) 99999-9999"
          />

          <button type="submit" className="btn-primary w-full !py-2" disabled={loading}>
            {loading ? "Gerando cotação…" : "🚗 Gerar cotação oficial"}
          </button>
          {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
        </form>

        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-loog-muted">Últimas placas</h3>
            {hist.length > 0 && <button type="button" onClick={limparHist} className="text-[10px] text-loog-muted hover:text-white">limpar</button>}
          </div>
          {hist.length === 0 ? (
            <p className="rounded-lg border border-dashed border-loog-border p-3 text-xs text-loog-muted">Nenhuma consulta ainda.</p>
          ) : (
            <ul className="space-y-1">
              {hist.map((h) => (
                <li key={`${h.placa}-${h.at}`}>
                  <button type="button" onClick={() => setPlaca(h.placa)}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-white/5">
                    <span className="font-mono text-sm font-bold tracking-widest">{h.placa}</span>
                    <span className="truncate pl-3 text-[11px] text-loog-muted">{h.marca} {h.modelo} {h.ano && `· ${h.ano}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <div className="space-y-4">
        {!result && !loading && !error && <EmptyState />}
        {loading && <LoadingCard />}
        {result && valores && (
          <>
            <ResultHeader r={result} valores={valores} onNova={novaConsulta} />
            <TogglesCard coberturas={coberturas} onToggle={toggleCobertura} />
            <AcoesCard
              onWhats={enviarWhatsapp}
              onPdf={baixarPdfPremium}
              pdfLoading={pdfLoading}
              onCopy={copiarMensagem}
            />
            <MensagemPreview texto={mensagemWhats} />
          </>
        )}
      </div>
    </div>
  );
}

// ============ subcomponentes ============

function EmptyState() {
  return (
    <div className="card flex min-h-[280px] flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="text-5xl">🚘</span>
      <h3 className="font-display text-lg font-bold">Cotação oficial LOOG em 1 clique</h3>
      <p className="max-w-sm text-xs text-loog-muted">
        Direto no sistema interno LOOG (pasta SDR). Entrega: PDF premium LOOG + mensagem WhatsApp pronta
        no formato oficial, sem valores por cobertura — do jeito que o cliente converte.
      </p>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="card flex min-h-[280px] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-loog-brand border-t-transparent" />
      <p className="text-sm font-semibold">Processando cotação…</p>
      <p className="text-[11px] text-loog-muted">Consultando placa → resolvendo FIPE → criando proposta no sistema LOOG → gerando valores.</p>
    </div>
  );
}

function ResultHeader({ r, valores, onNova }: {
  r: HubResult; valores: { mensalidadeFormatted: string; adesaoFormatted: string; investimentoInicialFormatted: string };
  onNova: () => void;
}) {
  return (
    <article className="card overflow-hidden border border-emerald-500/30">
      <header className="flex items-center gap-3 border-b border-emerald-500/20 bg-emerald-500/10 px-5 py-3">
        <span className="text-2xl">✅</span>
        <div className="flex-1">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-300">Cotação registrada no sistema LOOG</h3>
          <p className="text-[11px] text-loog-muted">Proposta nº {r.quoteId} · pasta SDR</p>
        </div>
        <button type="button" onClick={onNova} className="text-[10px] text-loog-muted hover:text-white">nova cotação</button>
      </header>

      {r.vehicle && (
        <div className="border-b border-loog-border/60 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">Veículo</div>
              <div className="font-display text-base font-bold leading-tight">{r.vehicle.brand}</div>
              <div className="text-sm text-white">{r.vehicle.model}</div>
              <div className="text-xs text-loog-muted">
                Ano {r.vehicle.modelYear} · Placa <b className="text-white tracking-widest">{r.vehicle.plate}</b> · {r.vehicle.vehicleCategory}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">Valor FIPE</div>
              <div className="font-display text-xl font-bold text-loog-brand">{r.vehicle.fipeFormatted}</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <div className="rounded-xl bg-loog-brand p-4 text-white shadow-glow">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/80">Investimento Inicial</div>
          <div className="mt-1 font-display text-3xl font-extrabold">{valores.investimentoInicialFormatted}</div>
          <div className="mt-1 text-[11px] text-white/80">1º boleto · {valores.mensalidadeFormatted} mensalidade + {valores.adesaoFormatted} adesão</div>
        </div>
        <div className="rounded-xl border-2 border-loog-brand bg-white/5 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-brand">Valor Total do Plano</div>
          <div className="mt-1 font-display text-3xl font-extrabold text-loog-brand">{valores.mensalidadeFormatted}</div>
          <div className="mt-1 text-[11px] text-loog-muted">mensalidade recorrente</div>
        </div>
      </div>
    </article>
  );
}

function TogglesCard({ coberturas, onToggle }: { coberturas: CoberturaItem[]; onToggle: (id: string) => void }) {
  return (
    <div className="card p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Coberturas inclusas</h3>
        <p className="text-[11px] text-loog-muted">Padrão tudo ligado. Desligue o que o cliente não quiser — mensagem e PDF atualizam na hora.</p>
      </div>
      <div className="mb-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300">
        <b>Fixas (não removíveis):</b> Assistência 24h nacional · Reboque KM ilimitado em colisão / 300km para pane
      </div>
      {coberturas.length === 0 ? (
        <p className="text-xs text-loog-muted">Nenhuma cobertura adicional nesta cotação.</p>
      ) : (
        <ul className="space-y-1.5">
          {coberturas.map((c) => (
            <li key={c.id}>
              <label className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition",
                c.ligado ? "bg-emerald-500/10 border border-emerald-500/30" : "bg-white/5 border border-loog-border opacity-60",
              )}>
                <input
                  type="checkbox"
                  checked={c.ligado}
                  onChange={() => onToggle(c.id)}
                  className="h-4 w-4 accent-emerald-500"
                />
                <span className="flex-1 text-xs">{c.nome}</span>
                <span className={cn("text-[10px] font-bold uppercase tracking-widest", c.ligado ? "text-emerald-300" : "text-loog-muted")}>
                  {c.ligado ? "incluso" : "removido"}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AcoesCard({ onWhats, onPdf, pdfLoading, onCopy }: {
  onWhats: () => void; onPdf: () => void; pdfLoading: boolean; onCopy: () => void;
}) {
  return (
    <div className="card flex flex-wrap gap-2 p-4">
      <button
        type="button"
        onClick={onWhats}
        className="flex-1 rounded-md bg-[#25D366] px-3 py-2.5 text-sm font-bold text-black hover:brightness-110"
      >
        📲 Enviar no WhatsApp
      </button>
      <button
        type="button"
        onClick={onPdf}
        disabled={pdfLoading}
        className="flex-1 rounded-md bg-loog-brand px-3 py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
      >
        {pdfLoading ? "Gerando PDF…" : "📥 Baixar PDF premium LOOG"}
      </button>
      <button
        type="button"
        onClick={onCopy}
        className="rounded-md border border-loog-border px-3 py-2.5 text-xs text-loog-muted hover:bg-white/5"
      >
        📋 Copiar mensagem
      </button>
    </div>
  );
}

function MensagemPreview({ texto }: { texto: string }) {
  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-loog-muted">Prévia da mensagem WhatsApp</h3>
        <span className="text-[10px] text-loog-muted">atualiza em tempo real conforme os toggles</span>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-[11px] text-loog-muted">{texto}</pre>
    </div>
  );
}
