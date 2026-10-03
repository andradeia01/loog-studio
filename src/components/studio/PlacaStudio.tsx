"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

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
  color?: string; fipeCode: string; fipeFormatted: string;
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

  useEffect(() => { setHist(loadHist()); }, []);

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
      // adiciona ao histórico
      if (r.vehicle) {
        const next: HistItem[] = [
          { placa: r.vehicle.plate, marca: r.vehicle.brand, modelo: r.vehicle.model, ano: String(r.vehicle.modelYear), at: Date.now() },
          ...hist.filter((h) => h.placa !== r.vehicle!.plate),
        ].slice(0, HIST_MAX);
        setHist(next); saveHist(next);
      }
      // auto-baixa o PDF oficial se o Hub devolveu pdfUrl
      if (r.pdfUrl) {
        setTimeout(() => { window.open(r.pdfUrl!, "_blank"); }, 400);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha inesperada.");
    } finally { setLoading(false); }
  }, [placa, clienteNome, clienteTel, hist]);

  function novaConsulta() {
    setPlaca(""); setClienteNome(""); setClienteTel(""); setResult(null); setError(null);
  }

  function limparHist() {
    setHist([]); try { window.localStorage.removeItem(HIST_KEY); } catch {}
  }

  async function enviarWhatsapp() {
    if (!result) return;
    const telLimpo = clienteTel.replace(/[^0-9]/g, "");
    const telFinal = telLimpo.startsWith("55") ? telLimpo : (telLimpo.length === 11 ? "55" + telLimpo : telLimpo);
    // mensagem oficial vem do Hub (gerada pelo próprio SIVIS)
    const msg = result.whatsappMessage ?? (result.pdfUrl ? `Olá! Segue sua cotação LOOG oficial: ${result.pdfUrl}` : "Olá! Sua cotação LOOG está pronta.");
    const url = `https://wa.me/${telFinal}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="space-y-4">
        <form onSubmit={consultar} className="card space-y-3 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Cotação LOOG</h2>
          <p className="text-xs text-loog-muted/90">
            Fluxo automático: digita placa + nome + telefone → cotação oficial direto no sistema LOOG (pasta SDR) + PDF pronto pra enviar.
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
        {result && (
          <ResultCard
            r={result}
            telCliente={clienteTel}
            onWhats={enviarWhatsapp}
            onNova={novaConsulta}
          />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card flex min-h-[280px] flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="text-5xl">🚘</span>
      <h3 className="font-display text-lg font-bold">Cotação oficial LOOG em 1 clique</h3>
      <p className="max-w-sm text-xs text-loog-muted">
        Direto no sistema interno LOOG (pasta SDR). Devolve: valor mensal, adesão,
        PDF oficial com identidade LOOG e mensagem pronta pro WhatsApp.
      </p>
    </div>
  );
}

function LoadingCard() {
  return (
    <div className="card flex min-h-[280px] flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-loog-brand border-t-transparent" />
      <p className="text-sm font-semibold">Processando cotação…</p>
      <p className="text-[11px] text-loog-muted">Consultando placa → resolvendo FIPE → criando proposta no sistema LOOG → gerando PDF.</p>
    </div>
  );
}

function ResultCard({ r, telCliente, onWhats, onNova }: {
  r: HubResult; telCliente: string;
  onWhats: () => void; onNova: () => void;
}) {
  const mensal = r.plan?.monthlyValueFormatted ?? "—";
  const adesao = r.plan?.joinFeeFormatted ?? "—";
  const mensalCents = r.plan?.monthlyValueCents ?? 0;
  const adesaoCents = r.plan?.joinFeeValueCents ?? 0;
  const investimento = mensalCents && adesaoCents
    ? ((mensalCents + adesaoCents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : null;

  const telLimpo = telCliente.replace(/[^0-9]/g, "");
  const telFinal = telLimpo.startsWith("55") ? telLimpo : (telLimpo.length === 11 ? "55" + telLimpo : telLimpo);
  const waOnlyLink = r.pdfUrl
    ? `https://wa.me/${telFinal}?text=${encodeURIComponent(`Olá! Segue sua cotação LOOG: ${r.pdfUrl}`)}`
    : null;

  return (
    <>
      <article className="card overflow-hidden border border-emerald-500/30">
        <header className="flex items-center gap-3 border-b border-emerald-500/20 bg-emerald-500/10 px-5 py-3">
          <span className="text-2xl">✅</span>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-300">Cotação registrada no sistema LOOG</h3>
            <p className="text-[11px] text-loog-muted">Nº {r.quoteId.slice(0, 20)} · pasta SDR</p>
          </div>
        </header>

        {r.vehicle && (
          <div className="border-b border-loog-border/60 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">Veículo</div>
                <div className="font-display text-lg font-bold leading-tight">
                  {r.vehicle.brand} <span className="font-normal text-loog-muted">·</span> {r.vehicle.model}
                </div>
                <div className="text-xs text-loog-muted">
                  Ano {r.vehicle.modelYear} · Placa <b className="text-white tracking-widest">{r.vehicle.plate}</b> · {r.vehicle.vehicleCategory}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">Valor FIPE</div>
                <div className="font-display text-xl font-bold text-loog-brand">{r.vehicle.fipeFormatted}</div>
                <div className="text-[10px] text-loog-muted">FIPE {r.vehicle.fipeCode}</div>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-3 p-5 sm:grid-cols-2">
          {investimento && (
            <div className="rounded-xl bg-loog-brand p-4 text-white shadow-glow">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/80">Investimento Inicial</div>
              <div className="mt-1 font-display text-3xl font-extrabold">{investimento}</div>
              <div className="mt-1 text-[11px] text-white/80">1º boleto · {mensal} mensalidade + {adesao} adesão</div>
            </div>
          )}
          <div className={cn("rounded-xl border-2 border-loog-brand bg-white/5 p-4", !investimento && "sm:col-span-2")}>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-brand">Valor Total do Plano</div>
            <div className="mt-1 font-display text-3xl font-extrabold text-loog-brand">{mensal}</div>
            <div className="mt-1 text-[11px] text-loog-muted">mensalidade recorrente · boleto, cartão ou PIX</div>
          </div>
        </div>

        {r.plan?.defaultCoverages && r.plan.defaultCoverages.length > 0 && (
          <div className="border-t border-loog-border/60 px-5 py-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-loog-muted">Coberturas inclusas</div>
            <ul className="space-y-1 text-xs text-loog-muted">
              {r.plan.defaultCoverages.map((c) => (
                <li key={c.id}>✓ {c.name} <span className="text-loog-muted/60">· {c.valueFormatted}</span></li>
              ))}
            </ul>
          </div>
        )}

        <footer className="flex flex-wrap gap-2 border-t border-loog-border/60 px-5 py-3">
          {r.pdfUrl && (
            <a href={r.pdfUrl} target="_blank" rel="noopener noreferrer" className="rounded-md bg-loog-brand px-3 py-2 text-xs font-bold text-white hover:brightness-110">
              📥 Baixar PDF oficial
            </a>
          )}
          <button type="button" onClick={onWhats} className="rounded-md bg-[#25D366] px-3 py-2 text-xs font-bold text-black hover:brightness-110">
            📲 Enviar mensagem LOOG
          </button>
          {waOnlyLink && (
            <a href={waOnlyLink} target="_blank" rel="noopener noreferrer" className="rounded-md border border-loog-border px-3 py-2 text-xs text-loog-muted hover:bg-white/5">
              Enviar só link
            </a>
          )}
          {r.portalUrl && (
            <a href={r.portalUrl} target="_blank" rel="noopener noreferrer" className="ml-auto rounded-md border border-loog-border px-3 py-2 text-xs text-loog-muted hover:bg-white/5">
              Ver no SIVIS →
            </a>
          )}
        </footer>
      </article>

      {r.whatsappMessage && (
        <div className="card p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-loog-muted">Mensagem WhatsApp oficial</h3>
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(r.whatsappMessage ?? ""); }}
              className="text-[10px] text-loog-muted hover:text-white"
            >
              📋 copiar
            </button>
          </div>
          <pre className="whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-[11px] text-loog-muted">{r.whatsappMessage}</pre>
        </div>
      )}

      <button type="button" onClick={onNova} className="text-xs text-loog-muted hover:text-white">
        ← Nova cotação
      </button>
    </>
  );
}
