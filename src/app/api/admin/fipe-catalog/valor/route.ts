import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Busca valor FIPE REAL (via API parallelum) pra um veiculo escolhido pelo
 * consultor no fluxo "0km sem placa".
 *
 * Query params: tipo (carros|motos|caminhoes), marca (codigo FIPE), modelo (codigo FIPE)
 * Devolve: { anos: [{codigo, valor_cents, valor_formatted, combustivel}, ...] }
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tipo = sp.get("tipo") ?? "carros";
  const marca = sp.get("marca");
  const modelo = sp.get("modelo");

  if (!["carros", "motos", "caminhoes"].includes(tipo)) {
    return NextResponse.json({ error: "tipo invalido" }, { status: 400 });
  }
  if (!marca || !modelo) {
    return NextResponse.json({ error: "marca e modelo obrigatorios" }, { status: 400 });
  }

  try {
    const anosUrl = `https://parallelum.com.br/fipe/api/v1/${tipo}/marcas/${marca}/modelos/${modelo}/anos`;
    const anosResp = await fetch(anosUrl, {
      headers: { "User-Agent": "LOOG-Studio/1.0", "Accept": "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!anosResp.ok) {
      return NextResponse.json({ error: "fipe_falhou", status: anosResp.status }, { status: 502 });
    }
    const anos = await anosResp.json() as Array<{ codigo: string; nome: string }>;
    if (!Array.isArray(anos) || anos.length === 0) {
      return NextResponse.json({ anos: [] });
    }

    // Pega detalhe de ate 10 anos mais recentes (em paralelo)
    const anosRelevantes = anos.slice(0, 10);
    const detalhes = await Promise.all(
      anosRelevantes.map(async (a) => {
        try {
          const detUrl = `https://parallelum.com.br/fipe/api/v1/${tipo}/marcas/${marca}/modelos/${modelo}/anos/${a.codigo}`;
          const r = await fetch(detUrl, {
            headers: { "User-Agent": "LOOG-Studio/1.0", "Accept": "application/json" },
            signal: AbortSignal.timeout(10_000),
          });
          if (!r.ok) return null;
          const j = await r.json();
          const valorStr = String(j.Valor ?? "0").replace("R$ ", "").replace(/\./g, "").replace(",", ".");
          const valorCents = Math.round(parseFloat(valorStr) * 100);
          return {
            codigo: a.codigo,
            ano_modelo: Number(j.AnoModelo ?? 0),
            combustivel: j.Combustivel ?? "",
            valor_cents: valorCents,
            valor_formatted: j.Valor ?? "",
            fipe_code: j.CodigoFipe ?? "",
          };
        } catch { return null; }
      })
    );

    return NextResponse.json({
      anos: detalhes.filter((d) => d !== null),
    });
  } catch (err) {
    return NextResponse.json({
      error: "falha",
      message: err instanceof Error ? err.message : "erro",
    }, { status: 500 });
  }
}
