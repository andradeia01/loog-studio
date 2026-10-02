"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Veiculo {
  ok: true;
  placa: string;
  placa_alternativa: string | null;
  marca: string | null;
  modelo: string | null;
  ano: string | null;
  ano_modelo: string | null;
  cor: string | null;
  chassi: string | null;
  municipio: string | null;
  uf: string | null;
  segmento: string | null;
  sub_segmento: string | null;
  cilindradas: string | null;
  potencia: string | null;
  combustivel: string | null;
  upstream_ms: number | null;
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
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(HIST_KEY) : null;
    return raw ? (JSON.parse(raw) as HistItem[]) : [];
  } catch { return []; }
}
function saveHist(list: HistItem[]) {
  try { window.localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, HIST_MAX))); } catch {}
}

export function PlacaStudio() {
  const [placa, setPlaca] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [veiculo, setVeiculo] = useState<Veiculo | null>(null);
  const [hist, setHist] = useState<HistItem[]>([]);

  useEffect(() => { setHist(loadHist()); }, []);

  const consultar = useCallback(async (rawInput?: string) => {
    const raw = (rawInput ?? placa).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (raw.length !== 7) {
      setError("Placa precisa ter 7 caracteres (ex.: ABC1D23).");
      return;
    }
    setLoading(true);
    setError(null);
    setVeiculo(null);
    try {
      const res = await fetch(`/api/placa/${encodeURIComponent(raw)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const msg = (data as { message?: string }).message
          ?? (res.status === 404 ? "Veículo não encontrado." : `Falha (${res.status}).`);
        throw new Error(msg);
      }
      setVeiculo(data as Veiculo);
      const next: HistItem[] = [
        {
          placa: (data as Veiculo).placa,
          marca: (data as Veiculo).marca ?? "",
          modelo: (data as Veiculo).modelo ?? "",
          ano: (data as Veiculo).ano ?? "",
          at: Date.now(),
        },
        ...hist.filter((h) => h.placa !== (data as Veiculo).placa),
      ].slice(0, HIST_MAX);
      setHist(next);
      saveHist(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha inesperada.");
    } finally { setLoading(false); }
  }, [placa, hist]);

  function limparHist() {
    setHist([]);
    try { window.localStorage.removeItem(HIST_KEY); } catch {}
  }

  function copiar() {
    if (!veiculo) return;
    const linhas = [
      `Placa: ${veiculo.placa}`,
      `Marca/Modelo: ${veiculo.marca ?? "-"} ${veiculo.modelo ?? ""}`.trim(),
      `Ano: ${veiculo.ano ?? "-"}${veiculo.ano_modelo && veiculo.ano_modelo !== veiculo.ano ? ` (modelo ${veiculo.ano_modelo})` : ""}`,
      `Cor: ${veiculo.cor ?? "-"}`,
      `Combustível: ${veiculo.combustivel ?? "-"}`,
      `Chassi: ${veiculo.chassi ?? "-"}`,
      `Município/UF: ${veiculo.municipio ?? "-"}/${veiculo.uf ?? "-"}`,
      `Segmento: ${veiculo.segmento ?? "-"}${veiculo.sub_segmento ? ` · ${veiculo.sub_segmento}` : ""}`,
    ];
    try { navigator.clipboard.writeText(linhas.join("\n")); } catch {}
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="space-y-4">
        <form
          onSubmit={(e) => { e.preventDefault(); consultar(); }}
          className="card space-y-3 p-5"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Consulta de placa</h2>
          <p className="text-xs text-loog-muted/90">
            Dados do veículo pela placa — fonte PlacaFipe. Aceita placas antigas (ABC1234) e Mercosul (ABC1D23).
          </p>
          <label className="label">Placa</label>
          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="input text-center font-display text-2xl font-extrabold tracking-[0.3em]"
            placeholder="ABC-1D23"
            value={formatPlacaMask(placa)}
            onChange={(e) => setPlaca(e.target.value)}
            maxLength={8}
            required
          />
          <button type="submit" className="btn-primary w-full !py-2" disabled={loading}>
            {loading ? "Consultando…" : "🚗 Consultar"}
          </button>
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
        </form>

        <div className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-loog-muted">Últimas consultas</h3>
            {hist.length > 0 && (
              <button type="button" onClick={limparHist} className="text-[10px] text-loog-muted hover:text-white">
                limpar
              </button>
            )}
          </div>
          {hist.length === 0 ? (
            <p className="rounded-lg border border-dashed border-loog-border p-3 text-xs text-loog-muted">
              Nenhuma consulta ainda.
            </p>
          ) : (
            <ul className="space-y-1">
              {hist.map((h) => (
                <li key={`${h.placa}-${h.at}`}>
                  <button
                    type="button"
                    onClick={() => { setPlaca(h.placa); consultar(h.placa); }}
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-white/5"
                  >
                    <span className="font-mono text-sm font-bold tracking-widest">{h.placa}</span>
                    <span className="truncate pl-3 text-[11px] text-loog-muted">
                      {h.marca} {h.modelo} {h.ano && `· ${h.ano}`}
                    </span>
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
            <h3 className="font-display text-lg font-bold">Consulta de veículo</h3>
            <p className="max-w-sm text-xs text-loog-muted">
              Digite a placa (com ou sem traço) e clique em Consultar. Retorna marca, modelo, ano, cor,
              chassi, município/UF e combustível em segundos.
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
          <article className="card overflow-hidden">
            <header className="flex items-center justify-between gap-3 border-b border-loog-border/60 bg-loog-brand/15 px-5 py-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">Placa consultada</div>
                <div className="font-display text-2xl font-extrabold tracking-[0.25em]">{veiculo.placa}</div>
                {veiculo.placa_alternativa && veiculo.placa_alternativa !== veiculo.placa && (
                  <div className="text-[10px] text-loog-muted">alt.: {veiculo.placa_alternativa}</div>
                )}
              </div>
              <div className="text-right">
                <div className="font-display text-xl font-bold leading-tight">
                  {veiculo.marca ?? "-"} <span className="font-normal text-loog-muted">·</span>{" "}
                  {veiculo.modelo ?? "-"}
                </div>
                <div className="text-xs text-loog-muted">
                  {veiculo.ano ?? "-"}
                  {veiculo.ano_modelo && veiculo.ano_modelo !== veiculo.ano ? ` / mod. ${veiculo.ano_modelo}` : ""}
                </div>
              </div>
            </header>

            <div className="grid gap-x-4 gap-y-3 p-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Cor" value={veiculo.cor} />
              <Field label="Combustível" value={veiculo.combustivel} />
              <Field label="Cilindradas" value={veiculo.cilindradas ? `${veiculo.cilindradas} cc` : null} />
              <Field label="Potência" value={veiculo.potencia} />
              <Field label="Segmento" value={veiculo.segmento} />
              <Field label="Subsegmento" value={veiculo.sub_segmento} />
              <Field label="Município" value={veiculo.municipio} />
              <Field label="UF" value={veiculo.uf} />
              <Field label="Chassi" value={veiculo.chassi} mono />
            </div>

            <footer className="flex items-center justify-between border-t border-loog-border/60 px-5 py-3 text-[10px] text-loog-muted">
              <span>fonte: PlacaFipe · {veiculo.upstream_ms ? `${veiculo.upstream_ms}ms` : "ok"}</span>
              <button type="button" onClick={copiar} className="rounded-md border border-loog-border px-2 py-1 text-[10px] hover:bg-white/5">
                📋 Copiar resumo
              </button>
            </footer>
          </article>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">{label}</div>
      <div className={cn("truncate text-sm", mono && "font-mono text-xs")}>
        {value && value !== "null" ? value : <span className="text-loog-muted">—</span>}
      </div>
    </div>
  );
}
