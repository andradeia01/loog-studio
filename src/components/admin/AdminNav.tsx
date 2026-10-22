import Link from "next/link";
import { cn } from "@/lib/utils";

type Key =
  | "templates"
  | "consultores"
  | "artes-prontas"
  | "videos-prontos"
  | "fidelidade"
  | "leads-trafego"
  | "vistorias"
  | "planos"
  | "associados"
  | "veiculos"
  | "signatarios"
  | "infra"
  | "triplice"
  | "config";

const TABS: { key: Key; label: string; href: string }[] = [
  { key: "templates", label: "Templates", href: "/admin" },
  { key: "consultores", label: "Consultores", href: "/admin/consultores" },
  { key: "associados", label: "Associados 👥", href: "/admin/associados" },
  { key: "veiculos", label: "Veículos 🚗", href: "/admin/veiculos" },
  { key: "planos", label: "Planos 💰", href: "/admin/planos" },
  { key: "signatarios", label: "Signatários ✍️", href: "/admin/signatarios" },
  { key: "triplice", label: "Tríplice 🔱", href: "/admin/triplice" },
  { key: "infra", label: "Infra 🛠️", href: "/admin/infra" },
  { key: "artes-prontas", label: "Artes", href: "/admin/artes-prontas" },
  { key: "videos-prontos", label: "Vídeos", href: "/admin/videos-prontos" },
  { key: "fidelidade", label: "Fidelidade 🔥", href: "/admin/fidelidade" },
  { key: "leads-trafego", label: "Tráfego 📊", href: "/admin/leads-trafego" },
  { key: "vistorias", label: "Vistorias 🎥", href: "/admin/vistorias" },
  { key: "config", label: "Configurações", href: "/admin/config" },
];

export function AdminNav({ active, pendingCount }: { active?: Key; pendingCount?: number }) {
  return (
    <nav className="mt-6 inline-flex rounded-2xl border border-loog-border bg-loog-panel p-1">
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "relative rounded-xl px-4 py-2 text-sm font-semibold transition",
              isActive ? "bg-loog-brand text-white shadow-glow" : "text-loog-muted hover:text-white",
            )}
          >
            {t.label}
            {t.key === "consultores" && !!pendingCount && (
              <span className="ml-2 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
