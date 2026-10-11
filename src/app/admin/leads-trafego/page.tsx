import { redirect } from "next/navigation";
import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { currentUser } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { LeadsTrafegoReport } from "@/components/admin/LeadsTrafegoReport";

export const dynamic = "force-dynamic";

export default async function LeadsTrafegoPage() {
  if (!supabaseConfigured()) {
    return <Shell><p className="text-loog-muted">Supabase não configurado.</p></Shell>;
  }
  const auth = await currentUser();
  if (!auth) redirect("/login?next=/admin/leads-trafego");
  if (auth.role !== "admin") {
    return <Shell><p className="text-amber-200">🔒 Acesso só pra administradores.</p></Shell>;
  }
  return (
    <Shell>
      <LeadsTrafegoReport />
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
        <h1 className="font-display text-3xl font-bold">Leads por tráfego</h1>
        <p className="mt-1 text-loog-muted">De onde cada lead veio (UTM, Meta, Google) + taxa de conversão por campanha.</p>
        <AdminNav active="leads-trafego" />
      </section>
      <section className="container-loog mt-6">{children}</section>
    </main>
  );
}
