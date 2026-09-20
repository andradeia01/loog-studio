import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default function PendingPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[-30%] h-[70%] bg-[radial-gradient(50%_60%_at_50%_40%,rgba(0,64,240,0.35),transparent_65%)]"
      />
      <div className="relative w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center gap-3">
          <LoogLogo className="h-10" priority />
        </div>
        <div className="card space-y-4 p-8">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-loog-brand/15 text-2xl">⏳</div>
          <h1 className="font-display text-2xl font-bold">Cadastro enviado</h1>
          <p className="text-sm text-loog-muted">
            Estamos revisando o seu acesso. Assim que um gestor LOOG aprovar o
            cadastro você recebe permissão para entrar no Studio e gerar as artes.
          </p>
          <p className="text-xs text-loog-muted">
            Normalmente a liberação sai em até 1 dia útil.
          </p>
          <div className="flex flex-col gap-2 pt-2">
            <Link href="/login" className="btn-ghost">Já fui aprovado, entrar</Link>
            <LogoutButton className="btn-ghost !text-loog-muted" />
          </div>
        </div>
      </div>
    </main>
  );
}
