import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* halo azul de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-40%] h-[80%] bg-[radial-gradient(50%_60%_at_50%_40%,rgba(0,71,171,0.35),transparent_65%)]"
      />

      {/* topbar */}
      <header className="relative">
        <div className="container-loog flex items-center justify-between py-4 sm:py-5">
          <LoogLogo className="h-7 sm:h-8" priority />
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg border border-loog-border px-3 py-2 text-xs font-semibold text-loog-muted transition hover:border-white/30 hover:text-white"
            >
              Entrar
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-loog-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-loog-brand2"
            >
              Cadastrar
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative">
        <div className="container-narrow flex flex-col items-center gap-6 pt-10 pb-12 text-center sm:gap-8 sm:pt-16 sm:pb-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-loog-border bg-loog-panel/70 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-loog-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-loog-brand2" />
            Studio oficial dos consultores
          </span>

          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            Movimento{" "}
            <span className="text-loog-brand2">conecta</span>
            <br className="hidden sm:inline" /> o amanhã.
          </h1>

          <p className="max-w-md text-base text-loog-muted sm:text-lg">
            Baixe artes prontas, personalize com seus dados, crie conteúdo com IA e cresça com o programa de fidelidade. Tudo no celular.
          </p>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link href="/login" className="btn-primary sm:!px-8">Entrar no meu studio</Link>
            <Link href="/signup" className="btn-ghost sm:!px-8">Sou consultor, cadastrar</Link>
          </div>

          <p className="text-[11px] uppercase tracking-widest text-loog-muted/70">
            Grátis para consultores autorizados
          </p>
        </div>
      </section>

      {/* FEATURES */}
      <section className="relative">
        <div className="container-loog pb-10 sm:pb-16">
          <div className="mb-8 text-center sm:mb-10">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-brand3">
              O que você tem aqui
            </div>
            <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">
              Ferramenta feita pra vender.
            </h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Feature icon="📦" title="Artes prontas" text="Álbuns por campanha. Baixa 1 ou várias em ZIP." />
            <Feature icon="✨" title="Personalização" text="Sua foto + nome + telefone. Alta resolução." />
            <Feature icon="🤖" title="IA integrada" text="Copy, imagens e voz automáticas com contexto LOOG." />
            <Feature icon="🔥" title="Fidelidade" text="Pontos, streaks e ranking pelos posts que você publica." />
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="relative">
        <div className="container-loog pb-10 sm:pb-16">
          <div className="mb-8 text-center sm:mb-10">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-loog-brand3">
              Simples assim
            </div>
            <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">
              Do zero à publicação em segundos.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Step n={1} title="Escolha" text="Arte pronta ou personalize com seus dados." />
            <Step n={2} title="Baixe" text="Um clique. Compartilha direto pro Instagram." />
            <Step n={3} title="Pontue" text="Cola o link em Fidelidade e ganha pontos." />
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative">
        <div className="container-narrow pb-16">
          <div className="card overflow-hidden p-6 text-center sm:p-10">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-loog-brand3">
              Vamos começar?
            </div>
            <h3 className="font-display text-2xl font-extrabold sm:text-3xl">
              Pronto pra postar hoje mesmo.
            </h3>
            <p className="mx-auto mt-3 max-w-md text-sm text-loog-muted sm:text-base">
              Já é consultor LOOG? Entra direto. Novo? Cadastra e a gestão aprova em até 24h.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/login" className="btn-primary sm:!px-8">Entrar</Link>
              <Link href="/signup" className="btn-ghost sm:!px-8">Quero me cadastrar</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative border-t border-loog-border/40">
        <div className="container-loog flex flex-col items-center justify-between gap-3 py-6 text-xs text-loog-muted sm:flex-row">
          <div className="flex items-center gap-2">
            <LoogLogo className="h-5" />
            <span>© {new Date().getFullYear()} LOOG</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-white">Entrar</Link>
            <Link href="/signup" className="hover:text-white">Cadastrar</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function Feature({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="text-2xl sm:text-3xl">{icon}</div>
      <div className="mt-2 text-sm font-semibold sm:mt-3">{title}</div>
      <p className="mt-1 text-xs text-loog-muted">{text}</p>
    </div>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="card p-5 sm:p-6">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-loog-brand/20 text-sm font-bold text-loog-brand2">
        {n}
      </div>
      <div className="text-base font-semibold">{title}</div>
      <p className="mt-1 text-sm text-loog-muted">{text}</p>
    </div>
  );
}
