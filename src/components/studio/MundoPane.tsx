"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface Feature {
  icon: string;
  title: string;
  desc: string;
  status?: "pronto" | "em-breve" | "em-dev";
}

interface Props {
  icon: string;
  title: string;
  subtitle: string;
  heroColor?: string; // tailwind gradient utils
  features: Feature[];
  cta?: { label: string; onClick?: () => void; disabled?: boolean };
}

/**
 * Painel genérico "em construção" para novas abas.
 * Mostra o que vai ter de forma visualmente rica, enquanto a funcionalidade real
 * é implementada em paralelo.
 */
export function MundoPane({ icon, title, subtitle, heroColor, features, cta }: Props) {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className={cn(
          "relative overflow-hidden rounded-3xl border border-loog-border bg-gradient-to-br p-6 sm:p-8",
          heroColor ?? "from-loog-brand/20 via-loog-brand/5 to-transparent",
        )}
      >
        <div className="relative z-10 flex items-start gap-4">
          <div className="shrink-0 text-5xl sm:text-6xl">{icon}</div>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-2xl font-extrabold leading-tight sm:text-3xl">{title}</h2>
            <p className="mt-1 text-sm text-loog-muted sm:text-base">{subtitle}</p>
            {cta && (
              <button
                type="button"
                onClick={cta.onClick}
                disabled={cta.disabled}
                className="mt-4 rounded-lg bg-loog-brand px-4 py-2 text-sm font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cta.label}
              </button>
            )}
          </div>
        </div>
        <div className="pointer-events-none absolute -right-8 -bottom-8 h-48 w-48 rounded-full bg-loog-brand/10 blur-3xl" />
      </motion.div>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-loog-muted">
          O que vai ter aqui
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 + i * 0.04 }}
              className="group rounded-2xl border border-loog-border bg-loog-panel/60 p-4 transition hover:border-loog-brand/40"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-2xl">{f.icon}</span>
                <StatusBadge status={f.status ?? "em-breve"} />
              </div>
              <h4 className="font-display text-base font-bold leading-tight">{f.title}</h4>
              <p className="mt-1 text-xs text-loog-muted">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: "pronto" | "em-breve" | "em-dev" }) {
  const cfg = {
    pronto: { bg: "bg-emerald-500/15 text-emerald-300", label: "Pronto" },
    "em-breve": { bg: "bg-loog-muted/15 text-loog-muted", label: "Em breve" },
    "em-dev": { bg: "bg-amber-500/15 text-amber-300", label: "Em dev" },
  }[status];
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest", cfg.bg)}>
      {cfg.label}
    </span>
  );
}
