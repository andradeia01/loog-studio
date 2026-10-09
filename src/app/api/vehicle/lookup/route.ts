import { NextRequest, NextResponse } from "next/server";
import { requireApproved } from "@/lib/auth";
import { consultarPlaca } from "@/lib/placafipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/vehicle/lookup?placa=XXX
 * Lookup leve de placa — só retorna dados do veículo (marca/modelo/ano/cor/FIPE).
 * Não gera cotação. Usado pela aba Vistoria pra pré-preencher o formulário.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApproved();
  if (!auth.ok) return auth.res;

  const placa = req.nextUrl.searchParams.get("placa");
  if (!placa || placa.length < 6) {
    return NextResponse.json({ error: "placa inválida" }, { status: 400 });
  }

  const r = await consultarPlaca(placa);
  if (!r.ok) {
    return NextResponse.json({
      error: r.error ?? "lookup_failed",
      message: r.message ?? "não foi possível identificar a placa",
      status: r.status,
    }, { status: r.status || 502 });
  }

  const v = r.veiculo;
  const fipe = r.fipe_recomendado;
  // Usa o texto completo do FIPE quando disponível (ex: "Palio Weekend Adventure LOCKER 1.8 Flex"),
  // porque o modelo cru da PlacaFIPE é abreviado e confunde o usuário.
  const marcaFinal = fipe?.marca || v.marca;
  const modeloFinal = fipe?.modelo || v.modelo;
  const anoFinal = Number(fipe?.ano_modelo || v.ano_modelo || v.ano || 0) || null;

  return NextResponse.json({
    ok: true,
    vehicle: {
      placa: v.placa,
      brand: marcaFinal,
      model: modeloFinal,
      year: anoFinal,
      color: v.cor,
      fuel: fipe?.combustivel ?? v.combustivel,
      fipeCode: fipe?.codigo_fipe ?? null,
      fipeFormatted: fipe?.valor_formatado ?? null,
      chassi: v.chassi,
      uf: v.uf,
      municipio: v.municipio,
    },
  });
}
