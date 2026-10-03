"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { Mundo, MundoKey } from "./StudioShell";

interface Props {
  mundos: Mundo[];
  consultantName?: string | null;
  onNavigate: (mundo: MundoKey, sub?: string | null) => void;
  stats?: {
    artesCount?: number;
    videosCount?: number;
    streak?: number;
    pontos?: number;
  };
}

/** Dashboard inicial do consultor — cards grandes dos mundos + atalhos rápidos. */
export function StudioHome({ mundos, consultantName, onNavigate, stats }: Props) {
  const outros = mundos.filter((m) => m.key !== "home");
  const primeiroNome = consultantName?.split(" ")[0] ?? "consultor";

  return (
    <div className="space-y-8">
      <HeroSaudacao nome={primeiroNome} stats={stats} />

      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-loog-muted">
          O que você quer fazer agora?
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {outros.map((m, i) => (
            <MundoCard key={m.key} mundo={m} index={i} onClick={() => onNavigate(m.key, m.subs[0]?.key ?? null)} />
          ))}
        </div>
      </section>

      <AtalhosRapidos onNavigate={onNavigate} />
    </div>
  );
}

function HeroSaudacao({ nome, stats }: { nome: string; stats?: Props["stats"] }) {
  const hora = new Date().getHours();
  const bomDia = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative overflow-hidden rounded-3xl border border-loog-border bg-gradient-to-br from-loog-brand/20 via-loog-brand/5 to-transparent p-6 sm:p-8"
    >
      <div className="relative z-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-loog-brand">
          {bomDia}
        </p>
        <h1 className="mt-1 font-display text-3xl font-extrabold leading-tight sm:text-4xl">
          {nome.charAt(0).toUpperCase() + nome.slice(1)}, vamos vender?
        </h1>
        <p className="mt-2 max-w-xl text-sm text-loog-muted">
          Movimento conecta o amanhã. Cotação, conteúdo e IA — tudo num só lugar.
        </p>

        {stats && (
          <div className="mt-5 flex flex-wrap gap-3">
            {typeof stats.streak === "number" && stats.streak > 0 && (
              <StatBadge icon="🔥" label="Streak" value={`${stats.streak} dias`} />
            )}
            {typeof stats.pontos === "number" && stats.pontos > 0 && (
              <StatBadge icon="⭐" label="Pontos" value={stats.pontos.toLocaleString("pt-BR")} />
            )}
            {typeof stats.artesCount === "number" && stats.artesCount > 0 && (
              <StatBadge icon="📷" label="Artes" value={stats.artesCount} />
            )}
          </div>
        )}
      </div>

      {/* decoração sutil */}
      <div className="pointer-events-none absolute -right-8 -top-8 h-48 w-48 rounded-full bg-loog-brand/10 blur-3xl" />
    </motion.div>
  );
}

function StatBadge({ icon, label, value }: { icon: string; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-loog-border bg-loog-panel/80 px-3 py-1.5 backdrop-blur">
      <span className="text-base">{icon}</span>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}

function MundoCard({ mundo, index, onClick }: { mundo: Mundo; index: number; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.08 + index * 0.04, ease: "easeOut" }}
      whileHover={{ y: -2, transition: { duration: 0.15 } }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-loog-border bg-loog-panel p-5 text-left transition hover:border-loog-brand/50",
      )}
    >
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-50 transition-opacity group-hover:opacity-100", mundo.color)} />
      <div className="relative z-10">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-3xl">{mundo.icon}</span>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-loog-muted/70">
            {mundo.subs.length > 0 ? `${mundo.subs.length} ferramentas` : "abrir"}
          </span>
        </div>
        <h3 className="font-display text-lg font-bold leading-tight">{mundo.label}</h3>
        <p className="mt-1 text-xs text-loog-muted">{mundo.short}</p>

        {mundo.subs.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {mundo.subs.slice(0, 4).map((s) => (
              <span key={s.key} className="rounded-md bg-black/30 px-2 py-0.5 text-[10px] text-loog-muted">
                {s.label}
              </span>
            ))}
            {mundo.subs.length > 4 && (
              <span className="rounded-md bg-black/30 px-2 py-0.5 text-[10px] text-loog-muted">+{mundo.subs.length - 4}</span>
            )}
          </div>
        )}
      </div>
    </motion.button>
  );
}

function AtalhosRapidos({ onNavigate }: { onNavigate: Props["onNavigate"] }) {
  const atalhos = [
    { icon: "🚗", label: "Cotar placa", desc: "SIVIS + PDF", mundo: "vendas" as MundoKey, sub: "placa" },
    { icon: "📷", label: "Baixar arte", desc: "Catálogo oficial", mundo: "conteudo" as MundoKey, sub: "artes" },
    { icon: "✨", label: "Gerar copy IA", desc: "ChatGPT", mundo: "ia" as MundoKey, sub: "copy" },
    { icon: "🔥", label: "Check-in hoje", desc: "+10 pontos", mundo: "fidelidade" as MundoKey, sub: null },
  ];
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-loog-muted">Atalhos rápidos</h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {atalhos.map((a, i) => (
          <motion.button
            key={a.label}
            type="button"
            onClick={() => onNavigate(a.mundo, a.sub)}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.3 + i * 0.04 }}
            whileHover={{ x: 2 }}
            className="group flex items-center gap-3 rounded-xl border border-loog-border bg-loog-panel/60 px-4 py-3 text-left transition hover:border-loog-brand/40 hover:bg-loog-panel"
          >
            <span className="text-2xl">{a.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{a.label}</div>
              <div className="truncate text-[11px] text-loog-muted">{a.desc}</div>
            </div>
            <span className="text-loog-muted transition group-hover:translate-x-1 group-hover:text-white">→</span>
          </motion.button>
        ))}
      </div>

      {/* Links externos */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href="/studio/reels" className="rounded-full border border-loog-border bg-loog-panel px-4 py-2 text-xs text-loog-muted hover:border-loog-brand/40 hover:text-white">
          🎬 Fábrica de Reels ↗
        </Link>
        <Link href="/studio/editor" className="rounded-full border border-loog-border bg-loog-panel px-4 py-2 text-xs text-loog-muted hover:border-loog-brand/40 hover:text-white">
          ✂️ Editor de vídeo ↗
        </Link>
      </div>
    </section>
  );
}
