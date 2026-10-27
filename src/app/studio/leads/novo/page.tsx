import Link from "next/link";
import { LeadWizard } from "@/components/studio/leads/LeadWizard";

export const dynamic = "force-dynamic";

export default function NovoLeadPage() {
  return (
    <main className="mx-auto max-w-3xl p-5 pb-20">
      <div className="mb-5">
        <Link href="/studio/leads" className="text-sm text-loog-muted hover:text-white transition">
          ← Voltar aos leads
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-white">Novo Lead</h1>
        <p className="mt-1 text-sm text-loog-muted">
          Cotação completa com cadastro de contratante + veículo + documentos. Sincroniza automaticamente com SIVIS.
        </p>
      </div>
      <LeadWizard />
    </main>
  );
}
