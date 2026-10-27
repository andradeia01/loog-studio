import Link from "next/link";
import { SivisCredentialsForm } from "@/components/studio/leads/SivisCredentialsForm";

export const dynamic = "force-dynamic";

export default function SivisConfigPage() {
  return (
    <main className="mx-auto max-w-4xl p-5 pb-20">
      <div className="mb-5">
        <Link href="/studio/leads" className="text-sm text-loog-muted hover:text-white transition">
          ← Voltar aos leads
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-white">Configurações SIVIS</h1>
        <p className="mt-1 text-sm text-loog-muted">
          Suas credenciais SIVIS que o LOOG Studio usa pra espelhar leads invisivelmente.
        </p>
      </div>
      <SivisCredentialsForm />
    </main>
  );
}
