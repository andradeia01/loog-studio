import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* halos de fundo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-40%] h-[80%] bg-[radial-gradient(50%_60%_at_50%_40%,rgba(0,64,240,0.35),transparent_65%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-30%] right-[-10%] h-[60%] w-[60%] bg-[radial-gradient(50%_60%_at_50%_50%,rgba(0,64,240,0.20),transparent_70%)]"
      />

      {/* topbar */}
      <header className="relative">
        <div className="container-loog flex items-center justify-between py-5">
          <LoogLogo className="h-8" priority />
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
        <div className="container-loog flex flex-col items-center gap-8 py-16 text-center sm:py-24">
          <div className="inline-flex items-center gap-2 rounded-full border border-loog-border bg-loog-panel/70 px-3 py-1 text-[11px] font-medium uppercase tracking-widest text-loog-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-loog-brand2" />
            Studio oficial dos consultores LOOG
          </div>

          <h1 className="max-w-3xl font-display text-4xl font-bold tracking-tight sm:text-6xl">
            A LOOG na palma da sua mão,{" "}
            <span className="text-loog-brand2">todos os dias.</span>
          </h1>

          <p className="max-w-2xl text-base text-loog-muted sm:text-lg">
            Baixe artes prontas, gere posts personalizados com sua foto e seus dados
            em segundos, e cresça sua base com o programa de fidelidade dos consultores.
            Tudo pronto pra postar direto do celular.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="btn-primary !px-8 !py-3"
            >
              Entrar no meu studio
            </Link>
            <Link
              href="/signup"
              className="btn-ghost !px-8 !py-3"
            >
              Sou consultor, quero me cadastrar
            </Link>
          </div>

          <p className="text-xs text-loog-muted/70">
            Grátis para consultores autorizados LOOG. Aprovação em até 24h.
          </p>
        </div>
      </section>

      {/* FEATURES */}
      <section className="relative">
        <div className="container-loog py-12">
          <div className="mb-10 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-loog-brand2">
              O que você tem aqui
            </div>
            <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
              Ferramenta feita pra vender.
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Feature
              icon="📦"
              title="Artes prontas"
              text="Biblioteca com álbuns organizados por campanha. Baixa uma ou várias de uma vez em ZIP."
            />
            <Feature
              icon="✨"
              title="Personalização"
              text="Coloque seu nome, telefone, Instagram e foto. Baixa em alta resolução pronto pro feed."
            />
            <Feature
              icon="🔥"
              title="Fidelidade"
              text="Pontuação diária pelos posts que você publica. Streaks, badges e ranking entre consultores."
            />
            <Feature
              icon="📱"
              title="Mobile first"
              text="Desenhado pra celular. Compartilhamento direto pra Instagram, WhatsApp e Stories."
            />
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="relative">
        <div className="container-loog py-12">
          <div className="mb-10 text-center">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-loog-brand2">
              Simples assim
            </div>
            <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
              Do zero à publicação em segundos.
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Step
              n={1}
              title="Escolha ou personalize"
              text="Navegue nas artes prontas ou monte a sua com seus dados. Categorias, formatos e álbuns por campanha."
            />
            <Step
              n={2}
              title="Baixe ou compartilhe"
              text="Um clique baixa PNG em alta. No celular, compartilha direto pro Instagram, Stories ou WhatsApp."
            />
            <Step
              n={3}
              title="Ganhe pontos"
              text="Cole o link do post lá dentro da aba Fidelidade. Ganha pontos, mantém streak, disputa o ranking mensal."
            />
          </div>
        </div>
      </section>

      {/* NÚMEROS / PROVAS */}
      <section className="relative">
        <div className="container-loog py-12">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Number value="60+" label="Artes prontas" />
            <Number value="3+" label="Formatos" />
            <Number value="24/7" label="Disponível" />
            <Number value="Grátis" label="Para consultores" />
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative">
        <div className="container-loog py-16">
          <div className="card mx-auto max-w-3xl overflow-hidden p-10 text-center">
            <div className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-loog-brand2">
              Vamos começar?
            </div>
            <h3 className="font-display text-3xl font-bold sm:text-4xl">
              Pronto pra postar hoje mesmo.
            </h3>
            <p className="mx-auto mt-3 max-w-xl text-loog-muted">
              Se você já é consultor LOOG, entra direto. Se ainda não, cadastra pelo
              formulário. Aprovação passa pela gestão em até 24h.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/login" className="btn-primary !px-8 !py-3">Entrar</Link>
              <Link href="/signup" className="btn-ghost !px-8 !py-3">Quero me cadastrar</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative border-t border-loog-border/40">
        <div className="container-loog flex flex-col items-center justify-between gap-3 py-6 text-xs text-loog-muted sm:flex-row">
          <div className="flex items-center gap-2">
            <LoogLogo className="h-5" />
            <span>© {new Date().getFullYear()} LOOG. Todos os direitos reservados.</span>
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
    <div className="card p-5">
      <div className="text-3xl">{icon}</div>
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <p className="mt-1 text-xs text-loog-muted">{text}</p>
    </div>
  );
}

function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <div className="card p-6">
      <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-loog-brand/20 text-sm font-bold text-loog-brand2">
        {n}
      </div>
      <div className="text-base font-semibold">{title}</div>
      <p className="mt-2 text-sm text-loog-muted">{text}</p>
    </div>
  );
}

function Number({ value, label }: { value: string; label: string }) {
  return (
    <div className="card p-5 text-center">
      <div className="text-2xl font-bold text-white sm:text-3xl">{value}</div>
      <div className="mt-1 text-[11px] uppercase tracking-widest text-loog-muted">{label}</div>
    </div>
  );
}
