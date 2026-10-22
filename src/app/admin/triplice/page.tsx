import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { TriplicePane } from "@/components/admin/TriplicePane";

export const dynamic = "force-dynamic";

export default function TriplicePage() {
  return (
    <main className="min-h-screen pb-24">
      <header className="border-b border-loog-border/60 bg-loog-bg/70 backdrop-blur">
        <div className="container-loog flex items-center justify-between py-4">
          <Link href="/" className="inline-flex">
            <LoogLogo className="h-8" priority />
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/studio" className="text-xs text-loog-muted hover:text-white">studio</Link>
            <LogoutButton className="!py-2 !px-3 !text-xs" />
          </div>
        </div>
      </header>
      <section className="container-loog pt-8">
        <h1 className="font-display text-3xl font-bold">Tríplice 🔱</h1>
        <p className="mt-1 text-loog-muted">
          Compara dados do mesmo associado em 3 fontes: <strong className="text-white">LOOG Studio</strong> · <strong className="text-white">PlusAssist (Infornet)</strong> · <strong className="text-white">SIVIS/Hub</strong>.
        </p>
        <AdminNav active="triplice" />
      </section>
      <section className="container-loog mt-6">
        <TriplicePane />
      </section>
    </main>
  );
}
