import Link from "next/link";
import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { AdminNav } from "@/components/admin/AdminNav";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { VehiclesManager, type VehicleRow, type RestrictionRow } from "@/components/admin/VehiclesManager";

export const dynamic = "force-dynamic";

export default async function VeiculosPage() {
  if (!supabaseConfigured()) {
    return (
      <Shell>
        <p className="text-loog-muted">Supabase não configurado.</p>
      </Shell>
    );
  }

  const supabase = await createSupabaseServer();
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, placa, tipo, marca, modelo, ano_modelo, fipe_code, fipe_value_cents, active, member_id, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const { data: restrictions } = await supabase
    .from("vehicle_restrictions")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <Shell>
      <VehiclesManager
        initialVehicles={(vehicles ?? []) as VehicleRow[]}
        initialRestrictions={(restrictions ?? []) as RestrictionRow[]}
      />
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
        <h1 className="font-display text-3xl font-bold">Veículos & Bloqueios</h1>
        <p className="mt-1 text-loog-muted">
          Lista de veículos cadastrados + <strong className="text-white">lista negra</strong> para impedir cotação de modelos específicos.
        </p>
        <AdminNav active="veiculos" />
      </section>
      <section className="container-loog mt-6">{children}</section>
    </main>
  );
}
