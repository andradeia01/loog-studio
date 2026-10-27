"use client";

/**
 * LeadWizard — 6 steps OCR-FIRST: Documentos → Contratante → Veículo → Cotação → Revisão → Confirmar.
 *
 * O consultor NUNCA digita dados manualmente. Upa CNH + CRLV + comprovante,
 * o OCR (Claude Vision com fallback OpenAI) extrai e auto-preenche todos os
 * campos. Os steps 2 e 3 viram REVISÃO do que o OCR leu, não entrada bruta.
 *
 * Fluxo:
 *  Step 1 (Documentos+OCR): upload CNH→nome/cpf/data_nasc; CRLV→placa/marca/modelo/ano; Residência→cep/endereço
 *  Step 2 (Contratante — revisa+completa): dados vieram do OCR; preenche telefone/email/procedência manualmente
 *  Step 3 (Veículo — revisa+FIPE): dados vieram do OCR; enriquece com /api/placa pra FIPE
 *  Step 4 (Cotação): chama /api/cotacao com placa+tipo
 *  Step 5 (Revisão): preview tudo em cards com link de edição
 *  Step 6 (Confirmar): POST /api/leads + /vehicles + upload dos docs ao Storage + sync enqueued
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
  /** mapeia tipo do doc pro tipo que /api/ocr/documento aceita */
  ocrTipo?: "cnh" | "crlv" | "residencia";
  /** status do OCR: idle = nada; lendo = em curso; ok = dados extraídos; erro = falhou */
  ocrStatus?: "idle" | "lendo" | "ok" | "erro";
  /** JSON cru retornado pelo OCR (pra badge "extraído de ...") */
  ocrDados?: Record<string, unknown> | null;
  /** mensagem de erro (se ocrStatus = "erro") */
  ocrErro?: string | null;
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
  1: "📸 Documentos", 2: "👤 Contratante", 3: "🚗 Veículo", 4: "💰 Cotação", 5: "✅ Revisão", 6: "🎯 Confirmar",
};

export function LeadWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [contratante, setContratante] = useState<Contratante>(EMPTY_CONTRATANTE);
  const [veiculo, setVeiculo] = useState<Veiculo>(EMPTY_VEICULO);
  const [cotacao, setCotacao] = useState<CotacaoResult | null>(null);
  const [cotacaoLoading, setCotacaoLoading] = useState(false);
  const [docs, setDocs] = useState<DocUpload[]>([
    { tipo: "cnh", file: null, label: "CNH (frente)", optional: false, ocrTipo: "cnh", ocrStatus: "idle", ocrDados: null, ocrErro: null },
    { tipo: "crlv", file: null, label: "CRLV", optional: false, ocrTipo: "crlv", ocrStatus: "idle", ocrDados: null, ocrErro: null },
    { tipo: "comprovante_residencia", file: null, label: "Comprovante de residência", optional: true, ocrTipo: "residencia", ocrStatus: "idle", ocrDados: null, ocrErro: null },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAdvance = useMemo(() => {
    switch (step) {
      case 1:
        // precisa ter upado CNH + CRLV (obrigatórios); residência é opcional
        return docs.filter((d) => !d.optional).every((d) => d.file !== null && d.ocrStatus !== "lendo");
      case 2:
        // contratante: nome + telefone obrigatórios (OCR já preencheu nome; só precisa adicionar telefone)
        return !!contratante.nome.trim() && !!contratante.telefone && onlyDigits(contratante.telefone).length >= 10
               && (!contratante.cpf || isValidCpf(contratante.cpf));
      case 3:
        return !!veiculo.marca && !!veiculo.modelo && !!veiculo.ano_modelo;
      case 4:
        return !!cotacao;
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

  // ===== Step 1: processa arquivo com OCR + autofill dos estados =====
  const processarComOcr = useCallback(async (indice: number, file: File) => {
    const doc = docs[indice];
    if (!doc?.ocrTipo) return;

    // marca lendo
    setDocs((prev) => prev.map((d, i) => i === indice ? { ...d, file, ocrStatus: "lendo", ocrErro: null } : d));

    try {
      // converte pra data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ""));
        r.onerror = () => reject(new Error("falha ao ler arquivo"));
        r.readAsDataURL(file);
      });

      const res = await apiFetch("/api/ocr/documento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: doc.ocrTipo, imageDataUrl: dataUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? `OCR falhou (HTTP ${res.status})`);

      const dados = data.dados as Record<string, unknown>;

      // AUTOFILL baseado no tipo
      if (doc.ocrTipo === "cnh") {
        setContratante((c) => ({
          ...c,
          nome: (dados.nome as string) || c.nome,
          cpf: (dados.cpf as string) || c.cpf,
          data_nasc: (dados.data_nascimento as string) || c.data_nasc,
        }));
      } else if (doc.ocrTipo === "crlv") {
        const placa = ((dados.placa as string) || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
        setVeiculo((v) => ({
          ...v,
          placa: placa || v.placa,
          marca: (dados.marca as string) || v.marca,
          modelo: (dados.modelo as string) || v.modelo,
          ano_modelo: Number(dados.ano_modelo || dados.ano_fabricacao || v.ano_modelo) || v.ano_modelo,
          combustivel: (dados.combustivel as string) || v.combustivel,
        }));
        // dispara FIPE em segundo plano se tem placa válida
        if (placa.length === 7) {
          void buscarPlaca(placa);
        }
      } else if (doc.ocrTipo === "residencia") {
        const cep = ((dados.cep as string) || "").replace(/\D/g, "");
        setContratante((c) => ({
          ...c,
          cep: cep || c.cep,
          endereco: (dados.endereco as string) || c.endereco,
          bairro: (dados.bairro as string) || c.bairro,
          cidade: (dados.cidade as string) || c.cidade,
          uf: (dados.uf as string) || c.uf,
        }));
      }

      setDocs((prev) => prev.map((d, i) => i === indice ? { ...d, ocrStatus: "ok", ocrDados: dados, ocrErro: null } : d));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OCR falhou";
      setDocs((prev) => prev.map((d, i) => i === indice ? { ...d, ocrStatus: "erro", ocrErro: msg } : d));
    }
  }, [docs, buscarPlaca]);

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
          <Step1Documentos docs={docs} onFileSelect={processarComOcr} />
        )}
        {step === 2 && (
          <Step2Contratante
            contratante={contratante}
            setContratante={setContratante}
            onCepBlur={buscarCep}
            cnhOk={docs.find((d) => d.ocrTipo === "cnh")?.ocrStatus === "ok"}
            residenciaOk={docs.find((d) => d.ocrTipo === "residencia")?.ocrStatus === "ok"}
          />
        )}
        {step === 3 && (
          <Step3Veiculo
            veiculo={veiculo}
            setVeiculo={setVeiculo}
            onPlacaBlur={buscarPlaca}
            crlvOk={docs.find((d) => d.ocrTipo === "crlv")?.ocrStatus === "ok"}
          />
        )}
        {step === 4 && (
          <Step4Cotacao cotacao={cotacao} loading={cotacaoLoading} onCotar={cotar} />
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
}: { label: React.ReactNode; children: React.ReactNode; hint?: string; required?: boolean }) {
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

function Step2Contratante({
  contratante, setContratante, onCepBlur, cnhOk, residenciaOk,
}: {
  contratante: Contratante;
  setContratante: (fn: (c: Contratante) => Contratante) => void;
  onCepBlur: (cep: string) => void;
  cnhOk?: boolean;
  residenciaOk?: boolean;
}) {
  const set = (k: keyof Contratante) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setContratante((c) => ({ ...c, [k]: e.target.value }));

  const badgeCnh = cnhOk ? <span className="ml-1 text-[10px] font-normal text-emerald-300">📷 CNH</span> : null;
  const badgeRes = residenciaOk ? <span className="ml-1 text-[10px] font-normal text-emerald-300">📷 Residência</span> : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display text-lg font-bold text-white">👤 Dados do Contratante</h3>
        {(cnhOk || residenciaOk) && (
          <span className="text-xs text-emerald-300">✨ Pré-preenchido pelo OCR — revise e complete</span>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label={<>Nome completo{badgeCnh}</>} required>
          <input type="text" value={contratante.nome} onChange={set("nome")} className={inputCls} />
        </Field>
        <Field label="Telefone (com DDD)" required hint="Preencha manualmente (não vem do OCR)">
          <input type="tel" value={contratante.telefone} onChange={set("telefone")} placeholder="(24) 99999-9999" className={inputCls} />
        </Field>
        <Field label="E-mail" hint="Preencha manualmente">
          <input type="email" value={contratante.email} onChange={set("email")} placeholder="cliente@email.com" className={inputCls} />
        </Field>
        <Field label={<>CPF{badgeCnh}</>} hint={contratante.cpf && !isValidCpf(contratante.cpf) ? "CPF inválido" : undefined}>
          <input type="text" value={contratante.cpf} onChange={set("cpf")} placeholder="000.000.000-00" className={inputCls} />
        </Field>
        <Field label={<>Data de nascimento{badgeCnh}</>}>
          <input type="date" value={contratante.data_nasc} onChange={set("data_nasc")} className={inputCls} />
        </Field>
        <Field label="Procedência" hint="De onde veio o lead?">
          <input type="text" value={contratante.procedencia} onChange={set("procedencia")} placeholder="indicação, instagram, consultor…" className={inputCls} />
        </Field>
      </div>
      <h4 className="font-display text-sm font-semibold text-white pt-2">Endereço {badgeRes}</h4>
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

function Step3Veiculo({
  veiculo, setVeiculo, onPlacaBlur, crlvOk,
}: {
  veiculo: Veiculo;
  setVeiculo: (fn: (v: Veiculo) => Veiculo) => void;
  onPlacaBlur: (p: string) => void;
  crlvOk?: boolean;
}) {
  const set = <K extends keyof Veiculo>(k: K) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setVeiculo((v) => ({ ...v, [k]: e.target.value as Veiculo[K] }));

  const badgeCrlv = crlvOk ? <span className="ml-1 text-[10px] font-normal text-emerald-300">📷 CRLV</span> : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display text-lg font-bold text-white">🚗 Dados do Veículo</h3>
        {crlvOk && <span className="text-xs text-emerald-300">✨ Pré-preenchido pelo CRLV — revise</span>}
      </div>
      <Field label="Tipo" required>
        <select value={veiculo.tipo} onChange={set("tipo")} className={inputCls}>
          <option value="carro">Carro</option>
          <option value="moto">Moto</option>
          <option value="utilitario">Utilitário</option>
          <option value="eletrico">Elétrico</option>
          <option value="caminhao">Caminhão</option>
        </select>
      </Field>
      <Field label={<>Placa{badgeCrlv}</>} hint="Veio do CRLV; se vazia, digite pra puxar FIPE">
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
        <Field label={<>Marca{badgeCrlv}</>} required>
          <input type="text" value={veiculo.marca} onChange={set("marca")} className={inputCls} />
        </Field>
        <Field label={<>Modelo{badgeCrlv}</>} required>
          <input type="text" value={veiculo.modelo} onChange={set("modelo")} className={inputCls} />
        </Field>
        <Field label={<>Ano modelo{badgeCrlv}</>} required>
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

function Step4Cotacao({
  cotacao, loading, onCotar,
}: { cotacao: CotacaoResult | null; loading: boolean; onCotar: () => void }) {
  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-bold text-white">💰 Cotação</h3>
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

function Step1Documentos({
  docs, onFileSelect,
}: { docs: DocUpload[]; onFileSelect: (idx: number, file: File) => void | Promise<void> }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display text-lg font-bold text-white">📸 Documentos (OCR automático)</h3>
      </div>
      <p className="text-sm text-loog-muted">
        Fotografa ou upa <strong>CNH + CRLV</strong> (obrigatórios) e <strong>comprovante de residência</strong> (opcional).
        Nossa IA extrai os dados automaticamente — nos próximos steps você só revisa.
        Aceita JPG, PNG, WebP, HEIC ou PDF (até 10MB).
      </p>

      <div className="grid grid-cols-1 gap-3">
        {docs.map((d, i) => (
          <div
            key={d.tipo}
            className={
              "rounded-xl border p-4 transition " +
              (d.ocrStatus === "ok" ? "border-emerald-500/40 bg-emerald-500/5"
               : d.ocrStatus === "erro" ? "border-rose-500/40 bg-rose-500/5"
               : d.ocrStatus === "lendo" ? "border-sky-500/40 bg-sky-500/5"
               : "border-loog-border bg-loog-bg")
            }
          >
            <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-white flex items-center gap-2">
                  {d.ocrTipo === "cnh" && "🪪"}
                  {d.ocrTipo === "crlv" && "📄"}
                  {d.ocrTipo === "residencia" && "🏠"}
                  {d.label}
                  {d.optional && <span className="text-xs font-normal text-loog-muted">(opcional)</span>}
                </div>
                {d.file && (
                  <div className="text-xs text-loog-muted mt-1 truncate">
                    {d.file.name} · {(d.file.size / 1024).toFixed(0)}KB
                  </div>
                )}
              </div>
              <StatusBadge status={d.ocrStatus} />
            </div>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFileSelect(i, f);
              }}
              disabled={d.ocrStatus === "lendo"}
              className="block w-full text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-loog-brand/20 file:px-3 file:py-1.5 file:text-white file:font-medium file:cursor-pointer hover:file:bg-loog-brand/30 disabled:opacity-50"
            />

            {d.ocrStatus === "lendo" && (
              <div className="text-xs text-sky-300 mt-2 flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-sky-400 animate-pulse" />
                Lendo documento com IA… (até 20s)
              </div>
            )}
            {d.ocrStatus === "ok" && d.ocrDados && (
              <div className="mt-3 rounded-lg bg-loog-bg/60 p-2.5 text-xs">
                <div className="text-emerald-300 font-medium mb-1">✓ Extraído:</div>
                <div className="text-loog-muted space-y-0.5">
                  {Object.entries(d.ocrDados)
                    .filter(([, v]) => v != null && v !== "")
                    .slice(0, 5)
                    .map(([k, v]) => (
                      <div key={k}><span className="text-white/80">{k}:</span> {String(v)}</div>
                    ))}
                  {Object.keys(d.ocrDados).length > 5 && (
                    <div className="text-loog-muted">… +{Object.keys(d.ocrDados).length - 5} campos</div>
                  )}
                </div>
              </div>
            )}
            {d.ocrStatus === "erro" && (
              <div className="text-xs text-rose-300 mt-2">
                ❌ {d.ocrErro ?? "OCR falhou"}. Tenta uma foto mais nítida ou upa outro arquivo.
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="text-xs text-loog-muted">
        💡 Dica: tira a foto com boa luz, documento inteiro visível, sem flash direto no plástico.
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status?: "idle" | "lendo" | "ok" | "erro" }) {
  if (status === "ok") return <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">🟢 OK</span>;
  if (status === "lendo") return <span className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-200">🔵 Lendo…</span>;
  if (status === "erro") return <span className="rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-200">🔴 Erro</span>;
  return <span className="rounded-full border border-loog-border bg-loog-bg px-2 py-0.5 text-[10px] font-semibold text-loog-muted">Aguardando</span>;
}

function Step5Revisao({
  contratante, veiculo, cotacao, docs, goto,
}: {
  contratante: Contratante; veiculo: Veiculo; cotacao: CotacaoResult | null;
  docs: DocUpload[]; goto: (s: Step) => void;
}) {
  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-bold text-white">✅ Revisão</h3>
      <ReviewCard title="Contratante" onEdit={() => goto(2)}>
        <div className="text-sm text-white">{contratante.nome}</div>
        <div className="text-xs text-loog-muted mt-1 space-y-0.5">
          <div>📞 {contratante.telefone}</div>
          {contratante.email && <div>✉️ {contratante.email}</div>}
          {contratante.cpf && <div>CPF {contratante.cpf}</div>}
          {contratante.cidade && <div>📍 {contratante.cidade}/{contratante.uf}</div>}
        </div>
      </ReviewCard>

      <ReviewCard title="Veículo" onEdit={() => goto(3)}>
        <div className="text-sm text-white">{veiculo.marca} {veiculo.modelo} {veiculo.ano_modelo}</div>
        <div className="text-xs text-loog-muted mt-1 space-y-0.5">
          {veiculo.placa && <div>Placa {veiculo.placa}</div>}
          <div>Tipo: {veiculo.tipo}</div>
          {veiculo.valor_fipe_formatado && <div>FIPE {veiculo.valor_fipe_formatado}</div>}
        </div>
      </ReviewCard>

      <ReviewCard title="Cotação" onEdit={() => goto(4)}>
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

      <ReviewCard title="Documentos (OCR)" onEdit={() => goto(1)}>
        <div className="text-xs text-loog-muted space-y-0.5">
          {docs.map((d) => (
            <div key={d.tipo} className="flex items-center gap-2">
              <span>
                {d.ocrStatus === "ok" ? "🟢" : d.file ? "⚪" : "·"} {d.label}
              </span>
              {d.file && <span className="truncate text-emerald-300/70">{d.file.name}</span>}
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
