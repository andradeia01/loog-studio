"use client";

import { useCallback, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { loadConsultant } from "@/lib/storage";

// ============================================================
// TIPOS
// ============================================================

type Step = "crlv" | "cnh" | "residencia" | "revisao" | "resultado";

interface CRLVData {
  placa: string | null; chassi: string | null; renavam: string | null;
  marca: string | null; modelo: string | null; ano_fabricacao: string | null;
  ano_modelo: string | null; cor: string | null; combustivel: string | null;
  municipio: string | null; uf: string | null;
  proprietario: string | null; cpf_cnpj: string | null;
}
interface CNHData {
  nome: string | null; cpf: string | null; data_nascimento: string | null;
  categoria: string | null; validade: string | null;
}
interface ResidenciaData {
  titular: string | null; endereco: string | null; bairro: string | null;
  cidade: string | null; uf: string | null; cep: string | null;
  tipo_conta: string | null;
}

interface DadosConsolidados {
  // veículo
  placa: string;
  // cliente
  nome: string;
  telefone: string;
  cpf: string;
  dataNasc: string;
  // endereço
  cep: string;
  endereco: string;
  cidade: string;
  uf: string;
}

interface CotacaoRes {
  quoteId: string;
  plan?: {
    name: string;
    monthlyValueFormatted?: string;
    monthlyValueCents?: number;
    joinFeeFormatted?: string;
    joinFeeValueCents?: number;
    defaultCoverages?: Array<{ id: string; name: string; valueFormatted: string }>;
  };
  vehicle?: { plate: string; brand: string; model: string; modelYear: number; fipeFormatted: string; vehicleCategory: string };
  pdfUrl?: string; portalUrl?: string;
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

export function CotacaoCompleta() {
  const [step, setStep] = useState<Step>("crlv");
  const [crlv, setCrlv] = useState<CRLVData | null>(null);
  const [cnh, setCnh] = useState<CNHData | null>(null);
  const [residencia, setResidencia] = useState<ResidenciaData | null>(null);
  const [dados, setDados] = useState<DadosConsolidados | null>(null);
  const [telefone, setTelefone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<CotacaoRes | null>(null);

  function reset() {
    setStep("crlv"); setCrlv(null); setCnh(null); setResidencia(null);
    setDados(null); setTelefone(""); setResultado(null); setError(null);
  }

  // após CRLV → vai pra CNH
  function onCrlvOk(data: CRLVData) {
    setCrlv(data);
    setStep("cnh");
  }
  function onCnhOk(data: CNHData) {
    setCnh(data);
    setStep("residencia");
  }
  function onResidenciaOk(data: ResidenciaData) {
    setResidencia(data);
    // consolida tudo pro form de revisão
    setDados({
      placa: crlv?.placa ?? "",
      nome: cnh?.nome ?? crlv?.proprietario ?? "",
      telefone: "",
      cpf: cnh?.cpf ?? crlv?.cpf_cnpj ?? "",
      dataNasc: cnh?.data_nascimento ?? "",
      cep: data.cep ?? "",
      endereco: data.endereco ?? "",
      cidade: data.cidade ?? crlv?.municipio ?? "",
      uf: data.uf ?? crlv?.uf ?? "",
    });
    setStep("revisao");
  }

  async function enviar() {
    if (!dados) return;
    if (!telefone || telefone.replace(/[^0-9]/g, "").length < 10) {
      setError("Telefone é obrigatório (com DDD).");
      return;
    }
    setLoading(true); setError(null);
    try {
      const res = await fetch("/api/cotacao/completa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: dados.placa,
          cliente: {
            nome: dados.nome,
            telefone,
            cpf: dados.cpf || undefined,
            data_nascimento: dados.dataNasc || undefined,
            cep: dados.cep || undefined,
            endereco: dados.endereco || undefined,
            cidade: dados.cidade || undefined,
            uf: dados.uf || undefined,
          },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? `Falha (${res.status})`);
      setResultado(body as CotacaoRes);
      setStep("resultado");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar.");
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <Progresso step={step} />

      <AnimatePresence mode="wait">
        {step === "crlv" && (
          <StepUpload
            key="crlv"
            tipo="crlv"
            titulo="1. CRLV do veículo"
            subtitulo="Documento do carro — aquele papel A4 ou digital no app Carteira Digital de Trânsito."
            exemplo="Dica: fotografe o CRLV inteiro, bem iluminado e sem reflexo. A gente lê placa, chassi, renavam, cor automaticamente."
            onOk={(d) => onCrlvOk(d as CRLVData)}
            onError={setError}
          />
        )}
        {step === "cnh" && (
          <StepUpload
            key="cnh"
            tipo="cnh"
            titulo="2. CNH do condutor principal"
            subtitulo="Pode ser a física ou a digital (CNH-e)."
            exemplo="Fotografe o verso ou o PDF da CNH. A gente extrai nome, CPF e data de nascimento."
            onOk={(d) => onCnhOk(d as CNHData)}
            onError={setError}
            onVoltar={() => setStep("crlv")}
          />
        )}
        {step === "residencia" && (
          <StepUpload
            key="res"
            tipo="residencia"
            titulo="3. Comprovante de residência"
            subtitulo="Conta de luz, água, internet, telefone ou gás nos últimos 90 dias."
            exemplo="Precisamos do endereço completo + CEP. Pode ser PDF ou foto."
            onOk={(d) => onResidenciaOk(d as ResidenciaData)}
            onError={setError}
            onVoltar={() => setStep("cnh")}
          />
        )}
        {step === "revisao" && dados && (
          <StepRevisao
            key="rev"
            dados={dados}
            onChange={setDados}
            telefone={telefone}
            setTelefone={setTelefone}
            onVoltar={() => setStep("residencia")}
            onEnviar={enviar}
            loading={loading}
            error={error}
          />
        )}
        {step === "resultado" && resultado && (
          <StepResultado key="res" resultado={resultado} telefone={telefone} onNova={reset} />
        )}
      </AnimatePresence>

      {error && step !== "revisao" && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}

// ============================================================
// PROGRESSO
// ============================================================

function Progresso({ step }: { step: Step }) {
  const steps: Array<{ key: Step; label: string; icon: string }> = [
    { key: "crlv", label: "CRLV", icon: "🚗" },
    { key: "cnh", label: "CNH", icon: "🪪" },
    { key: "residencia", label: "Endereço", icon: "🏠" },
    { key: "revisao", label: "Revisão", icon: "✏️" },
    { key: "resultado", label: "Pronto", icon: "✅" },
  ];
  const activeIdx = steps.findIndex((s) => s.key === step);

  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex flex-1 items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col items-center">
            <div className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm transition",
              i < activeIdx ? "bg-emerald-500/80 text-black" : i === activeIdx ? "bg-loog-brand text-white shadow-glow" : "bg-white/5 text-loog-muted",
            )}>
              {i < activeIdx ? "✓" : s.icon}
            </div>
            <span className={cn("mt-1 truncate text-[10px] font-semibold uppercase tracking-widest", i <= activeIdx ? "text-white" : "text-loog-muted")}>
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn("h-0.5 flex-1 rounded-full transition-colors", i < activeIdx ? "bg-emerald-500/60" : "bg-white/10")} />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================
// STEP: UPLOAD (CRLV / CNH / RESIDÊNCIA)
// ============================================================

function StepUpload({ tipo, titulo, subtitulo, exemplo, onOk, onError, onVoltar }: {
  tipo: "crlv" | "cnh" | "residencia";
  titulo: string; subtitulo: string; exemplo: string;
  onOk: (data: unknown) => void; onError: (e: string | null) => void;
  onVoltar?: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [dados, setDados] = useState<Record<string, unknown> | null>(null);
  const [ocrFalhou, setOcrFalhou] = useState(false);

  async function handleFile(file: File) {
    const isImg = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImg && !isPdf) { onError("Envie uma imagem (JPG/PNG) ou PDF."); return; }
    if (file.size > 10 * 1024 * 1024) { onError("Arquivo muito grande (máx 10MB)."); return; }
    onError(null);
    setUploading(true);
    setDados(null);
    setOcrFalhou(false);
    try {
      // Imagem: comprime; PDF: envia como está
      const dataUrl = isImg
        ? await lerImagemComprimida(file, 2000, 0.85)
        : await lerArquivoDataUrl(file);
      setPreview(isImg ? dataUrl : null);
      setFileName(file.name);

      const res = await fetch("/api/ocr/documento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, imageDataUrl: dataUrl }),
      });
      const body = await res.json();
      if (!res.ok) {
        // Fallback: libera edição manual mesmo com OCR offline
        if (body.acao === "manual") {
          setOcrFalhou(true);
          setDados({}); // forma vazia pra editar
          onError(body.message);
          return;
        }
        throw new Error(body.message ?? "Falha ao ler o documento.");
      }
      setDados(body.dados ?? {});
    } catch (err) {
      onError(err instanceof Error ? err.message : "Erro ao processar imagem.");
    } finally { setUploading(false); }
  }

  function confirmar() {
    if (!dados) return;
    onOk(dados);
  }

  const camposLidos = dados ? Object.entries(dados).filter(([, v]) => v != null && v !== "") : [];

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
      className="card p-5 sm:p-6"
    >
      <h2 className="font-display text-xl font-bold">{titulo}</h2>
      <p className="mt-1 text-sm text-loog-muted">{subtitulo}</p>
      <p className="mt-2 text-xs text-loog-muted/80">💡 {exemplo}</p>

      {!preview && !fileName && !dados ? (
        <DropZone onFile={handleFile} />
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_280px]">
          <div>
            {uploading && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-loog-brand/10 px-3 py-2 text-xs text-loog-brand">
                <div className="h-3 w-3 animate-spin rounded-full border border-loog-brand border-t-transparent" />
                Lendo documento com IA…
              </div>
            )}
            {!uploading && ocrFalhou && (
              <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                ⚠ OCR indisponível. Preencha os campos manualmente abaixo — a cotação continua funcionando.
              </div>
            )}
            {!uploading && dados && (
              <>
                {!ocrFalhou && (
                  <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-emerald-300">
                    ✓ Lidos {camposLidos.length} campos
                  </div>
                )}
                <ul className="mb-4 max-h-64 space-y-1 overflow-y-auto rounded-xl border border-loog-border bg-black/30 p-3 text-xs">
                  {camposLidos.length === 0 && !ocrFalhou && <li className="text-loog-muted">Nenhum campo reconhecido — tente outra foto.</li>}
                  {camposLidos.length === 0 && ocrFalhou && <li className="text-loog-muted italic">Pule esta etapa — você vai preencher na revisão.</li>}
                  {camposLidos.map(([k, v]) => (
                    <li key={k} className="flex items-start gap-2 py-1">
                      <span className="w-24 shrink-0 text-loog-muted">{k.replace(/_/g, " ")}:</span>
                      <span className="font-mono font-semibold text-white">{String(v)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { setPreview(null); setFileName(""); setDados(null); setOcrFalhou(false); }} className="rounded-md border border-loog-border px-3 py-2 text-xs text-loog-muted hover:bg-white/5">
                    Trocar arquivo
                  </button>
                  <button type="button" onClick={confirmar} className="btn-primary !py-2 !text-xs">
                    Continuar →
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="relative flex min-h-[180px] items-center justify-center overflow-hidden rounded-xl border border-loog-border bg-black/50">
            {preview ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={preview} alt="prévia" className="h-full w-full object-contain" />
            ) : (
              <div className="p-6 text-center text-xs text-loog-muted">
                <div className="mb-2 text-4xl">📄</div>
                {fileName}
                <div className="mt-1 text-[10px]">PDF enviado</div>
              </div>
            )}
          </div>
        </div>
      )}

      {onVoltar && (
        <button type="button" onClick={onVoltar} className="mt-4 text-xs text-loog-muted hover:text-white">
          ← Voltar
        </button>
      )}
    </motion.div>
  );
}

function DropZone({ onFile }: { onFile: (file: File) => void }) {
  const [dragging, setDragging] = useState(false);

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault(); setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={cn(
        "mt-5 flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition",
        dragging ? "border-loog-brand bg-loog-brand/5" : "border-loog-border hover:border-loog-brand/50 hover:bg-white/[0.02]",
      )}
    >
      <span className="text-4xl">📸</span>
      <span className="text-sm font-semibold">Toque pra fotografar ou escolher arquivo</span>
      <span className="text-[11px] text-loog-muted">JPG · PNG · PDF até 10 MB</span>
      <input
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}

// ============================================================
// STEP: REVISÃO (campos editáveis)
// ============================================================

function StepRevisao({ dados, onChange, telefone, setTelefone, onVoltar, onEnviar, loading, error }: {
  dados: DadosConsolidados; onChange: (d: DadosConsolidados) => void;
  telefone: string; setTelefone: (t: string) => void;
  onVoltar: () => void; onEnviar: () => void;
  loading: boolean; error: string | null;
}) {
  const upd = (k: keyof DadosConsolidados) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...dados, [k]: e.target.value });

  // precarrega telefone do consultor se vazio (ex: pra testar)
  const stored = useMemo(() => loadConsultant(), []);
  // apenas visual, não setamos no state

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
      transition={{ duration: 0.2 }}
      className="card space-y-5 p-5 sm:p-6"
    >
      <div>
        <h2 className="font-display text-xl font-bold">4. Confirme os dados</h2>
        <p className="mt-1 text-sm text-loog-muted">Confira e corrija se algo veio errado do OCR. Preencha o telefone do cliente.</p>
      </div>

      <Section titulo="Veículo">
        <Field label="Placa" value={dados.placa} onChange={upd("placa")} mono required />
      </Section>

      <Section titulo="Cliente">
        <Field label="Nome completo *" value={dados.nome} onChange={upd("nome")} required />
        <Field label="CPF" value={dados.cpf} onChange={upd("cpf")} mono placeholder="apenas números" />
        <Field label="Data de nascimento" value={dados.dataNasc} onChange={upd("dataNasc")} placeholder="AAAA-MM-DD" />
        <div>
          <label className="label mb-1.5">Telefone com DDD *</label>
          <input type="tel" className="input" value={telefone} onChange={(e) => setTelefone(e.target.value)} required placeholder="(11) 99999-9999" />
          {!telefone && stored?.phone && (
            <button type="button" onClick={() => setTelefone(stored.phone ?? "")} className="mt-1 text-[10px] text-loog-brand hover:underline">
              Usar meu telefone ({stored.phone})
            </button>
          )}
        </div>
      </Section>

      <Section titulo="Endereço">
        <Field label="CEP" value={dados.cep} onChange={upd("cep")} mono />
        <Field label="Endereço" value={dados.endereco} onChange={upd("endereco")} />
        <div className="grid grid-cols-[1fr_80px] gap-3">
          <Field label="Cidade" value={dados.cidade} onChange={upd("cidade")} />
          <Field label="UF" value={dados.uf} onChange={upd("uf")} mono />
        </div>
      </Section>

      {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}

      <div className="flex items-center gap-2">
        <button type="button" onClick={onVoltar} className="rounded-md border border-loog-border px-3 py-2 text-xs text-loog-muted hover:bg-white/5" disabled={loading}>
          ← Voltar
        </button>
        <button type="button" onClick={onEnviar} disabled={loading} className="btn-primary flex-1 !py-2.5">
          {loading ? "Enviando ao sistema LOOG…" : "📋 Gerar cotação oficial"}
        </button>
      </div>
    </motion.div>
  );
}

function Section({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-loog-brand">{titulo}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, mono, required, placeholder }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  mono?: boolean; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="label mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={onChange}
        className={cn("input", mono && "font-mono")}
        required={required}
        placeholder={placeholder}
      />
    </div>
  );
}

// ============================================================
// STEP: RESULTADO
// ============================================================

function StepResultado({ resultado, telefone, onNova }: {
  resultado: CotacaoRes; telefone: string; onNova: () => void;
}) {
  const r = resultado;
  const mensalCents = r.plan?.monthlyValueCents ?? 0;
  const adesaoCents = r.plan?.joinFeeValueCents ?? 0;
  const inv = (mensalCents + adesaoCents) / 100;
  const invFmt = inv.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const telLimpo = telefone.replace(/[^0-9]/g, "");
  const telFinal = telLimpo.startsWith("55") ? telLimpo : (telLimpo.length === 11 ? "55" + telLimpo : telLimpo);
  const msg = r.pdfUrl ? `Olá! Segue sua cotação LOOG oficial: ${r.pdfUrl}` : "Olá! Sua cotação LOOG está pronta.";
  const waUrl = `https://wa.me/${telFinal}?text=${encodeURIComponent(msg)}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="space-y-4"
    >
      <article className="card overflow-hidden border border-emerald-500/30">
        <header className="flex items-center gap-3 border-b border-emerald-500/20 bg-emerald-500/10 px-5 py-3">
          <span className="text-2xl">✅</span>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-300">Cotação completa registrada</h3>
            <p className="text-[11px] text-loog-muted">Nº {r.quoteId} · pasta SDR · dados completos no SIVIS</p>
          </div>
        </header>

        {r.vehicle && (
          <div className="border-b border-loog-border/60 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">Veículo</div>
                <div className="font-display text-base font-bold">{r.vehicle.brand}</div>
                <div className="text-sm">{r.vehicle.model}</div>
                <div className="text-xs text-loog-muted">Ano {r.vehicle.modelYear} · Placa <b className="text-white tracking-widest">{r.vehicle.plate}</b></div>
              </div>
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">Valor FIPE</div>
                <div className="font-display text-xl font-bold text-loog-brand">{r.vehicle.fipeFormatted}</div>
              </div>
            </div>
          </div>
        )}

        {r.plan && (
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            {inv > 0 && (
              <div className="rounded-xl bg-loog-brand p-4 text-white shadow-glow">
                <div className="text-[10px] font-semibold uppercase tracking-widest text-white/80">Investimento Inicial</div>
                <div className="mt-1 font-display text-3xl font-extrabold">{invFmt}</div>
                <div className="mt-1 text-[11px] text-white/80">
                  1º boleto · {r.plan.monthlyValueFormatted} mens. + {r.plan.joinFeeFormatted} adesão
                </div>
              </div>
            )}
            <div className="rounded-xl border-2 border-loog-brand bg-white/5 p-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-brand">Valor Total do Plano</div>
              <div className="mt-1 font-display text-3xl font-extrabold text-loog-brand">{r.plan.monthlyValueFormatted}</div>
              <div className="mt-1 text-[11px] text-loog-muted">mensalidade recorrente</div>
            </div>
          </div>
        )}

        <footer className="flex flex-wrap gap-2 border-t border-loog-border/60 px-5 py-3">
          {r.pdfUrl && (
            <a href={r.pdfUrl} target="_blank" rel="noopener noreferrer" className="rounded-md bg-loog-brand px-3 py-2 text-xs font-bold text-white hover:brightness-110">
              📥 Baixar PDF oficial
            </a>
          )}
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className="rounded-md bg-[#25D366] px-3 py-2 text-xs font-bold text-black hover:brightness-110">
            📲 Enviar no WhatsApp
          </a>
          {r.portalUrl && (
            <a href={r.portalUrl} target="_blank" rel="noopener noreferrer" className="ml-auto rounded-md border border-loog-border px-3 py-2 text-xs text-loog-muted hover:bg-white/5">
              Ver no SIVIS ↗
            </a>
          )}
        </footer>
      </article>

      <button type="button" onClick={onNova} className="text-xs text-loog-muted hover:text-white">
        ← Nova cotação completa
      </button>
    </motion.div>
  );
}

// ============================================================
// HELPERS
// ============================================================

/** Lê arquivo como data URL (base64) sem alterar — usado pra PDFs. */
async function lerArquivoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("falha ao ler arquivo"));
    r.readAsDataURL(file);
  });
}

/** Lê imagem e comprime pra reduzir tamanho antes de enviar OCR. */
async function lerImagemComprimida(file: File, maxW: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = img.width > maxW ? maxW / img.width : 1;
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("sem canvas"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => reject(new Error("imagem inválida"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
}
