"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { LoogLogo } from "@/components/ui/LoogMark";

function EsqueciSenhaInner() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const supabase = createSupabaseBrowser();
      // redirectTo precisa estar na allow list do Supabase (Site URL + Redirect URLs)
      const redirectTo = `${window.location.origin}/recuperar-senha`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setSent(true);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Não deu pra enviar o e-mail agora. Tenta de novo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-30%] h-[70%] bg-[radial-gradient(50%_60%_at_50%_40%,rgba(0,64,240,0.35),transparent_65%)]"
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LoogLogo className="h-10" priority />
          <p className="text-xs uppercase tracking-widest text-loog-muted">recuperar senha</p>
        </div>

        {sent ? (
          <div className="card space-y-4 p-6 text-center">
            <div className="text-5xl">✉️</div>
            <h2 className="font-display text-lg font-bold text-white">Verifique seu e-mail</h2>
            <p className="text-sm text-loog-muted">
              Enviamos um link para <strong className="text-white">{email}</strong>. Clica no link do e-mail pra escolher uma nova senha. O link vale por 1 hora.
            </p>
            <p className="text-xs text-loog-muted/80">
              Não achou? Confere a caixa de spam ou tenta de novo em 1 min.
            </p>
            <Link href="/login" className="btn-primary inline-flex">Voltar pro login</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="card space-y-4 p-6">
            <div>
              <label className="label mb-1.5">E-mail cadastrado</label>
              <input
                type="email"
                className="input"
                value={email}
                autoComplete="email"
                required
                autoFocus
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@loog.com.br"
              />
              <p className="mt-1.5 text-[11px] text-loog-muted">
                Vamos enviar um link seguro pra você escolher uma nova senha.
              </p>
            </div>
            {err && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {err}
              </div>
            )}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? "Enviando…" : "Enviar link de recuperação"}
            </button>
            <div className="text-center text-xs text-loog-muted">
              Lembrou?{" "}
              <Link href="/login" className="text-loog-brand2 hover:underline">
                Voltar pro login
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

export default function EsqueciSenhaPage() {
  return (
    <Suspense fallback={null}>
      <EsqueciSenhaInner />
    </Suspense>
  );
}
