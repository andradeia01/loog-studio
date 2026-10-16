import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { MembersManager, type MemberRow } from "@/components/admin/MembersManager";

export const dynamic = "force-dynamic";

export default async function AssociadosPage() {
  if (!supabaseConfigured()) {
    return (
      <Shell>
        <p className="text-loog-muted">Supabase não configurado.</p>
      </Shell>
    );
  }

  const supabase = await createSupabaseServer();
  const { data: members } = await supabase
    .from("members")
    .select("id, matricula, nome, cpf_cnpj, email, telefone, cidade, uf, status, owner_consultant_id, group_id, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const { data: counts } = await supabase
    .from("members")
    .select("status", { count: "exact", head: false });

  const rows: MemberRow[] = (members ?? []) as MemberRow[];

  return (
    <Shell>
      <MembersManager initial={rows} totalRows={counts?.length ?? rows.length} />
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
        <h1 className="font-display text-3xl font-bold">Associados LOOG</h1>
        <p className="mt-1 text-loog-muted">Base de associados — pessoa física/jurídica contratante do plano.</p>
        <AdminNav active="associados" />
      </section>
      <section className="container-loog mt-6">{children}</section>
    </main>
  );
}
