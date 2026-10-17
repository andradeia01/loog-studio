"use client";

/**
 * Badge que diferencia visualmente de QUAL sistema veio o erro + mostra o que
 * o consultor pode fazer sobre isso.
 *
 * Fontes:
 *   placafipe → consulta de placa (API externa, api.placafipe.com.br)
 *   sivis     → sistema oficial LOOG (via Hub Fastify)
 *   auth      → sessão / permissão do Studio
 *   network   → Hub LOOG offline / infra interna
 *   studio    → validação local (campo mal preenchido, rate limit nosso)
 *
 * Ação sugerida:
 *   retry         → "Tentar de novo" (reconsulta igual)
 *   manual        → "Cotação manual" (abre fluxo marca/modelo/ano)
 *   relogin       → "Entrar de novo" (dispara SessionGuard)
 *   wait          → "Aguardar e tentar depois"
 *   contact_admin → "Falar com o admin"
 *   fix_input     → só mostra, sem ação (consultor corrige o campo)
 */

export type ErrorSource = "placafipe" | "sivis" | "auth" | "network" | "studio";
export type NextAction = "retry" | "manual" | "relogin" | "wait" | "contact_admin" | "fix_input";

export interface ErrorBadgeProps {
  source: ErrorSource;
  title: string;
  message: string;
  nextAction: NextAction;
  retryable?: boolean;
  onRetry?: () => void;
  onManual?: () => void;
  onRelogin?: () => void;
}

const SOURCE_META: Record<ErrorSource, { label: string; emoji: string; className: string }> = {
  placafipe: {
    label: "PlacaFIPE",
    emoji: "🔎",
    className: "border-sky-500/40 bg-sky-500/5 text-sky-100",
  },
  sivis: {
    label: "SIVIS",
    emoji: "🏢",
    className: "border-violet-500/40 bg-violet-500/5 text-violet-100",
  },
  auth: {
    label: "Sessão",
    emoji: "🔐",
    className: "border-amber-500/40 bg-amber-500/5 text-amber-100",
  },
  network: {
    label: "Hub LOOG",
    emoji: "📡",
    className: "border-red-500/40 bg-red-500/5 text-red-100",
  },
  studio: {
    label: "Studio",
    emoji: "⚙️",
    className: "border-loog-border bg-loog-panel text-loog-muted",
  },
};

const ACTION_META: Record<NextAction, { label: string } | null> = {
  retry: { label: "Tentar de novo" },
  manual: { label: "Cotação manual" },
  relogin: { label: "Entrar de novo" },
  wait: { label: "Aguardar e tentar depois" },
  contact_admin: { label: "Falar com o admin" },
  fix_input: null, // sem botão
};

export function ErrorBadge({ source, title, message, nextAction, retryable, onRetry, onManual, onRelogin }: ErrorBadgeProps) {
  const meta = SOURCE_META[source];
  const action = ACTION_META[nextAction];

  function handleAction() {
    if (nextAction === "retry" && onRetry) onRetry();
    else if (nextAction === "manual" && onManual) onManual();
    else if (nextAction === "relogin") {
      if (onRelogin) onRelogin();
      else if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("loog:session-expired"));
    }
  }

  const canAct = action && (
    (nextAction === "retry" && !!onRetry) ||
    (nextAction === "manual" && !!onManual) ||
    nextAction === "relogin" ||
    nextAction === "wait" ||
    nextAction === "contact_admin"
  );

  return (
    <div className={`rounded-xl border p-4 ${meta.className}`} role="alert">
      <div className="flex items-start gap-3">
        <div className="shrink-0 text-xl leading-none">{meta.emoji}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-current/30 bg-current/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
              {meta.label}
            </span>
            <h3 className="font-display text-sm font-bold text-white">{title}</h3>
          </div>
          <p className="mt-1 text-sm text-white/90">{message}</p>
          {retryable && (
            <p className="mt-1 text-[10px] uppercase tracking-wider text-white/50">
              ⟳ Erro temporário — vale tentar de novo
            </p>
          )}
          {canAct && action && (
            <div className="mt-3 flex flex-wrap gap-2">
              {(nextAction === "retry" || nextAction === "manual" || nextAction === "relogin") && (
                <button
                  type="button"
                  onClick={handleAction}
                  className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-loog-bg transition hover:bg-white/90"
                >
                  {action.label}
                </button>
              )}
              {nextAction === "wait" && (
                <span className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white/80">
                  ⏳ {action.label}
                </span>
              )}
              {nextAction === "contact_admin" && (
                <span className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs text-white/80">
                  👤 {action.label}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
