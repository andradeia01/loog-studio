import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { VideoEditor } from "@/components/studio/VideoEditor";

export const dynamic = "force-dynamic";

export default function VideoEditorPage() {
  return (
    <main className="min-h-screen pb-24">
      <header className="border-b border-loog-border/60 bg-loog-bg/70 backdrop-blur">
        <div className="container-loog flex items-center justify-between py-4">
          <Link href="/" className="inline-flex">
            <LoogLogo className="h-8" priority />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/studio" className="text-xs text-loog-muted hover:text-white">← studio</Link>
            <LogoutButton className="!py-2 !px-3 !text-xs" />
          </div>
        </div>
      </header>
      <section className="container-loog pt-6">
        <h1 className="font-display text-3xl font-bold">Editor de Vídeo</h1>
        <p className="mt-1 text-loog-muted">
          Corte, adicione trilha, texto e exporte em 9:16. Tudo no navegador — nada sobe pro servidor.
        </p>
      </section>
      <section className="container-loog mt-6">
        <VideoEditor />
      </section>
    </main>
  );
}
