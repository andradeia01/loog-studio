"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";

export type MundoKey = "home" | "dashboard" | "vendas" | "vistoria" | "conteudo" | "ia" | "academia" | "agenda" | "producao" | "fidelidade";

export interface SubTab {
  key: string;
  label: string;
  icon?: string;
  badge?: number;
}

export interface Mundo {
  key: MundoKey;
  label: string;
  icon: string;
  short: string;        // descrição curta no card da home
  color: string;        // Tailwind: ex "from-blue-500/20 to-blue-500/5"
  subs: SubTab[];       // vazio = sem sub-navegação
  externalLinks?: Array<{ href: string; label: string; icon: string }>;
}

export interface StudioShellProps {
  mundos: Mundo[];
  activeMundo: MundoKey;
  activeSub: string | null;
  onNavigate: (mundo: MundoKey, sub?: string | null) => void;
  consultantName?: string | null;
  authEnabled: boolean;
  children: ReactNode;
}

/** Shell principal do /studio com sidebar fixa (desktop) + bottom nav (mobile). */
export function StudioShell({
  mundos, activeMundo, activeSub, onNavigate,
  consultantName, authEnabled, children,
}: StudioShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orientTick, setOrientTick] = useState(0);

  // fecha drawer ao mudar de aba
  useEffect(() => { setSidebarOpen(false); }, [activeMundo, activeSub]);

  // iOS fix: força relayout quando o device gira ou a visualViewport muda
  // (teclado abre/fecha). Sem isso, iOS Safari às vezes mantém o layout antigo
  // e os cliques caem em posições erradas de elementos.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => {
      // trigger relayout sintético + state tick pro React re-renderizar
      void document.body.offsetHeight;
      setOrientTick((n) => n + 1);
      // garante que o drawer feche se ficou "fantasma" após rotation
      setSidebarOpen(false);
    };
    window.addEventListener("orientationchange", bump);
    window.visualViewport?.addEventListener("resize", bump);
    return () => {
      window.removeEventListener("orientationchange", bump);
      window.visualViewport?.removeEventListener("resize", bump);
    };
  }, []);
  void orientTick;

  const current = mundos.find((m) => m.key === activeMundo);

  return (
    <div className="min-h-screen bg-loog-bg text-loog-text">
      {/* TOP BAR (sempre visível, compacta)
          iOS fix: paddingTop + paddingLeft/Right usam safe-area pra evitar que
          o logo e o botão "Sair" fiquem atrás do notch em landscape iPhone. */}
      <header
        className="sticky top-0 z-40 border-b border-loog-border/60 bg-loog-bg/85 backdrop-blur-md"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            {/* burger mobile */}
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="rounded-lg p-2 text-loog-muted hover:bg-white/5 hover:text-white lg:hidden"
              aria-label="Abrir menu"
            >
              <BurgerIcon open={sidebarOpen} />
            </button>
            <Link href="/" className="flex items-center gap-2">
              <LoogLogo className="h-7" priority />
            </Link>
            <span className="hidden text-xs text-loog-muted sm:inline">· {current?.label ?? "Studio"}</span>
          </div>
          <div className="flex items-center gap-2">
            {consultantName && (
              <span className="hidden text-xs text-loog-muted sm:inline">
                Olá, <b className="text-white">{consultantName.split(" ")[0]}</b>
              </span>
            )}
            {authEnabled && <LogoutButton className="!py-1.5 !px-3 !text-xs" />}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px]">
        {/* SIDEBAR desktop */}
        <aside className="hidden w-[232px] shrink-0 border-r border-loog-border/40 pt-6 lg:block">
          <Nav
            mundos={mundos}
            activeMundo={activeMundo}
            activeSub={activeSub}
            onNavigate={onNavigate}
          />
        </aside>

        {/* DRAWER mobile */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setSidebarOpen(false)}
              />
              <motion.aside
                className="fixed left-0 top-0 z-50 h-full w-[280px] overflow-y-auto border-r border-loog-border bg-loog-bg px-4 pb-24 pt-6 lg:hidden"
                initial={{ x: -300 }} animate={{ x: 0 }} exit={{ x: -300 }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
              >
                <div className="mb-6 flex items-center justify-between px-2">
                  <LoogLogo className="h-7" />
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="rounded-lg p-2 text-loog-muted hover:bg-white/5"
                    aria-label="Fechar menu"
                  >
                    <CloseIcon />
                  </button>
                </div>
                <Nav
                  mundos={mundos}
                  activeMundo={activeMundo}
                  activeSub={activeSub}
                  onNavigate={onNavigate}
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* CONTEÚDO — min-w-0 crítico pra evitar que flex-child estoure lateralmente.
            pb-24 + safe-area-inset-bottom garante que o último item do scroll não
            fique coberto pela bottom nav em iPhone com home indicator. */}
        <main
          className="min-w-0 max-w-full flex-1 overflow-x-hidden px-4 pt-6 lg:px-8 lg:pb-10"
          style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
        >
          {/* Breadcrumb do mundo + sub-tabs */}
          {current && current.key !== "home" && (
            <div className="mb-6">
              <h1 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
                <span className="mr-2">{current.icon}</span>
                {current.label}
              </h1>
              {current.subs.length > 0 && (
                <nav
                  className="mt-4 flex gap-1 overflow-x-auto rounded-xl border border-loog-border bg-loog-panel/60 p-1 backdrop-blur"
                  style={{ touchAction: "pan-x", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
                >
                  {current.subs.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => onNavigate(current.key, s.key)}
                      className={cn(
                        "relative shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition",
                        activeSub === s.key
                          ? "bg-loog-brand text-white shadow-glow"
                          : "text-loog-muted hover:text-white",
                      )}
                    >
                      {s.icon && <span className="mr-1.5">{s.icon}</span>}
                      {s.label}
                      {typeof s.badge === "number" && s.badge > 0 && (
                        <span className={cn(
                          "ml-2 rounded-full px-1.5 py-0.5 text-[10px]",
                          activeSub === s.key ? "bg-black/30" : "bg-white/10",
                        )}>
                          {s.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </nav>
              )}
            </div>
          )}

          {/* Content container: key estável evita que o wrapper remonte;
              o React ainda reconcilia os children diferentes de cada mundo/sub,
              mas sem a camada do framer-motion com `mode="wait"` que bloqueava
              paint e amplificava o custo no PWA mobile. Fade sutil via CSS puro. */}
          <div key={`${activeMundo}-${activeSub ?? ""}`} className="animate-in fade-in duration-150">
            {children}
          </div>
        </main>
      </div>

      {/* BOTTOM NAV mobile: 4 principais + "Mais" (abre drawer)
          iOS fix: paddingBottom + paddingLeft/Right usam safe-area pra tirar os
          botões de baixo do home indicator E longe do notch lateral em landscape.
          Sem isso, em iPhone deitado os cliques eram capturados pelo próprio iOS
          (zona do home indicator abre app switcher). min-h-[52px] garante tap
          target >= 44pt do HIG mesmo com safe-area reduzindo o espaço útil. */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-loog-border/60 bg-loog-bg/95 backdrop-blur-md lg:hidden"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <div className="mx-auto flex max-w-xl items-stretch">
          {mundos.slice(0, 4).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => onNavigate(m.key, m.subs[0]?.key ?? null)}
              className={cn(
                "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] transition active:bg-white/5",
                activeMundo === m.key ? "text-loog-brand" : "text-loog-muted",
              )}
            >
              <span className={cn("text-xl transition-transform", activeMundo === m.key && "scale-110")}>{m.icon}</span>
              <span className="font-semibold">{m.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className={cn(
              "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] transition active:bg-white/5",
              mundos.slice(4).some((m) => m.key === activeMundo) ? "text-loog-brand" : "text-loog-muted",
            )}
          >
            <span className="text-xl">✨</span>
            <span className="font-semibold">Mais</span>
          </button>
        </div>
      </nav>
    </div>
  );
}

function Nav({
  mundos, activeMundo, activeSub, onNavigate,
}: {
  mundos: Mundo[]; activeMundo: MundoKey; activeSub: string | null;
  onNavigate: (m: MundoKey, s?: string | null) => void;
}) {
  return (
    <nav className="space-y-1 px-3">
      {mundos.map((m) => {
        const isActive = activeMundo === m.key;
        const hasSubs = m.subs.length > 0;
        return (
          <div key={m.key}>
            <button
              type="button"
              onClick={() => onNavigate(m.key, m.subs[0]?.key ?? null)}
              className={cn(
                "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
                isActive
                  ? "bg-loog-brand/15 text-white"
                  : "text-loog-muted hover:bg-white/5 hover:text-white",
              )}
            >
              <span className={cn("text-xl transition", isActive && "scale-110")}>{m.icon}</span>
              <span className="flex-1 font-semibold">{m.label}</span>
              {isActive && (
                <motion.span
                  layoutId="mundo-active-dot"
                  className="h-2 w-2 rounded-full bg-loog-brand"
                />
              )}
            </button>

            {/* sub-items só do mundo ativo */}
            {isActive && hasSubs && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="ml-7 mt-1 space-y-0.5 overflow-hidden border-l border-loog-border/60 pl-3"
              >
                {m.subs.map((s) => (
                  <li key={s.key}>
                    <button
                      type="button"
                      onClick={() => onNavigate(m.key, s.key)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs transition",
                        activeSub === s.key
                          ? "bg-white/10 text-white"
                          : "text-loog-muted hover:bg-white/5 hover:text-white",
                      )}
                    >
                      {s.icon && <span>{s.icon}</span>}
                      <span className="flex-1 text-left">{s.label}</span>
                      {typeof s.badge === "number" && s.badge > 0 && (
                        <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px]">{s.badge}</span>
                      )}
                    </button>
                  </li>
                ))}
                {m.externalLinks?.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-loog-muted hover:bg-white/5 hover:text-white"
                    >
                      <span>{link.icon}</span>
                      <span className="flex-1">{link.label}</span>
                      <span className="text-[10px] opacity-60">↗</span>
                    </Link>
                  </li>
                ))}
              </motion.ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function BurgerIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <motion.rect y="4" width="20" height="2" rx="1" fill="currentColor"
        animate={{ rotate: open ? 45 : 0, y: open ? 9 : 4 }} transformTemplate={(_, t) => t}
      />
      <motion.rect y="9" width="20" height="2" rx="1" fill="currentColor"
        animate={{ opacity: open ? 0 : 1 }}
      />
      <motion.rect y="14" width="20" height="2" rx="1" fill="currentColor"
        animate={{ rotate: open ? -45 : 0, y: open ? 9 : 14 }} transformTemplate={(_, t) => t}
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 3l12 12M15 3L3 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
