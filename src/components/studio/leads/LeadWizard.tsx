"use client";

/**
 * LeadWizard — 6 steps: Contratante → Veículo → Cotação → Documentos → Revisão → Confirmar.
 *
 * Fluxo de criação:
 *  Step 1 (Contratante): nome, email, cpf, telefone, cep (busca ViaCEP auto)
 *  Step 2 (Veículo): tipo, placa, FIPE auto, confirma marca/modelo/ano
 *  Step 3 (Cotação): sliders de cobertura/participação/adesão (reaproveita API /api/cotacao)
 *  Step 4 (Documentos): upload CNH, CRLV, comprovante residencia (opcional)
 *  Step 5 (Revisão): preview tudo em cards com link de edição
 *  Step 6 (Confirmar): botao final → POST /api/leads + sync enqueued → redireciona
 */

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/errors/api-fetch";
import { isValidCpf, onlyDigits, type DocTipo, type VehicleTipo } from "@/lib/leads/schemas";

type Step = 1 | 2 | 3 | 4 | 5 | 6;

interface Contratante {
  nome: string; email: string; cpf: string; telefone: string;
  cep: string; endereco: string; numero: string; bairro: string;
  cidade: string; uf: string; complemento: string; data_nasc: string;
  procedencia: string;
}
interface Veiculo {
  tipo: VehicleTipo;
  placa: string;
  marca: string; modelo: string; ano_modelo: number | null;
  fipe_code: string;
  combustivel: string; sigla_combustivel: string;
  mes_referencia_fipe: string;
  valor_fipe_cents: number | null;
  valor_fipe_formatado: string;
  consulta_fipe: number; // 0 FIPE, 2 Zero km
}
interface CotacaoResult {
  plan?: { name?: string; monthlyValueCents?: number; monthlyValueFormatted?: string; joinFeeValueCents?: number; joinFeeFormatted?: string };
  monthlyValueCents?: number;
  coberturasAplicadas?: string[];
  descontoPct?: number;
  adesaoCents?: number;
  [k: string]: unknown;
}
interface DocUpload {
  tipo: DocTipo;
  file: File | null;
  label: string;
  optional: boolean;
}

const EMPTY_CONTRATANTE: Contratante = {
  nome: "", email: "", cpf: "", telefone: "", cep: "", endereco: "",
  numero: "", bairro: "", cidade: "", uf: "", complemento: "", data_nasc: "",
  procedencia: "",
};
const EMPTY_VEICULO: Veiculo = {
  tipo: "carro", placa: "", marca: "", modelo: "", ano_modelo: null,
  fipe_code: "", combustivel: "", sigla_combustivel: "",
  mes_referencia_fipe: "", valor_fipe_cents: null, valor_fipe_formatado: "",
  consulta_fipe: 0,
};

const STEP_LABELS: Record<Step, string> = {
  1: "Contratante", 2: "Veículo", 3: "Cotação", 4: "Documentos", 5: "Revisão", 6: "Confirmar",
};

export function LeadWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [contratante, setContratante] = useState<Contratante>(EMPTY_CONTRATANTE);
  const [veiculo, setVeiculo] = useState<Veiculo>(EMPTY_VEICULO);
  const [cotacao, setCotacao] = useState<CotacaoResult | null>(null);
  const [cotacaoLoading, setCotacaoLoading] = useState(false);
  const [docs, setDocs] = useState<DocUpload[]>([
    { tipo: "cnh", file: null, label: "CNH", optional: false },
    { tipo: "crlv", file: null, label: "CRLV", optional: false },
    { tipo: "comprovante_residencia", file: null, label: "Comprovante de residência", optional: true },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAdvance = useMemo(() => {
    switch (step) {
      case 1:
        return !!contratante.nome.trim() && !!contratante.telefone && onlyDigits(contratante.telefone).length >= 10
               && (!contratante.cpf || isValidCpf(contratante.cpf));
      case 2:
        return !!veiculo.marca && !!veiculo.modelo && !!veiculo.ano_modelo;
      case 3:
        return !!cotacao;
      case 4:
        return docs.filter((d) => !d.optional).every((d) => d.file !== null);
      case 5:
        return true;
      case 6:
        return !submitting;
    }
  }, [step, contratante, veiculo, cotacao, docs, submitting]);

  const next = useCallback(() => {
    if (step < 6) setStep((s) => (s + 1) as Step);
  }, [step]);

  const back = useCallback(() => {
    if (step > 1) setStep((s) => (s - 1) as Step);
  }, [step]);

  // ===== Step 1: busca CEP automática =====
  const buscarCep = useCallback(async (cep: string) => {
    const digits = onlyDigits(cep);
    if (digits.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!r.ok) return;
      const data = await r.json();
      if (data.erro) return;
      setContratante((c) => ({
        ...c,
        cep: digits,
        endereco: data.logradouro || c.endereco,
        bairro: data.bairro || c.bairro,
        cidade: data.localidade || c.cidade,
        uf: data.uf || c.uf,
      }));
    } catch { /* silencioso */ }
  }, []);

  // ===== Step 2: busca FIPE pela placa (opcional) =====
  const buscarPlaca = useCallback(async (placa: string) => {
    const clean = placa.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (clean.length !== 7) return;
    try {
      const r = await apiFetch(`/api/placa/${clean}`);
      if (!r.ok) return;
      const data = await r.json();
      if (!data.ok || !data.veiculo) return;
      const v = data.veiculo;
      const fipe = data.fipe_recomendado ?? (data.fipe?.[0] ?? null);
      setVeiculo((old) => ({
        ...old,
        placa: clean,
        marca: fipe?.marca || v.marca || old.marca,
        modelo: fipe?.modelo || v.modelo || old.modelo,
        ano_modelo: Number(fipe?.ano_modelo || v.ano_modelo || v.ano || old.ano_modelo) || old.ano_modelo,
        fipe_code: fipe?.codigo_fipe || old.fipe_code,
        combustivel: fipe?.combustivel || v.combustivel || old.combustivel,
        mes_referencia_fipe: fipe?.mes_referencia || old.mes_referencia_fipe,
        valor_fipe_cents: fipe?.valor ? Math.round(Number(fipe.valor) * 100) : old.valor_fipe_cents,
        valor_fipe_formatado: fipe?.valor_formatado || old.valor_fipe_formatado,
      }));
    } catch { /* silencioso — consultor pode digitar manual */ }
  }, []);

  // ===== Step 3: dispara cotação =====
  const cotar = useCallback(async () => {
    if (!veiculo.placa) {
      setError("Placa é obrigatória pra cotar. Volta e preenche no Step 2.");
      return;
    }
    setCotacaoLoading(true);
    setError(null);
    try {
      const r = await apiFetch("/api/cotacao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: veiculo.placa,
          tipo_veiculo: veiculo.tipo,
          cliente: { nome: contratante.nome, telefone: contratante.telefone },
          fipeCode: veiculo.fipe_code || undefined,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message ?? `HTTP ${r.status}`);
      setCotacao(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao cotar");
    } finally {
      setCotacaoLoading(false);
    }
  }, [veiculo, contratante]);

  // ===== Step 6: criar lead + upload docs + enfileirar sync =====
  const confirmar = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      // 1. Cria lead
      const createRes = await apiFetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contratante_nome: contratante.nome,
          contratante_email: contratante.email || null,
          contratante_cpf: contratante.cpf || null,
          contratante_telefone: contratante.telefone,
          contratante_data_nasc: contratante.data_nasc || null,
          contratante_cep: contratante.cep || null,
          contratante_endereco: contratante.endereco || null,
          contratante_numero: contratante.numero || null,
          contratante_bairro: contratante.bairro || null,
          contratante_cidade: contratante.cidade || null,
          contratante_uf: contratante.uf || null,
          contratante_complemento: contratante.complemento || null,
          procedencia: contratante.procedencia || null,
        }),
      });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.message ?? `HTTP ${createRes.status}`);
      const leadId: string = createData.lead.id;

      // 2. Adiciona veiculo
      await apiFetch(`/api/leads/${leadId}/vehicles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placa: veiculo.placa || null,
          fipe_code: veiculo.fipe_code || null,
          marca: veiculo.marca,
          modelo: veiculo.modelo,
          ano_modelo: veiculo.ano_modelo,
          combustivel: veiculo.combustivel || null,
          sigla_combustivel: veiculo.sigla_combustivel || null,
          mes_referencia_fipe: veiculo.mes_referencia_fipe || null,
          tipo: veiculo.tipo,
          consulta_fipe: veiculo.consulta_fipe,
          valor_fipe_cents: veiculo.valor_fipe_cents,
          valor_fipe_formatado: veiculo.valor_fipe_formatado || null,
          cotacao_snapshot: cotacao ?? null,
        }),
      });

      // 3. Upload dos documentos (sequencial pra ter progresso visivel)
      for (const d of docs) {
        if (!d.file) continue;
        const form = new FormData();
        form.append("file", d.file);
        form.append("tipo", d.tipo);
        const upRes = await apiFetch(`/api/leads/${leadId}/documents`, { method: "POST", body: form });
        if (!upRes.ok) {
          const upErr = await upRes.json().catch(() => ({}));
          console.warn("Upload falhou:", d.tipo, upErr.message);
        }
      }

      // 4. Redireciona pro detalhe
      router.push(`/studio/leads/${leadId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar lead");
    } finally {
      setSubmitting(false);
    }
  }, [contratante, veiculo, docs, cotacao, router]);

  return (
    <div className="space-y-5">
      <ProgressBar current={step} />

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-loog-border bg-loog-panel p-6">
        {step === 1 && (
          <Step1Contratante
            contratante={contratante}
            setContratante={setContratante}
            onCepBlur={buscarCep}
          />
        )}
        {step === 2 && (
          <Step2Veiculo
            veiculo={veiculo}
            setVeiculo={setVeiculo}
            onPlacaBlur={buscarPlaca}
          />
        )}
        {step === 3 && (
          <Step3Cotacao cotacao={cotacao} loading={cotacaoLoading} onCotar={cotar} />
        )}
        {step === 4 && (
          <Step4Documentos docs={docs} setDocs={setDocs} />
        )}
        {step === 5 && (
          <Step5Revisao
            contratante={contratante}
            veiculo={veiculo}
            cotacao={cotacao}
            docs={docs}
            goto={setStep}
          />
        )}
        {step === 6 && (
          <Step6Confirmar submitting={submitting} onConfirmar={confirmar} />
        )}
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={back}
          disabled={step === 1}
          className="rounded-xl border border-loog-border bg-loog-panel px-4 py-2.5 text-sm font-medium text-white transition hover:border-loog-brand/40 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Voltar
        </button>
        {step < 6 && (
          <button
            type="button"
            onClick={next}
            disabled={!canAdvance}
            className="rounded-xl bg-loog-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-loog-brand/20 transition hover:brightness-110 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Continuar →
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================
// COMPONENTES AUXILIARES
// ============================================================

function ProgressBar({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2">
      {([1, 2, 3, 4, 5, 6] as Step[]).map((s) => {
        const active = s === current;
        const done = s < current;
        return (
          <div key={s} className="flex items-center gap-2 shrink-0">
            <div
              className={
                "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition " +
                (active ? "border-loog-brand bg-loog-brand text-white"
                        : done ? "border-emerald-500 bg-emerald-500/20 text-emerald-200"
                              : "border-loog-border bg-loog-panel text-loog-muted")
              }
            >
              {done ? "✓" : s}
            </div>
            <span className={"text-xs " + (active ? "font-semibold text-white" : "text-loog-muted")}>
              {STEP_LABELS[s]}
            </span>
            {s < 6 && <span className="text-loog-border mx-1">—</span>}
          </div>
        );
      })}
    </div>
  );
}

function Field({
  label, children, hint, required,
}: { label: string; children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-white">
        {label} {required && <span className="text-rose-400">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-loog-muted">{hint}</span>}
    </label>
  );
}

const inputCls = "w-full rounded-xl border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white placeholder:text-loog-muted outline-none focus:border-loog-brand";

function Step1Contratante({
  contratante, setContratante, onCepBlur,
}: {
  contratante: Contratante;
  setContratante: (fn: (c: Contratante) => Contratante) => void;
  onCepBlur: (cep: string) => void;
}) {
  const set = (k: keyof Contratante) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setContratante((c) => ({ ...c, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-bold text-white">1. Dados do Contratante</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nome completo" required>
          <input type="text" value={contratante.nome} onChange={set("nome")} className={inputCls} />
        </Field>
        <Field label="Telefone (com DDD)" required>
          <input type="tel" value={contratante.telefone} onChange={set("telefone")} placeholder="(24) 99999-9999" className={inputCls} />
        </Field>
        <Field label="E-mail">
          <input type="email" value={contratante.email} onChange={set("email")} placeholder="cliente@email.com" className={inputCls} />
        </Field>
        <Field label="CPF" hint={contratante.cpf && !isValidCpf(contratante.cpf) ? "CPF inválido" : undefined}>
          <input type="text" value={contratante.cpf} onChange={set("cpf")} placeholder="000.000.000-00" className={inputCls} />
        </Field>
        <Field label="Data de nascimento">
          <input type="date" value={contratante.data_nasc} onChange={set("data_nasc")} className={inputCls} />
        </Field>
        <Field label="Procedência" hint="De onde veio o lead?">
          <input type="text" value={contratante.procedencia} onChange={set("procedencia")} placeholder="indicação, instagram, consultor…" className={inputCls} />
        </Field>
      </div>
      <h4 className="font-display text-sm font-semibold text-white pt-2">Endereço</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="CEP">
          <input
            type="text"
            value={contratante.cep}
            onChange={set("cep")}
            onBlur={(e) => onCepBlur(e.target.value)}
            placeholder="00000-000"
            className={inputCls}
          />
        </Field>
        <div className="md:col-span-2">
          <Field label="Endereço">
            <input type="text" value={contratante.endereco} onChange={set("endereco")} className={inputCls} />
          </Field>
        </div>
        <Field label="Número">
          <input type="text" value={contratante.numero} onChange={set("numero")} className={inputCls} />
        </Field>
        <Field label="Bairro">
          <input type="text" value={contratante.bairro} onChange={set("bairro")} className={inputCls} />
        </Field>
        <Field label="Complemento">
          <input type="text" value={contratante.complemento} onChange={set("complemento")} className={inputCls} />
        </Field>
        <Field label="Cidade">
          <input type="text" value={contratante.cidade} onChange={set("cidade")} className={inputCls} />
        </Field>
        <Field label="UF">
          <input type="text" value={contratante.uf} onChange={set("uf")} maxLength={2} className={inputCls} />
        </Field>
      </div>
    </div>
  );
}

function Step2Veiculo({
  veiculo, setVeiculo, onPlacaBlur,
}: {
  veiculo: Veiculo;
  setVeiculo: (fn: (v: Veiculo) => Veiculo) => void;
  onPlacaBlur: (p: string) => void;
}) {
  const set = <K extends keyof Veiculo>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setVeiculo((v) => ({ ...v, [k]: e.target.value as Veiculo[K] }));

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-bold text-white">2. Dados do Veículo</h3>
      <Field label="Tipo" required>
        <select value={veiculo.tipo} onChange={set("tipo")} className={inputCls}>
          <option value="carro">Carro</option>
          <option value="moto">Moto</option>
          <option value="utilitario">Utilitário</option>
          <option value="eletrico">Elétrico</option>
          <option value="caminhao">Caminhão</option>
        </select>
      </Field>
      <Field label="Placa" hint="Digite a placa pra puxar FIPE automático (opcional pra zero km)">
        <input
          type="text"
          value={veiculo.placa}
          onChange={set("placa")}
          onBlur={(e) => onPlacaBlur(e.target.value)}
          placeholder="ABC1D23"
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Marca" required>
          <input type="text" value={veiculo.marca} onChange={set("marca")} className={inputCls} />
        </Field>
        <Field label="Modelo" required>
          <input type="text" value={veiculo.modelo} onChange={set("modelo")} className={inputCls} />
        </Field>
        <Field label="Ano modelo" required>
          <input
            type="number"
            value={veiculo.ano_modelo ?? ""}
            onChange={(e) => setVeiculo((v) => ({ ...v, ano_modelo: Number(e.target.value) || null }))}
            className={inputCls}
          />
        </Field>
        <Field label="Valor FIPE">
          <input type="text" value={veiculo.valor_fipe_formatado} onChange={set("valor_fipe_formatado")} className={inputCls} />
        </Field>
      </div>
      {veiculo.fipe_code && (
        <p className="text-xs text-emerald-300">✓ FIPE encontrada: {veiculo.fipe_code} · {veiculo.combustivel}</p>
      )}
    </div>
  );
}

function Step3Cotacao({
  cotacao, loading, onCotar,
}: { cotacao: CotacaoResult | null; loading: boolean; onCotar: () => void }) {
  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-bold text-white">3. Cotação</h3>
      {!cotacao && (
        <div className="text-center py-6">
          <p className="text-sm text-loog-muted mb-4">
            Clica abaixo pra gerar a cotação com base nos dados do veículo. Pode ajustar coberturas/adesão depois no detalhe do lead.
          </p>
          <button
            type="button"
            onClick={onCotar}
            disabled={loading}
            className="rounded-xl bg-loog-brand px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-loog-brand/20 transition hover:brightness-110 disabled:opacity-50"
          >
            {loading ? "Cotando…" : "💰 Gerar cotação"}
          </button>
        </div>
      )}
      {cotacao && (
        <div className="space-y-3">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="text-xs uppercase tracking-wider text-emerald-300 font-bold">Cotação gerada</div>
            <div className="mt-2 text-2xl font-display font-bold text-white">
              {cotacao.plan?.monthlyValueFormatted ?? "—"}
              <span className="text-sm font-normal text-loog-muted ml-2">/mês</span>
            </div>
            {cotacao.plan?.joinFeeFormatted && (
              <div className="mt-1 text-sm text-loog-muted">
                Adesão: <strong className="text-white">{cotacao.plan.joinFeeFormatted}</strong>
              </div>
            )}
            {cotacao.plan?.name && <div className="mt-1 text-xs text-loog-muted">Plano: {cotacao.plan.name}</div>}
          </div>
          <button
            type="button"
            onClick={onCotar}
            className="text-xs text-loog-muted hover:text-white underline"
          >
            Recotar
          </button>
        </div>
      )}
    </div>
  );
}

function Step4Documentos({
  docs, setDocs,
}: { docs: DocUpload[]; setDocs: (fn: (d: DocUpload[]) => DocUpload[]) => void }) {
  function setFile(idx: number, file: File | null) {
    setDocs((old) => old.map((d, i) => (i === idx ? { ...d, file } : d)));
  }

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-bold text-white">4. Documentos</h3>
      <p className="text-sm text-loog-muted">
        Aceita JPG, PNG, WebP, HEIC ou PDF. Máximo 10MB por arquivo.
      </p>
      {docs.map((d, i) => (
        <div key={d.tipo} className="rounded-xl border border-loog-border bg-loog-bg p-4">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              <div className="font-semibold text-white">
                {d.label} {d.optional && <span className="text-xs font-normal text-loog-muted">(opcional)</span>}
              </div>
              {d.file && <div className="text-xs text-emerald-300 mt-1">✓ {d.file.name} · {(d.file.size / 1024).toFixed(0)}KB</div>}
            </div>
            {d.file && (
              <button
                type="button"
                onClick={() => setFile(i, null)}
                className="text-xs text-rose-300 hover:text-rose-200"
              >
                remover
              </button>
            )}
          </div>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
            onChange={(e) => setFile(i, e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-loog-brand/20 file:px-3 file:py-1.5 file:text-white file:font-medium file:cursor-pointer hover:file:bg-loog-brand/30"
          />
        </div>
      ))}
    </div>
  );
}

function Step5Revisao({
  contratante, veiculo, cotacao, docs, goto,
}: {
  contratante: Contratante; veiculo: Veiculo; cotacao: CotacaoResult | null;
  docs: DocUpload[]; goto: (s: Step) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-bold text-white">5. Revisão</h3>
      <ReviewCard title="Contratante" onEdit={() => goto(1)}>
        <div className="text-sm text-white">{contratante.nome}</div>
        <div className="text-xs text-loog-muted mt-1 space-y-0.5">
          <div>📞 {contratante.telefone}</div>
          {contratante.email && <div>✉️ {contratante.email}</div>}
          {contratante.cpf && <div>CPF {contratante.cpf}</div>}
          {contratante.cidade && <div>📍 {contratante.cidade}/{contratante.uf}</div>}
        </div>
      </ReviewCard>

      <ReviewCard title="Veículo" onEdit={() => goto(2)}>
        <div className="text-sm text-white">{veiculo.marca} {veiculo.modelo} {veiculo.ano_modelo}</div>
        <div className="text-xs text-loog-muted mt-1 space-y-0.5">
          {veiculo.placa && <div>Placa {veiculo.placa}</div>}
          <div>Tipo: {veiculo.tipo}</div>
          {veiculo.valor_fipe_formatado && <div>FIPE {veiculo.valor_fipe_formatado}</div>}
        </div>
      </ReviewCard>

      <ReviewCard title="Cotação" onEdit={() => goto(3)}>
        {cotacao ? (
          <div className="text-sm text-white">
            {cotacao.plan?.monthlyValueFormatted ?? "—"}
            <span className="text-xs text-loog-muted">/mês</span>
            {cotacao.plan?.joinFeeFormatted && (
              <div className="text-xs text-loog-muted mt-1">Adesão {cotacao.plan.joinFeeFormatted}</div>
            )}
          </div>
        ) : (
          <div className="text-xs text-rose-300">Sem cotação ainda</div>
        )}
      </ReviewCard>

      <ReviewCard title="Documentos" onEdit={() => goto(4)}>
        <div className="text-xs text-loog-muted space-y-0.5">
          {docs.map((d) => (
            <div key={d.tipo}>
              {d.file ? "✓" : "·"} {d.label}
              {d.file && <span className="ml-1 text-emerald-300">{d.file.name}</span>}
            </div>
          ))}
        </div>
      </ReviewCard>
    </div>
  );
}

function ReviewCard({ title, children, onEdit }: { title: string; children: React.ReactNode; onEdit: () => void }) {
  return (
    <div className="rounded-xl border border-loog-border bg-loog-bg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs uppercase tracking-wider font-bold text-loog-muted">{title}</div>
        <button type="button" onClick={onEdit} className="text-xs text-loog-brand hover:underline">editar</button>
      </div>
      {children}
    </div>
  );
}

function Step6Confirmar({ submitting, onConfirmar }: { submitting: boolean; onConfirmar: () => void }) {
  return (
    <div className="text-center py-6 space-y-4">
      <h3 className="font-display text-lg font-bold text-white">6. Confirmar</h3>
      <p className="text-sm text-loog-muted max-w-md mx-auto">
        Ao confirmar, criamos o lead no LOOG Studio e começamos a sincronizar invisivelmente com o SIVIS em background.
        Você já pode continuar o atendimento — se a sincronização falhar, o lead continua ativo aqui e você vê o status no detalhe.
      </p>
      <button
        type="button"
        onClick={onConfirmar}
        disabled={submitting}
        className="rounded-xl bg-emerald-500 px-8 py-3 text-base font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:brightness-110 disabled:opacity-50"
      >
        {submitting ? "Criando lead…" : "✅ Criar lead + sincronizar SIVIS"}
      </button>
    </div>
  );
}
