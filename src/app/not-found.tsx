import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <div>
        <div className="mb-2 text-xs uppercase tracking-widest text-loog-muted">
          404
        </div>
        <h1 className="font-display text-3xl font-bold">
          Não encontramos essa página
        </h1>
        <p className="mt-2 text-loog-muted">
          Volte para o Studio e escolha sua arte.
        </p>
        <Link href="/studio" className="btn-primary mt-6 inline-flex">
          Ir para o Studio
        </Link>
      </div>
    </main>
  );
}
