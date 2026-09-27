import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";

export const dynamic = "force-dynamic";

// Placeholder — Fatia 7 substitui pelo dashboard real do gestor.
export default function GestorPage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-loog-border/60 bg-loog-bg/70 backdrop-blur">
        <div className="container-loog flex items-center justify-between py-4">
          <Link href="/" className="inline-flex">
            <LoogLogo className="h-8" priority />
          </Link>
          <LogoutButton className="!py-2 !px-3 !text-xs" />
        </div>
      </header>
      <section className="container-loog pt-16 text-center">
        <h1 className="font-display text-3xl font-bold">Área do gestor</h1>
        <p className="mt-3 text-loog-muted">
          Dashboard em construção. Enquanto isso, você pode acessar:
        </p>
        <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/studio" className="btn-primary">Studio (visão consultor)</Link>
        </div>
      </section>
    </main>
  );
}
