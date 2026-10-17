"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { startSessionKeepalive } from "@/lib/errors/api-fetch";
import { PasswordInput } from "@/components/auth/PasswordInput";

/**
 * Montado uma vez na raiz do /studio.
 *
 * Faz 2 coisas:
 *  1) startSessionKeepalive() — pinga /api/me a cada 4min pra renovar JWT
 *  2) Escuta evento "loog:session-expired" → mostra modal "Entrar de novo"
 *
 * Modal NUNCA fecha sozinho — forçar re-login é a única saída, assim o
 * consultor não fica tentando botão de "cotar" numa sessão zumbi.
 */
export function SessionGuard() {
  const [expired, setExpired] = useState(false);
  const [reauthing, setReauthing] = useState(false);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    startSessionKeepalive();
    const onExpired = () => setExpired(true);
    window.addEventListener("loog:session-expired", onExpired as EventListener);
    // Prefill email do localStorage (não guarda senha)
    try {
      const saved = window.localStorage.getItem("loog-last-email");
      if (saved) setEmail(saved);
    } catch { /* ignore */ }
    return () => window.removeEventListener("loog:session-expired", onExpired as EventListener);
  }, []);

  async function reauth(e: React.FormEvent) {
    e.preventDefault();
    setReauthing(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowser();
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInErr) throw signInErr;
      try { window.localStorage.setItem("loog-last-email", email.trim()); } catch { /* ignore */ }
      setExpired(false);
      setPassword("");
      // Recarrega a página pra garantir que todos os componentes peguem a sessão nova
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login. Verifica e-mail e senha.");
    } finally {
      setReauthing(false);
    }
  }

  if (!expired) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-sm rounded-2xl border border-loog-brand/40 bg-loog-panel p-6 shadow-2xl">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔐</span>
          <h2 className="font-display text-lg font-bold text-white">Sessão expirou</h2>
        </div>
        <p className="mt-2 text-sm text-loog-muted">
          Pra sua segurança, o Studio desconecta depois de um tempo sem atividade. Entra de novo pra continuar — a cotação que você estava fazendo continua ali depois.
        </p>

        <form onSubmit={reauth} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-loog-muted">E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus={!email}
              placeholder="voce@loog.com.br"
              className="w-full rounded-lg border border-loog-border bg-loog-bg px-3 py-2 text-sm text-white placeholder:text-loog-muted focus:border-loog-brand focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-loog-muted">Senha</span>
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              required
              minLength={6}
              autoFocus={!!email}
            />
          </label>
          {error && <p className="text-sm text-red-400">⚠️ {error}</p>}
          <button
            type="submit"
            disabled={reauthing}
            className="w-full rounded-lg bg-loog-brand px-4 py-2.5 text-sm font-semibold text-white shadow-glow hover:brightness-110 disabled:opacity-50"
          >
            {reauthing ? "Entrando..." : "Entrar de novo"}
          </button>
          <div className="text-center">
            <a
              href={`/esqueci-senha${email ? `?email=${encodeURIComponent(email)}` : ""}`}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-loog-brand2 hover:underline"
            >
              Esqueci minha senha
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
