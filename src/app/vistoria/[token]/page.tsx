import { Suspense } from "react";
import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { RemoteInspectionLauncher } from "@/components/inspection/RemoteInspectionLauncher";

export const dynamic = "force-dynamic";

/**
 * Página pública — associado abre pelo link que recebeu no WhatsApp.
 * Resolve o token server-side e mostra UI de pré-início.
 * O wizard real (câmera + gravação) está em /vistoria/[token]/iniciar.
 */
export default async function VistoriaRemoteLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="min-h-screen pb-10">
      <header className="border-b border-loog-border/60 bg-loog-bg/70 backdrop-blur">
        <div className="container-loog flex items-center justify-between py-4">
          <Link href="/" className="inline-flex">
            <LoogLogo className="h-8" priority />
          </Link>
          <span className="text-[10px] uppercase tracking-widest text-loog-muted">vistoria externa</span>
        </div>
      </header>

      <section className="container-loog mt-6 px-4">
        <Suspense fallback={<div className="text-center text-sm text-loog-muted">Carregando…</div>}>
          <RemoteInspectionLauncher token={token} />
        </Suspense>
      </section>
    </main>
  );
}
