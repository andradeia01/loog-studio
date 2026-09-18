import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* halo azul de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-40%] h-[80%] bg-[radial-gradient(50%_60%_at_50%_40%,rgba(0,64,240,0.35),transparent_65%)]"
      />
      <div className="container-loog relative flex min-h-screen flex-col items-center justify-center gap-10 py-16 text-center">
        <LoogLogo className="h-14 sm:h-16" priority />

        <div className="max-w-xl space-y-4">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-loog-border bg-loog-panel/70 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-loog-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-loog-brand2" />
            Studio de artes
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Crie suas artes <span className="text-loog-brand2">LOOG</span>
          </h1>
          <p className="text-loog-muted">
            Personalize, gere e publique. Escolha uma arte, adicione sua foto e baixe pronta
            para postar — em segundos, direto do celular.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/login" className="btn-primary">
            Entrar
          </Link>
          <Link href="/signup" className="btn-ghost">
            Sou consultor — cadastrar
          </Link>
        </div>

        <div className="mt-8 grid w-full max-w-3xl grid-cols-3 gap-2 text-xs text-loog-muted sm:gap-4">
          {[
            { k: "1", label: "Escolha a arte" },
            { k: "2", label: "Preencha seus dados" },
            { k: "3", label: "Gere e baixe" },
          ].map((s) => (
            <div key={s.k} className="card p-4 text-center">
              <div className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-loog-brand/15 text-xs font-bold text-loog-brand2">
                {s.k}
              </div>
              <div className="text-[13px] text-loog-text">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
