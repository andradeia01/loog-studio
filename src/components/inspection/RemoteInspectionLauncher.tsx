"use client";

import { useEffect, useState } from "react";

interface RemoteInspection {
  id: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  nome_associado: string;
  telefone_associado: string | null;
  status: string;
  mode: string;
  consultor_nome: string | null;
}

interface LoadState {
  loading: boolean;
  error: string | null;
  errorCode: string | null;
  data: RemoteInspection | null;
}

const ERROR_LABEL: Record<string, string> = {
  token_invalido: "Link inválido",
  token_nao_encontrado: "Link não encontrado",
  token_expirado: "Link expirado — peça um novo pro consultor LOOG",
  vistoria_concluida: "Essa vistoria já foi concluída",
  supabase_off: "Sistema indisponível no momento",
  service_role_ausente: "Sistema indisponível no momento",
};

export function RemoteInspectionLauncher({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: null,
    errorCode: null,
    data: null,
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/inspection/remote/${token}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          setState({
            loading: false,
            error: ERROR_LABEL[json.error] ?? json.error ?? "Falha ao carregar vistoria",
            errorCode: json.error ?? null,
            data: null,
          });
          return;
        }
        setState({ loading: false, error: null, errorCode: null, data: json.inspection });
      } catch (err) {
        setState({
          loading: false,
          error: err instanceof Error ? err.message : "Sem conexão",
          errorCode: "network",
          data: null,
        });
      }
    })();
  }, [token]);

  if (state.loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-loog-brand border-t-transparent" />
          <p className="text-sm text-loog-muted">Carregando vistoria…</p>
        </div>
      </div>
    );
  }

  if (state.error || !state.data) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-red-500/40 bg-red-500/5 p-6 text-center">
        <div className="text-5xl">⚠️</div>
        <h2 className="font-display text-lg font-bold text-white">Vistoria indisponível</h2>
        <p className="text-sm text-loog-muted">{state.error}</p>
        {state.errorCode === "token_expirado" && (
          <p className="text-xs text-loog-muted/80">
            Links de vistoria externa valem 72h. Fale com o consultor pra gerar um novo.
          </p>
        )}
      </div>
    );
  }

  const insp = state.data;

  return (
    <div className="mx-auto max-w-md space-y-4">
      {/* Hero — dados do veículo */}
      <div className="rounded-2xl border border-loog-brand/40 bg-gradient-to-br from-loog-brand/20 to-loog-bg/0 p-5">
        <div className="text-[10px] uppercase tracking-widest text-loog-brand2">LOOG · Vistoria do veículo</div>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">Olá, {insp.nome_associado.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-loog-muted">
          Vamos vistoriar seu veículo em ~2 minutos. 1 vídeo guiado + 3 fotos.
        </p>

        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-loog-muted">Placa</dt>
          <dd className="font-mono font-bold text-white">{insp.placa}</dd>
          {(insp.marca || insp.modelo) && (
            <>
              <dt className="text-loog-muted">Veículo</dt>
              <dd className="text-white">{[insp.marca, insp.modelo, insp.ano].filter(Boolean).join(" ")}</dd>
            </>
          )}
          {insp.consultor_nome && (
            <>
              <dt className="text-loog-muted">Consultor</dt>
              <dd className="text-white">{insp.consultor_nome}</dd>
            </>
          )}
        </dl>
      </div>

      {/* Checklist pré-início */}
      <div className="space-y-3 rounded-2xl border border-loog-border bg-loog-panel p-5">
        <h2 className="font-display text-sm font-bold text-white">Antes de começar, prepare:</h2>
        <ul className="space-y-2 text-sm text-white/90">
          <li className="flex gap-2"><span>🔑</span><span><strong>Ligue o veículo</strong> — vamos filmar o painel aceso</span></li>
          <li className="flex gap-2"><span>📱</span><span>Celular na <strong>horizontal</strong> durante o vídeo</span></li>
          <li className="flex gap-2"><span>☀️</span><span>Lugar com <strong>luz boa</strong> (dia ou garagem iluminada)</span></li>
          <li className="flex gap-2"><span>📄</span><span><strong>CRLV</strong> em mãos (foto ou PDF)</span></li>
          <li className="flex gap-2"><span>🔊</span><span>Permissão de <strong>câmera + microfone + localização</strong></span></li>
        </ul>
      </div>

      {/* CTA */}
      <a
        href={`/vistoria/${token}/iniciar`}
        className="block w-full rounded-xl bg-loog-brand px-5 py-4 text-center text-base font-bold text-white shadow-glow hover:brightness-110"
      >
        Iniciar vistoria agora →
      </a>

      <p className="text-center text-[11px] text-loog-muted">
        Qualquer dúvida fale com <strong className="text-white">{insp.consultor_nome ?? "seu consultor"}</strong>
        {insp.telefone_associado && <> · tel {insp.telefone_associado}</>}
      </p>
    </div>
  );
}
