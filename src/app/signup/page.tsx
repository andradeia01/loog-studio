"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { LoogLogo } from "@/components/ui/LoogMark";
import { formatPhoneBR } from "@/lib/utils";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    phone: "",
    instagram: "",
    city: "",
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function patch<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm({ ...form, [k]: v });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    if (form.password.length < 6) {
      setErr("Senha deve ter pelo menos 6 caracteres.");
      setLoading(false);
      return;
    }
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          full_name: form.full_name,
          phone: form.phone,
          instagram: form.instagram,
          city: form.city,
        },
      },
    });
    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }
    router.replace("/pending");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-30%] h-[70%] bg-[radial-gradient(50%_60%_at_50%_40%,rgba(0,64,240,0.35),transparent_65%)]"
      />
      <div className="relative w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <LoogLogo className="h-10" priority />
          <p className="text-xs uppercase tracking-widest text-loog-muted">quero ser consultor loog</p>
        </div>
        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <div>
            <label className="label mb-1.5">Nome completo</label>
            <input className="input" required value={form.full_name} onChange={(e) => patch("full_name", e.target.value)} placeholder="João da Silva" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label mb-1.5">Telefone</label>
              <input className="input" required value={form.phone} onChange={(e) => patch("phone", e.target.value)} onBlur={(e) => patch("phone", formatPhoneBR(e.target.value))} placeholder="(24) 99999-9999" />
            </div>
            <div>
              <label className="label mb-1.5">Cidade</label>
              <input className="input" value={form.city} onChange={(e) => patch("city", e.target.value)} placeholder="Volta Redonda" />
            </div>
          </div>
          <div>
            <label className="label mb-1.5">Instagram <span className="ml-1 font-normal normal-case text-loog-muted/60">opcional</span></label>
            <input className="input" value={form.instagram} onChange={(e) => patch("instagram", e.target.value)} placeholder="@seuhandle" />
          </div>
          <div className="border-t border-loog-border pt-4" />
          <div>
            <label className="label mb-1.5">E-mail</label>
            <input type="email" required className="input" autoComplete="email" value={form.email} onChange={(e) => patch("email", e.target.value)} placeholder="voce@email.com" />
          </div>
          <div>
            <label className="label mb-1.5">Senha</label>
            <input type="password" required minLength={6} className="input" autoComplete="new-password" value={form.password} onChange={(e) => patch("password", e.target.value)} placeholder="mínimo 6 caracteres" />
          </div>
          {err && <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">{err}</div>}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Enviando…" : "Enviar cadastro"}
          </button>
          <p className="text-center text-xs text-loog-muted">
            Após enviar, aguarde a aprovação do gestor LOOG. Você recebe acesso assim que for autorizado.
          </p>
          <div className="text-center text-xs text-loog-muted">
            Já tem conta?{" "}
            <Link href="/login" className="text-loog-brand2 hover:underline">
              Entrar
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}
