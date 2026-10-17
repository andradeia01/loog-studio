"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { LoogLogo } from "@/components/ui/LoogMark";
import { PasswordInput } from "@/components/auth/PasswordInput";

/**
 * Página que o consultor abre pelo link do e-mail de recuperação.
 *
 * Supabase processa o token do hash/query automaticamente ao chamar
 * `onAuthStateChange` (evento PASSWORD_RECOVERY). A partir daí a sessão
 * está autorizada SOMENTE pra atualizar a própria senha via `updateUser`.
 *
 * Se o usuário abriu a página sem clicar no link do e-mail (sem token),
 * mostramos aviso + CTA pra pedir novo link.
 */
function RecuperarSenhaInner() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<unknown>(null);
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    // O Supabase processa o hash do URL automaticamente. Em alguns casos
    // ele ja criou uma sessao; em outros dispara PASSWORD_RECOVERY.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setSession(s);
      setReady(true);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (senha.length < 8) {
      setErr("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (senha !== senha2) {
      setErr("As duas senhas não coincidem.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createSupabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw error;
      setOk(true);
      // Depois de 2s, redireciona pro login (o updateUser já desloga o fluxo de recovery)
      setTimeout(() => {
        router.replace("/login");
        router.refresh();
      }, 2000);
    } catch (error) {
      setErr(error instanceof Error ? error.message : "Não deu pra atualizar a senha. Peça um novo link e tenta de novo.");
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
          <p className="text-xs uppercase tracking-widest text-loog-muted">nova senha</p>
        </div>

        {!ready ? (
          <div className="card p-6 text-center text-sm text-loog-muted">Validando o link…</div>
        ) : ok ? (
          <div className="card space-y-4 p-6 text-center">
            <div className="text-5xl">✅</div>
            <h2 className="font-display text-lg font-bold text-white">Senha atualizada!</h2>
            <p className="text-sm text-loog-muted">Redirecionando pro login…</p>
          </div>
        ) : !session ? (
          <div className="card space-y-4 p-6 text-center">
            <div className="text-4xl">🔗</div>
            <h2 className="font-display text-base font-bold text-white">Link expirado ou inválido</h2>
            <p className="text-sm text-loog-muted">
              O link de recuperação vale por 1 hora. Peça um novo pra tentar de novo.
            </p>
            <Link href="/esqueci-senha" className="btn-primary inline-flex">Pedir novo link</Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="card space-y-4 p-6">
            <div>
              <label className="label mb-1.5" htmlFor="senha-nova">Nova senha</label>
              <PasswordInput
                id="senha-nova"
                value={senha}
                onChange={setSenha}
                autoComplete="new-password"
                minLength={8}
                autoFocus
              />
              <p className="mt-1.5 text-[11px] text-loog-muted">Pelo menos 8 caracteres.</p>
            </div>
            <div>
              <label className="label mb-1.5" htmlFor="senha-nova-2">Confirme a nova senha</label>
              <PasswordInput
                id="senha-nova-2"
                value={senha2}
                onChange={setSenha2}
                autoComplete="new-password"
                minLength={8}
              />
            </div>
            {err && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {err}
              </div>
            )}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? "Salvando…" : "Salvar nova senha"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

export default function RecuperarSenhaPage() {
  return (
    <Suspense fallback={null}>
      <RecuperarSenhaInner />
    </Suspense>
  );
}
