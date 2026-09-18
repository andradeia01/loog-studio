import { LoogLogo } from "@/components/ui/LoogMark";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RejectedPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  let reason: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("rejected_reason")
      .eq("id", user.id)
      .maybeSingle();
    reason = data?.rejected_reason ?? null;
  }
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-10 text-center">
      <div className="relative w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center gap-3">
          <LoogLogo className="h-10" priority />
        </div>
        <div className="card space-y-4 p-8">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-2xl">⛔</div>
          <h1 className="font-display text-2xl font-bold">Cadastro não aprovado</h1>
          <p className="text-sm text-loog-muted">
            Seu cadastro não foi aprovado pelo gestor LOOG.
          </p>
          {reason && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-left text-xs text-red-200">
              <div className="mb-1 font-semibold uppercase tracking-widest">Motivo</div>
              {reason}
            </div>
          )}
          <p className="text-xs text-loog-muted">
            Se acredita que houve engano, entre em contato com o seu gestor.
          </p>
          <LogoutButton className="btn-ghost w-full" />
        </div>
      </div>
    </main>
  );
}
