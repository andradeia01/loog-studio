import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";
import { LoogLogo } from "@/components/ui/LoogMark";
import { AssignFromLink } from "@/components/sdr/AssignFromLink";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * /sdr/atribuir/[leadId]
 *
 * Página mobile-first pra admin atribuir rapidamente 1 lead a um consultor.
 * O link vem posto pela IA Tavinho no grupo "Leads LOOG" junto da mensagem
 * de cada lead novo.
 *
 * Fluxo:
 *   1. Admin recebe link no WhatsApp
 *   2. Toca → abre esta tela (ou faz login primeiro)
 *   3. Vê dados do lead + 4 cards grandes dos consultores
 *   4. Toque num consultor → atribui + confirma
 *   5. Lead cai no painel LOOG Studio do consultor
 */
export default async function AssignLeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;

  if (!supabaseConfigured()) {
    return <AlertShell>Supabase não configurado.</AlertShell>;
  }

  const auth = await currentUser();
  if (!auth) {
    // sem login → manda pro login mantendo redirect pro link
    redirect(`/login?next=${encodeURIComponent(`/sdr/atribuir/${leadId}`)}`);
  }

  if (auth.role !== "admin") {
    return (
      <AlertShell>
        🔒 Essa página é só pra administradores. Teu perfil: <b>{auth.role}</b>.
      </AlertShell>
    );
  }

  // Busca a lista de consultores aprovados (direto no DB)
  const supabase = await createSupabaseServer();
  const { data: consultoresRaw } = await supabase
    .from("profiles")
    .select("id, full_name, email, photo_url, role")
    .eq("status", "approved")
    .in("role", ["consultant", "consultant_sdr"])
    .order("full_name", { ascending: true });

  const consultores = (consultoresRaw ?? []).map((c) => ({
    id: c.id,
    full_name: c.full_name,
    email: c.email,
    photo_url: c.photo_url,
  }));

  // Busca atribuição atual do lead (pra marcar quem já tá nele, se houver)
  const { data: assignmentAtual } = await supabase
    .from("sdr_assignments")
    .select("consultant_id, assigned_at")
    .eq("lead_id", leadId)
    .maybeSingle();

  // Tenta buscar os detalhes do lead no Hub (via proxy /api/sdr/leads).
  // Não é crítico — se falhar, a tela ainda funciona só com o leadId.
  let leadInfo: { name?: string; phone?: string; lastMessage?: string } | null = null;
  try {
    const hubUrl = process.env.HUB_URL;
    const hubKey = process.env.HUB_INTERNAL_API_KEY;
    if (hubUrl && hubKey) {
      const r = await fetch(`${hubUrl}/v1/sdr/conversations`, {
        headers: { Authorization: `Bearer ${hubKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        const all = await r.json();
        const match = Array.isArray(all) ? all.find((l: { id?: string }) => l.id === leadId) : null;
        if (match) {
          leadInfo = {
            name: match.name,
            phone: match.phone,
            lastMessage: match.lastMessage,
          };
        }
      }
    }
  } catch { /* silencioso */ }

  return (
    <div className="min-h-screen bg-loog-bg text-loog-text">
      <header
        className="sticky top-0 z-10 border-b border-loog-border/60 bg-loog-bg/95 backdrop-blur-md"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/studio" className="flex items-center gap-2">
            <LoogLogo className="h-6" />
          </Link>
          <span className="text-[10px] font-semibold uppercase tracking-widest text-loog-brand">Direcionar lead</span>
        </div>
      </header>

      <main
        className="mx-auto max-w-md px-4 pb-24 pt-6"
        style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}
      >
        <AssignFromLink
          leadId={leadId}
          leadInfo={leadInfo}
          consultores={consultores}
          currentAssignment={assignmentAtual}
        />
      </main>
    </div>
  );
}

function AlertShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-loog-bg px-4 py-10 text-loog-text">
      <div className="mx-auto max-w-md rounded-xl border border-amber-500/40 bg-amber-500/10 p-6 text-center text-sm text-amber-200">
        {children}
      </div>
    </div>
  );
}
