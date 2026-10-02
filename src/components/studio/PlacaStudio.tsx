"use client";

import { useCallback, useEffect, useState } from "react";
import { cn, slugify, timestamp } from "@/lib/utils";
import { loadConsultant } from "@/lib/storage";

interface FipeInfo {
  marca: string; modelo: string; ano_modelo: number;
  codigo_fipe: string; mes_referencia: string; combustivel: string;
  valor: number; valor_formatado: string;
}
interface VeiculoInfo {
  placa: string; placa_alternativa: string | null;
  marca: string | null; modelo: string | null;
  ano: string | null; ano_modelo: string | null;
  cor: string | null; chassi: string | null;
  municipio: string | null; uf: string | null;
  segmento: string | null; sub_segmento: string | null;
  cilindradas: string | null; potencia: string | null;
  combustivel: string | null;
}
interface PlacaResult {
  ok: true;
  placa: string;
  veiculo: VeiculoInfo;
  fipe: FipeInfo[];
  fipe_recomendado: FipeInfo | null;
  upstream_ms: number | null;
  aviso?: string;
}

interface Plano { nome: string; mensalidade: number; mensalidade_formatada: string; adesao_formatada: string; destaques: string[] }

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
  const [loading, setLoading] = useState(false);
  const [cotacaoLoading, setCotacaoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [veiculo, setVeiculo] = useState<PlacaResult | null>(null);
  const [planos, setPlanos] = useState<Plano[] | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfName, setPdfName] = useState<string>("");
  const [hist, setHist] = useState<HistItem[]>([]);

  useEffect(() => { setHist(loadHist()); }, []);

  const consultar = useCallback(async (rawInput?: string) => {
    const raw = (rawInput ?? placa).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (raw.length !== 7) { setError("Placa precisa ter 7 caracteres (ex.: ABC1D23)."); return; }
    setLoading(true); setError(null); setVeiculo(null); setPlanos(null); setPdfBlob(null);
    try {
      const res = await fetch(`/api/placa/${encodeURIComponent(raw)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const msg = (data as { message?: string }).message ?? (res.status === 404 ? "Veículo não encontrado." : `Falha (${res.status}).`);
        throw new Error(msg);
      }
      setVeiculo(data as PlacaResult);
      const v = (data as PlacaResult).veiculo;
      const next: HistItem[] = [
        { placa: v.placa, marca: v.marca ?? "", modelo: v.modelo ?? "", ano: v.ano ?? "", at: Date.now() },
        ...hist.filter((h) => h.placa !== v.placa),
      ].slice(0, HIST_MAX);
      setHist(next); saveHist(next);
      // auto-dispara cotação
      void gerarCotacao(v.placa);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha inesperada.");
    } finally { setLoading(false); }
  }, [placa, hist]);

  async function gerarCotacao(placaFmt: string) {
    setCotacaoLoading(true);
    try {
      const stored = loadConsultant();
      const res = await fetch("/api/cotacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: placaFmt,
          consultant: {
            name: stored?.name ?? null,
            phone: stored?.phone ?? null,
            instagram: stored?.instagram ?? null,
            city: stored?.city ?? null,
          },
          format: "pdf",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? `Falha ao gerar cotação (${res.status}).`);
      }
      const essencial = parseFloat(res.headers.get("X-Mensalidade-Essencial") ?? "0");
      const completo = parseFloat(res.headers.get("X-Mensalidade-Completo") ?? "0");
      const premium = parseFloat(res.headers.get("X-Mensalidade-Premium") ?? "0");
      setPlanos([
        { nome: "Essencial", mensalidade: essencial, mensalidade_formatada: brl(essencial), adesao_formatada: "Isenta", destaques: ["Rastreamento 24h", "Roubo e furto", "Chaveiro"] },
        { nome: "Completo", mensalidade: completo, mensalidade_formatada: brl(completo), adesao_formatada: "Isenta", destaques: ["Tudo do Essencial", "Carro reserva 15 dias", "Guincho 500km", "Colisão com rateio"] },
        { nome: "Premium", mensalidade: premium, mensalidade_formatada: brl(premium), adesao_formatada: "Isenta", destaques: ["Tudo do Completo", "Guincho ilimitado", "Carro reserva 30 dias", "Consultor dedicado"] },
      ]);
      const blob = await res.blob();
      const filename = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `LOOG-cotacao-${slugify(placaFmt)}-${timestamp()}.pdf`;
      setPdfBlob(blob); setPdfName(filename);
      // auto-download — abre no mobile via Web Share quando disponível
      await entregarPdf(blob, filename);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar cotação.");
    } finally { setCotacaoLoading(false); }
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

  async function baixarNovamente() {
    if (!pdfBlob) return;
    await entregarPdf(pdfBlob, pdfName);
  }

  function limparHist() {
    setHist([]); try { window.localStorage.removeItem(HIST_KEY); } catch {}
  }

  function brl(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); consultar(); }} className="card space-y-3 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Consulta de placa</h2>
          <p className="text-xs text-loog-muted/90">
            Depois do OK, geramos automaticamente a <b>cotação em PDF</b> com os planos LOOG para o cliente.
          </p>
          <label className="label">Placa</label>
          <input
            type="text" inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            className="input text-center font-display text-2xl font-extrabold tracking-[0.3em]"
            placeholder="ABC-1D23" value={formatPlacaMask(placa)}
            onChange={(e) => setPlaca(e.target.value)} maxLength={8} required
          />
          <button type="submit" className="btn-primary w-full !py-2" disabled={loading}>
            {loading ? "Consultando…" : "🚗 Consultar + gerar cotação"}
          </button>
          {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}
        </form>

        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-loog-muted">Últimas consultas</h3>
            {hist.length > 0 && <button type="button" onClick={limparHist} className="text-[10px] text-loog-muted hover:text-white">limpar</button>}
          </div>
          {hist.length === 0 ? (
            <p className="rounded-lg border border-dashed border-loog-border p-3 text-xs text-loog-muted">Nenhuma consulta ainda.</p>
          ) : (
            <ul className="space-y-1">
              {hist.map((h) => (
                <li key={`${h.placa}-${h.at}`}>
                  <button type="button" onClick={() => { setPlaca(h.placa); consultar(h.placa); }}
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
        {!veiculo && !loading && !error && (
          <div className="card flex min-h-[260px] flex-col items-center justify-center gap-2 p-8 text-center">
            <span className="text-5xl">🚘</span>
            <h3 className="font-display text-lg font-bold">Consulta + cotação instantânea</h3>
            <p className="max-w-sm text-xs text-loog-muted">
              Digite a placa. Trazemos marca, modelo, ano e valor FIPE —
              e <b>já geramos o PDF da cotação</b> com os três planos LOOG prontos pra enviar ao cliente.
            </p>
          </div>
        )}

        {loading && (
          <div className="card flex min-h-[260px] flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-loog-brand border-t-transparent" />
            <p className="text-xs text-loog-muted">Consultando base nacional…</p>
          </div>
        )}

        {veiculo && (
          <>
            <article className="card overflow-hidden">
              <header className="flex items-center justify-between gap-3 border-b border-loog-border/60 bg-loog-brand/15 px-5 py-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">Placa consultada</div>
                  <div className="font-display text-2xl font-extrabold tracking-[0.25em]">{veiculo.veiculo.placa}</div>
                  {veiculo.veiculo.placa_alternativa && veiculo.veiculo.placa_alternativa !== veiculo.veiculo.placa && (
                    <div className="text-[10px] text-loog-muted">alt.: {veiculo.veiculo.placa_alternativa}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="font-display text-xl font-bold leading-tight">
                    {veiculo.veiculo.marca ?? "-"} <span className="font-normal text-loog-muted">·</span> {veiculo.veiculo.modelo ?? "-"}
                  </div>
                  <div className="text-xs text-loog-muted">
                    {veiculo.veiculo.ano ?? "-"}
                    {veiculo.veiculo.ano_modelo && veiculo.veiculo.ano_modelo !== veiculo.veiculo.ano ? ` / mod. ${veiculo.veiculo.ano_modelo}` : ""}
                  </div>
                </div>
              </header>

              <div className="grid gap-x-4 gap-y-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Cor" value={veiculo.veiculo.cor} />
                <Field label="Combustível" value={veiculo.veiculo.combustivel} />
                <Field label="Cilindradas" value={veiculo.veiculo.cilindradas ? `${veiculo.veiculo.cilindradas} cc` : null} />
                <Field label="Segmento" value={veiculo.veiculo.segmento} />
                <Field label="Município" value={veiculo.veiculo.municipio} />
                <Field label="UF" value={veiculo.veiculo.uf} />
                <Field label="Chassi" value={veiculo.veiculo.chassi} mono />
                <Field label="Valor FIPE" value={veiculo.fipe_recomendado?.valor_formatado ?? null} highlight />
                <Field label="Ref. FIPE" value={veiculo.fipe_recomendado?.mes_referencia ?? null} />
              </div>

              <footer className="flex items-center justify-between border-t border-loog-border/60 px-5 py-3 text-[10px] text-loog-muted">
                <span>fonte: PlacaFipe · {veiculo.upstream_ms ? `${veiculo.upstream_ms}ms` : "ok"}</span>
                {veiculo.aviso && <span className="text-amber-300">⚠ {veiculo.aviso}</span>}
              </footer>
            </article>

            {/* Card de cotação */}
            {cotacaoLoading && (
              <div className="card flex items-center gap-3 p-5">
                <div className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-loog-brand border-t-transparent" />
                <div>
                  <div className="text-sm font-semibold">Gerando cotação LOOG…</div>
                  <div className="text-[11px] text-loog-muted">Calculando planos e montando PDF pra entregar ao cliente.</div>
                </div>
              </div>
            )}

            {planos && !cotacaoLoading && (
              <article className="card overflow-hidden">
                <header className="flex items-center justify-between border-b border-loog-border/60 px-5 py-3">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Cotação pronta</h3>
                    <p className="text-[11px] text-loog-muted">PDF já baixou automaticamente — se não abriu, use o botão abaixo.</p>
                  </div>
                  <button type="button" onClick={baixarNovamente} className="btn-primary !py-2 !px-3 !text-xs" disabled={!pdfBlob}>
                    📥 Baixar PDF
                  </button>
                </header>
                <div className="grid gap-3 p-5 sm:grid-cols-3">
                  {planos.map((p, i) => (
                    <div key={p.nome} className={cn(
                      "rounded-xl p-4",
                      i === 1 ? "bg-loog-brand text-white shadow-glow" : "border border-loog-border bg-white/5",
                    )}>
                      <div className={cn("text-[10px] font-semibold uppercase tracking-widest", i === 1 ? "text-white/80" : "text-loog-muted")}>
                        {i === 1 ? "Mais escolhido" : "Plano"}
                      </div>
                      <div className="mt-1 font-display text-lg font-bold">{p.nome}</div>
                      <div className="mt-2 flex items-baseline gap-1">
                        <span className={cn("text-xs", i === 1 ? "text-white/80" : "text-loog-muted")}>R$</span>
                        <span className="font-display text-2xl font-extrabold">{p.mensalidade.toFixed(2).replace(".", ",")}</span>
                        <span className={cn("text-[10px]", i === 1 ? "text-white/80" : "text-loog-muted")}>/mês</span>
                      </div>
                      <div className={cn("text-[10px]", i === 1 ? "text-white/80" : "text-loog-muted")}>adesão isenta</div>
                      <ul className={cn("mt-3 space-y-1 text-[11px]", i === 1 ? "text-white/95" : "text-loog-muted")}>
                        {p.destaques.map((d) => <li key={d}>• {d}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
                <footer className="border-t border-loog-border/60 px-5 py-3 text-[10px] text-loog-muted">
                  Valores são estimativas · proposta final sujeita a análise · LOOG — proteção veicular associativa
                </footer>
              </article>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono, highlight }: { label: string; value: string | null | undefined; mono?: boolean; highlight?: boolean }) {
  return (
    <div className={highlight ? "rounded-lg bg-loog-brand/15 px-2 py-1" : undefined}>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">{label}</div>
      <div className={cn("truncate text-sm", mono && "font-mono text-xs", highlight && "text-base font-bold text-white")}>
        {value && value !== "null" ? value : <span className="text-loog-muted">—</span>}
      </div>
    </div>
  );
}
