"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { loadConsultant } from "@/lib/storage";
import { montarMensagemWhats, type CoberturaItem } from "@/lib/mensagem-whats";
import { trackingForBackend } from "@/lib/tracking";
import { trackMetaEvent } from "@/components/MetaPixel";
import { CoverageTogglesCustom } from "./CoverageTogglesCustom";
import { DiscountControl } from "./DiscountControl";

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
export interface FipeAlternative {
  codigo_fipe: string;
  marca: string;
  modelo: string;
  ano_modelo: string | number;
  combustivel?: string | null;
  valor_formatado?: string | null;
  similaridade?: number | null;
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
  fipeAlternatives?: FipeAlternative[];
  fipeEscolhido?: string;
  lowConfidence?: boolean;
  coberturasAplicadas?: string[];
  coberturasDefault?: string[];
  descontoCents?: number;
  descontoPct?: number;
  coverageBreakdown?: {
    base_cents: number;
    deltas: { codigo: string; descricao: string; delta_cents: number; grupo_label?: string }[];
    bruto_cents?: number;
    desconto_pct?: number;
    desconto_cents?: number;
    total_cents: number;
    defaults_aplicados?: string[];
  };
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
  const [tipoVeiculo, setTipoVeiculo] = useState<"carro" | "moto" | "utilitario" | "eletrico">("carro");
  const [clienteNome, setClienteNome] = useState("");
  const [clienteTel, setClienteTel] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<HubResult | null>(null);
  const [hist, setHist] = useState<HistItem[]>([]);
  const [coberturas, setCoberturas] = useState<CoberturaItem[]>([]);
  const [pdfLoading, setPdfLoading] = useState(false);
  // Coberturas customizadas V2 (códigos da tabela cotacao_coverages) + FIPE escolhido na desambiguação
  const [coberturasCodigos, setCoberturasCodigos] = useState<string[]>([]);
  const [fipeManualCode, setFipeManualCode] = useState<string | null>(null);
  const [descontoPct, setDescontoPct] = useState<number | null>(null); // null = default 10% do backend
  const [recotando, setRecotando] = useState(false);

  // Fallback manual quando a placa não resolve no Hub (401/403/404):
  const [showManual, setShowManual] = useState(false);
  const [manualMarca, setManualMarca] = useState("");
  const [manualModelo, setManualModelo] = useState("");
  const [manualAno, setManualAno] = useState<string>("");
  const [manualCombustivel, setManualCombustivel] = useState("Flex");

  useEffect(() => { setHist(loadHist()); }, []);

  // Monta a lista de coberturas (pra mensagem WhatsApp + PDF) a partir das
  // customizadas aplicadas no backend. Isso substitui o fluxo legado de ler
  // defaultCoverages/defaultServices do Hub — agora a verdade são os códigos
  // da nossa tabela cotacao_coverages (que inclui defaults + o que consultor marcou).
  useEffect(() => {
    const deltas = result?.coverageBreakdown?.deltas ?? [];
    if (!deltas.length) { setCoberturas([]); return; }
    // Deduplica por grupo_label — se por algum motivo vieram 2 níveis do mesmo radio,
    // mantém o de maior delta (que é o nível mais alto escolhido pelo consultor).
    const byGrupo = new Map<string, typeof deltas[number]>();
    for (const d of deltas) {
      // Filtra reboque base 300km (já aparece na "Proteção Contratada" fixa)
      if (/reboque.*300/i.test(d.descricao)) continue;
      // Downgrades (delta negativo) não entram como "adicional contratado"
      if (d.delta_cents < 0) continue;
      const chave = d.grupo_label || d.codigo;
      const existente = byGrupo.get(chave);
      if (!existente || d.delta_cents > existente.delta_cents) byGrupo.set(chave, d);
    }
    const base: CoberturaItem[] = Array.from(byGrupo.values()).map((d) => ({
      id: d.codigo,
      // Nome legível: "Danos Materiais a Terceiros: Até R$ 50.000" em vez de só "Até R$ 50.000"
      nome: d.grupo_label ? `${d.grupo_label}: ${d.descricao}` : d.descricao,
      ligado: true,
    }));
    setCoberturas(base);
  }, [result?.coverageBreakdown?.deltas]);

  const valores = useMemo(() => {
    if (!result?.plan) return null;
    const mensalCents = result.plan.monthlyValueCents ?? 0;
    const adesaoCents = result.plan.joinFeeValueCents ?? 0;
    const mensalidade = mensalCents / 100;
    const adesao = adesaoCents / 100;
    const investimentoInicial = mensalidade + adesao;
    // CRÍTICO: SEMPRE formatar do número atualizado — nunca confiar na string formatada
    // do Hub, porque ela não reflete o desconto aplicado nem os deltas das coberturas.
    return {
      mensalidade, adesao, investimentoInicial,
      mensalidadeFormatted: BRL(mensalidade),
      adesaoFormatted: BRL(adesao),
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

  const consultar = useCallback(async (ev?: React.FormEvent, overrides?: { coberturas?: string[]; fipeCode?: string | null; descontoPct?: number | null; keepResult?: boolean }) => {
    ev?.preventDefault();
    const raw = placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (raw.length !== 7) { setError("Placa precisa ter 7 caracteres (ex.: ABC1D23)."); return; }
    if (!clienteNome.trim()) { setError("Preencha o nome do cliente."); return; }
    if (clienteTel.replace(/[^0-9]/g, "").length < 10) { setError("Telefone precisa ter DDD + número."); return; }
    const isRecotando = !!overrides;
    if (isRecotando) setRecotando(true); else { setLoading(true); setResult(null); }
    setError(null);
    try {
      const coberturasFinal = overrides?.coberturas ?? coberturasCodigos;
      const fipeFinal = overrides?.fipeCode === null ? null : (overrides?.fipeCode ?? fipeManualCode);
      const descontoFinal = overrides?.descontoPct === null ? null : (overrides?.descontoPct ?? descontoPct);
      const res = await fetch("/api/cotacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: raw,
          tipo_veiculo: tipoVeiculo,
          cliente: { nome: clienteNome.trim(), telefone: clienteTel.trim() },
          tracking: trackingForBackend(crypto.randomUUID()),
          coberturas: coberturasFinal.length ? coberturasFinal : undefined,
          fipeCode: fipeFinal ?? undefined,
          descontoPct: descontoFinal ?? undefined,
        }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const msg = (data as { message?: string }).message ?? `Falha (${res.status}).`;
        // Se o backend sinalizar que dá pra cair pro manual, oferece
        if ((data as { canFallbackManual?: boolean }).canFallbackManual) {
          setShowManual(true);
        }
        throw new Error(msg);
      }
      const r = data as HubResult & { eventId?: string };
      setResult(r);
      // Sincroniza estado local com o que o backend aplicou
      setCoberturasCodigos(r.coberturasAplicadas ?? []);
      if (r.fipeEscolhido) setFipeManualCode(r.fipeEscolhido);
      if (typeof r.descontoPct === "number") setDescontoPct(r.descontoPct);
      // Meta Pixel browser — dedup com CAPI pelo mesmo eventId
      try {
        const monthly = r.plan?.monthlyValueCents;
        trackMetaEvent("Lead", {
          value: monthly ? monthly / 100 : undefined,
          currency: "BRL",
          content_name: r.vehicle ? `${r.vehicle.brand} ${r.vehicle.model}` : "cotacao_rapida",
          content_category: "cotacao_rapida",
        }, r.eventId);
      } catch { /* silencioso */ }
      if (r.vehicle) {
        const next: HistItem[] = [
          { placa: r.vehicle.plate, marca: r.vehicle.brand, modelo: r.vehicle.model, ano: String(r.vehicle.modelYear), at: Date.now() },
          ...hist.filter((h) => h.placa !== r.vehicle!.plate),
        ].slice(0, HIST_MAX);
        setHist(next); saveHist(next);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha inesperada.");
    } finally {
      setLoading(false);
      setRecotando(false);
    }
  }, [placa, tipoVeiculo, clienteNome, clienteTel, hist, coberturasCodigos, fipeManualCode, descontoPct]);

  // Chamado pelo CoverageTogglesCustom quando o consultor clica em "Aplicar à cotação"
  const aplicarCoberturas = useCallback(async (codigos: string[]) => {
    setCoberturasCodigos(codigos);
    await consultar(undefined, { coberturas: codigos });
  }, [consultar]);

  // Chamado pelo dropdown FIPE quando o consultor troca a versão do veículo
  const trocarFipe = useCallback(async (codigo: string) => {
    setFipeManualCode(codigo);
    await consultar(undefined, { fipeCode: codigo });
  }, [consultar]);

  // Chamado pelo DiscountControl ao mudar o % de desconto
  const aplicarDesconto = useCallback(async (pct: number) => {
    setDescontoPct(pct);
    await consultar(undefined, { descontoPct: pct });
  }, [consultar]);

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
    // No DESKTOP: download direto pra pasta Downloads (sem diálogo do Windows Share).
    // No MOBILE REAL: usa Web Share API pra oferecer salvar/WhatsApp/etc nativo.
    const nav = navigator as Navigator & {
      canShare?: (d: ShareData) => boolean;
      share?: (d: ShareData) => Promise<void>;
      userAgentData?: { mobile?: boolean };
    };
    const isMobile = nav.userAgentData?.mobile === true
      || (typeof window !== "undefined"
          && window.matchMedia?.("(pointer: coarse)").matches
          && (nav.maxTouchPoints ?? 0) > 0);

    if (isMobile) {
      const file = new File([blob], filename, { type: "application/pdf" });
      if (nav.canShare?.({ files: [file] }) && nav.share) {
        try { await nav.share({ files: [file], title: filename }); return; } catch { /* usuário cancelou — segue pro download */ }
      }
    }

    // Download direto — single click, cai no Downloads
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

  function novaConsulta() {
    setPlaca(""); setClienteNome(""); setClienteTel(""); setResult(null); setError(null);
    setShowManual(false); setManualMarca(""); setManualModelo(""); setManualAno("");
    setCoberturasCodigos([]); setFipeManualCode(null); setDescontoPct(null);
  }

  async function cotarManual(ev?: React.FormEvent) {
    ev?.preventDefault();
    if (!manualMarca.trim() || !manualModelo.trim() || !manualAno) {
      setError("Preencha marca, modelo e ano.");
      return;
    }
    const anoNum = Number(manualAno);
    if (!Number.isInteger(anoNum) || anoNum < 1980 || anoNum > new Date().getFullYear() + 1) {
      setError("Ano inválido.");
      return;
    }
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/cotacao/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marca: manualMarca.trim(),
          modelo: manualModelo.trim(),
          ano: anoNum,
          combustivel: manualCombustivel,
          tipo_veiculo: tipoVeiculo,
          placa: placa.replace(/[^A-Za-z0-9]/g, "").toUpperCase() || undefined,
          cliente: { nome: clienteNome.trim(), telefone: clienteTel.trim() },
          tracking: trackingForBackend(),
        }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) throw new Error((data as { message?: string }).message ?? `Falha (${res.status}).`);
      setResult(data as HubResult);
      setShowManual(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao cotar manualmente.");
    } finally { setLoading(false); }
  }

  function limparHist() {
    setHist([]); try { window.localStorage.removeItem(HIST_KEY); } catch {}
  }

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-[380px_1fr]">
      <aside className="min-w-0 space-y-4">
        <form onSubmit={consultar} className="card space-y-3 p-4 sm:p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-loog-muted">Cotação LOOG</h2>
          <p className="text-xs text-loog-muted/90">
            Fluxo: placa + cliente → cotação criada no sistema LOOG (pasta SDR) → PDF premium + mensagem WhatsApp oficial.
          </p>

          <label className="label">Tipo do veículo</label>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-loog-border bg-loog-panel/60 p-1 sm:grid-cols-4">
            {([
              { v: "carro",      lb: "🚗 Carro" },
              { v: "moto",       lb: "🏍️ Moto" },
              { v: "utilitario", lb: "🚚 Utilit." },
              { v: "eletrico",   lb: "⚡ Elétrico" },
            ] as const).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setTipoVeiculo(opt.v)}
                className={cn(
                  "rounded-lg px-2 py-2 text-[11px] font-semibold leading-tight transition sm:text-xs",
                  tipoVeiculo === opt.v
                    ? "bg-loog-brand text-white shadow-glow"
                    : "text-loog-muted hover:text-white",
                )}
              >
                {opt.lb}
              </button>
            ))}
          </div>

          <label className="label">Placa</label>
          <input
            type="text" inputMode="text" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            className="input text-center font-display text-lg font-extrabold tracking-[0.2em] sm:text-2xl sm:tracking-[0.3em]"
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
          {error && (
            <div className="space-y-2">
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>
              {showManual && (
                <button
                  type="button"
                  onClick={() => setShowManual(true)}
                  className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/20"
                >
                  🛠️ Cotar manualmente (marca/modelo/ano)
                </button>
              )}
            </div>
          )}
        </form>

        {/* Form de fallback manual (quoteFromText) — abre quando placa falha */}
        {showManual && (
          <form onSubmit={cotarManual} className="card space-y-3 border-amber-500/30 bg-amber-500/5 p-4 sm:p-5">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-200">🛠️ Cotação manual</h2>
              <p className="mt-1 text-[11px] text-loog-muted">
                A placa não resolveu no provedor LOOG. Informe os dados do veículo e enviamos a cotação direto pro sistema.
              </p>
            </div>

            <div>
              <label className="label">Marca</label>
              <input type="text" className="input" value={manualMarca} onChange={(e) => setManualMarca(e.target.value)} placeholder="ex.: Chevrolet" required />
            </div>
            <div>
              <label className="label">Modelo</label>
              <input type="text" className="input" value={manualModelo} onChange={(e) => setManualModelo(e.target.value)} placeholder="ex.: Onix 1.0 LT" required />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Ano</label>
                <input type="number" min={1980} max={new Date().getFullYear() + 1} className="input" value={manualAno} onChange={(e) => setManualAno(e.target.value)} placeholder="2024" required />
              </div>
              <div>
                <label className="label">Combustível</label>
                <select className="input" value={manualCombustivel} onChange={(e) => setManualCombustivel(e.target.value)}>
                  <option value="Flex">Flex</option>
                  <option value="Gasolina">Gasolina</option>
                  <option value="Álcool">Álcool</option>
                  <option value="Diesel">Diesel</option>
                  <option value="Elétrico">Elétrico</option>
                  <option value="Híbrido">Híbrido</option>
                </select>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full !py-2">
              {loading ? "Gerando…" : "🛠️ Gerar cotação manual"}
            </button>
            <button type="button" onClick={() => setShowManual(false)} className="w-full text-[11px] text-loog-muted hover:text-white">
              cancelar
            </button>
          </form>
        )}

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
            <ResultHeader
              r={result}
              valores={valores}
              onNova={novaConsulta}
              fipeEscolhido={result.fipeEscolhido ?? null}
              fipeAlternatives={result.fipeAlternatives ?? []}
              lowConfidence={result.lowConfidence ?? false}
              onTrocarFipe={trocarFipe}
              trocandoFipe={recotando}
            />
            <CoverageTogglesCustom
              tipoVeiculo={tipoVeiculo}
              baseMensalCents={result.coverageBreakdown?.base_cents ?? result.plan?.monthlyValueCents ?? 0}
              initialCodigos={result.coberturasAplicadas ?? []}
              defaultCodes={result.coberturasDefault ?? []}
              descontoCents={result.descontoCents ?? result.coverageBreakdown?.desconto_cents ?? 0}
              onApply={aplicarCoberturas}
              applying={recotando}
            />
            <DiscountControl
              brutoCents={result.coverageBreakdown?.bruto_cents ?? ((result.coverageBreakdown?.base_cents ?? 0) + 0)}
              descontoPctAplicado={result.descontoPct ?? result.coverageBreakdown?.desconto_pct ?? 10}
              onApply={aplicarDesconto}
              applying={recotando}
            />
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

function ResultHeader({ r, valores, onNova, fipeEscolhido, fipeAlternatives, lowConfidence, onTrocarFipe, trocandoFipe }: {
  r: HubResult; valores: { mensalidadeFormatted: string; adesaoFormatted: string; investimentoInicialFormatted: string };
  onNova: () => void;
  fipeEscolhido: string | null;
  fipeAlternatives: FipeAlternative[];
  lowConfidence: boolean;
  onTrocarFipe: (codigo: string) => void;
  trocandoFipe: boolean;
}) {
  // Lista as alternativas disponíveis (menos a que já está selecionada)
  const outrasVersoes = (fipeAlternatives ?? []).filter((f) => f.codigo_fipe !== fipeEscolhido);
  const temAlternativas = outrasVersoes.length > 0;
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
            <div className="min-w-0 flex-1">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">Veículo</div>
              <div className="font-display text-base font-bold leading-tight break-words">{r.vehicle.brand}</div>
              <div className="text-sm text-white break-words">{r.vehicle.model}</div>
              <div className="text-xs text-loog-muted break-words">
                Ano {r.vehicle.modelYear} · Placa <b className="text-white tracking-widest">{r.vehicle.plate}</b> · {r.vehicle.vehicleCategory}
              </div>
              {temAlternativas && (
                <FipeDisambig
                  alternatives={outrasVersoes}
                  lowConfidence={lowConfidence}
                  onTrocar={onTrocarFipe}
                  trocando={trocandoFipe}
                />
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">Valor FIPE</div>
              <div className="font-display text-lg font-bold text-loog-brand whitespace-nowrap sm:text-xl">{r.vehicle.fipeFormatted}</div>
            </div>
          </div>
        </div>
      )}

      {/* Badge de desconto aplicado (ou sem desconto, se consultor desligou) */}
      {(() => {
        const pct = r.coverageBreakdown?.desconto_pct ?? r.descontoPct ?? 10;
        const descontoCents = r.coverageBreakdown?.desconto_cents ?? r.descontoCents ?? 0;
        const brutoCents = r.coverageBreakdown?.bruto_cents ?? 0;
        if (pct <= 0) {
          return (
            <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2">
              <span className="text-base">⚠️</span>
              <div className="flex-1 text-[11px]">
                <b className="text-red-300">SEM desconto aplicado</b>
                <span className="ml-1 text-loog-muted">— valor bruto da cotação</span>
              </div>
            </div>
          );
        }
        return (
          <div className="mx-5 mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
            <span className="text-base">🎁</span>
            <div className="flex-1 text-[11px]">
              <b className="text-emerald-300">{pct}% de desconto aplicado</b>
              <span className="ml-1 text-loog-muted">
                — bruto {BRL(brutoCents / 100)} · desconto {BRL(descontoCents / 100)}
              </span>
            </div>
          </div>
        );
      })()}

      <div className="grid gap-3 p-5 sm:grid-cols-2">
        <div className="rounded-xl bg-loog-brand p-4 text-white shadow-glow">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-white/80">Investimento Inicial</div>
          <div className="mt-1 font-display text-3xl font-extrabold">{valores.investimentoInicialFormatted}</div>
          <div className="mt-1 text-[11px] text-white/80">1º boleto · {valores.mensalidadeFormatted} mensalidade + {valores.adesaoFormatted} adesão</div>
        </div>
        <div className="rounded-xl border-2 border-loog-brand bg-white/5 p-4">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-brand">Valor Mensal do Plano</div>
          <div className="mt-1 font-display text-3xl font-extrabold text-loog-brand">{valores.mensalidadeFormatted}</div>
          <div className="mt-1 text-[11px] text-loog-muted">
            pelos próximos 12 meses · {(r.coverageBreakdown?.desconto_pct ?? r.descontoPct ?? 10) > 0
              ? `com ${r.coverageBreakdown?.desconto_pct ?? r.descontoPct ?? 10}% de desconto`
              : "sem desconto aplicado"}
          </div>
        </div>
      </div>
    </article>
  );
}

/**
 * Dropdown inline pra desambiguar FIPE quando a PlacaFIPE retorna múltiplas versões
 * do mesmo veículo. Aparece abaixo do nome/modelo, dispara re-cotação ao escolher.
 * Realça com cor de alerta quando `lowConfidence=true` (recomendado conferir).
 */
function FipeDisambig({ alternatives, lowConfidence, onTrocar, trocando }: {
  alternatives: FipeAlternative[];
  lowConfidence: boolean;
  onTrocar: (codigo: string) => void;
  trocando: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <div className={cn(
      "mt-3 rounded-lg border px-3 py-2",
      lowConfidence ? "border-amber-500/40 bg-amber-500/5" : "border-loog-border bg-white/5",
    )}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        disabled={trocando}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-[11px]">
          {lowConfidence ? "⚠ Confira a versão do veículo — " : ""}
          Não é esse carro? <b className="text-loog-brand2">Trocar versão</b> ({alternatives.length} opções)
        </span>
        <span className="text-xs text-loog-muted">{aberto ? "▲" : "▼"}</span>
      </button>
      {aberto && (
        <ul className="mt-2 space-y-1">
          {alternatives.map((f) => (
            <li key={f.codigo_fipe}>
              <button
                type="button"
                disabled={trocando}
                onClick={() => { onTrocar(f.codigo_fipe); setAberto(false); }}
                className="flex w-full items-start justify-between gap-2 rounded-md border border-loog-border bg-loog-panel/40 px-2 py-1.5 text-left transition hover:border-loog-brand2 hover:bg-loog-brand/10 disabled:opacity-50"
              >
                <span className="min-w-0 flex-1 text-xs">
                  <b>{f.marca}</b> {f.modelo}
                  <span className="ml-1 text-[10px] text-loog-muted">· {f.ano_modelo}{f.combustivel ? ` · ${f.combustivel}` : ""}</span>
                </span>
                <span className="shrink-0 text-[11px] font-bold text-loog-brand2">{f.valor_formatado ?? ""}</span>
              </button>
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
    <div className="card grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
      <button
        type="button"
        onClick={onWhats}
        className="w-full rounded-md bg-[#25D366] px-3 py-2.5 text-sm font-bold text-black hover:brightness-110"
      >
        📲 Enviar no WhatsApp
      </button>
      <button
        type="button"
        onClick={onPdf}
        disabled={pdfLoading}
        className="w-full rounded-md bg-loog-brand px-3 py-2.5 text-sm font-bold text-white hover:brightness-110 disabled:opacity-50"
      >
        {pdfLoading ? "Gerando PDF…" : "📥 Baixar PDF premium LOOG"}
      </button>
      <button
        type="button"
        onClick={onCopy}
        className="w-full rounded-md border border-loog-border px-3 py-2.5 text-xs text-loog-muted hover:bg-white/5 sm:col-span-2 lg:col-span-1"
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
