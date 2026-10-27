import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer, supabaseConfigured } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Busca inteligente no catalogo FIPE pra o admin montar bloqueios.
 *
 * Query params:
 *   tipo  = carros | motos | caminhoes  (obrigatorio)
 *   q     = texto livre (busca em nome de marca OU nome de modelo)
 *   marca = codigo da marca (quando usuario ja selecionou — devolve so modelos daquela marca)
 */
export async function GET(req: NextRequest) {
  if (!supabaseConfigured()) return NextResponse.json({ marcas: [], modelos: [] });
  const sp = req.nextUrl.searchParams;
  const tipo = sp.get("tipo") ?? "carros";
  const q = (sp.get("q") ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const marca = sp.get("marca");

  if (!["carros", "motos", "caminhoes"].includes(tipo)) {
    return NextResponse.json({ error: "tipo invalido" }, { status: 400 });
  }

  const supabase = await createSupabaseServer();

  if (marca) {
    // Lista modelos daquela marca, opcionalmente filtrados
    let qb = supabase
      .from("fipe_catalog_modelos")
      .select("codigo, nome, marca_codigo, marca_nome")
      .eq("tipo", tipo)
      .eq("marca_codigo", marca)
      .order("nome")
      .limit(200);
    if (q) qb = qb.ilike("nome_norm", `%${q}%`);
    const { data } = await qb;
    return NextResponse.json({ modelos: data ?? [] });
  }

  // Lista marcas filtradas
  let qb = supabase
    .from("fipe_catalog_marcas")
    .select("codigo, nome")
    .eq("tipo", tipo)
    .order("nome")
    .limit(150);
  if (q) qb = qb.ilike("nome_norm", `%${q}%`);
  const { data: marcas } = await qb;

  return NextResponse.json({ marcas: marcas ?? [] });
}
