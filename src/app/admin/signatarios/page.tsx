import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { SignersManager, type SignerDefault } from "@/components/admin/SignersManager";

export const dynamic = "force-dynamic";

export default async function SignatariosPage() {
  if (!supabaseConfigured()) {
    return (
      <Shell>
        <p className="text-loog-muted">Supabase não configurado.</p>
      </Shell>
    );
  }

  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from("contract_signer_defaults")
    .select("*")
    .order("role", { ascending: true });

  return (
    <Shell>
      <SignersManager initial={(data ?? []) as SignerDefault[]} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
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
        <h1 className="font-display text-3xl font-bold">Signatários dos contratos</h1>
        <p className="mt-1 text-loog-muted">
          Quem assina os contratos LOOG. Por padrão: <strong className="text-white">Associado</strong> + <strong className="text-white">Presidente</strong>. Vice entra quando presidente ausente ou em alta alçada.
        </p>
        <AdminNav active="signatarios" />
      </section>
      <section className="container-loog mt-6">{children}</section>
    </main>
  );
}
