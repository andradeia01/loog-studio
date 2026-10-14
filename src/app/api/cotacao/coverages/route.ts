import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIPOS = ["carro", "moto", "utilitario", "eletrico", "caminhao"] as const;
type Tipo = (typeof TIPOS)[number];

/**
 * GET /api/cotacao/coverages?tipo=carro
 * Lista as coberturas opcionais disponíveis pro tipo de veículo informado.
 * Usado pela UI pra montar os toggles agrupados.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const url = new URL(req.url);
  const tipoRaw = (url.searchParams.get("tipo") ?? "carro").toLowerCase() as Tipo;
  const tipo: Tipo = TIPOS.includes(tipoRaw) ? tipoRaw : "carro";

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("cotacao_coverages")
    .select("codigo, grupo, grupo_label, descricao, nivel, exclusivo, delta_cents, ordem")
    .eq("tipo_veiculo", tipo)
    .eq("ativo", true)
    .order("ordem", { ascending: true })
    .order("nivel", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Agrupa por grupo pra UI consumir fácil
  const porGrupo: Record<string, { grupo: string; label: string; exclusivo: boolean; opcoes: typeof data }> = {};
  for (const row of data ?? []) {
    if (!porGrupo[row.grupo]) {
      porGrupo[row.grupo] = { grupo: row.grupo, label: row.grupo_label, exclusivo: row.exclusivo, opcoes: [] };
    }
    porGrupo[row.grupo].opcoes.push(row);
  }

  return NextResponse.json({
    tipo,
    grupos: Object.values(porGrupo),
    raw: data ?? [],
  });
}
