"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export function LogoutButton({ className, label = "Sair" }: { className?: string; label?: string }) {
  const router = useRouter();
  async function onClick() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }
  return (
    <button type="button" onClick={onClick} className={cn("btn-ghost", className)}>
      {label}
    </button>
  );
}
