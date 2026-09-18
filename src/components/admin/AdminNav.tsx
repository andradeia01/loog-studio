import Link from "next/link";
import { cn } from "@/lib/utils";

type Key = "templates" | "consultores" | "artes-prontas";

const TABS: { key: Key; label: string; href: string }[] = [
  { key: "templates", label: "Templates", href: "/admin" },
  { key: "consultores", label: "Consultores", href: "/admin/consultores" },
  { key: "artes-prontas", label: "Artes prontas", href: "/admin/artes-prontas" },
];

export function AdminNav({ active, pendingCount }: { active: Key; pendingCount?: number }) {
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
