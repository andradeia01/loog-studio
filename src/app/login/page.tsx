"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { LoogLogo } from "@/components/ui/LoogMark";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/studio";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setErr(error.message === "Invalid login credentials" ? "E-mail ou senha inválidos." : error.message);
      setLoading(false);
      return;
    }
    router.replace(redirect);
    router.refresh();
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
          <p className="text-xs uppercase tracking-widest text-loog-muted">acesso do consultor</p>
        </div>
        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <div>
            <label className="label mb-1.5">E-mail</label>
            <input
              type="email"
              className="input"
              value={email}
              autoComplete="email"
              required
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@loog.com.br"
            />
          </div>
          <div>
            <label className="label mb-1.5">Senha</label>
            <input
              type="password"
              className="input"
              value={password}
              autoComplete="current-password"
              required
              minLength={6}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {err && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
          <div className="text-center text-xs text-loog-muted">
            Ainda não tem conta?{" "}
            <Link href="/signup" className="text-loog-brand2 hover:underline">
              Cadastre-se
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
