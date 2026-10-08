import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireApproved } from "@/lib/auth";
import { supabaseConfigured } from "@/lib/supabase/server";
import { quoteFromPlate, quoteFromText, HubError } from "@/lib/loog-hub";
import { registrarInteracaoCRM } from "@/lib/crm/registrar";
import { consultarPlaca, variantesPlaca, inferirTipoVeiculo } from "@/lib/placafipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  placa: z.string().min(7).max(10),
  tipo_veiculo: z.enum(["carro", "moto", "utilitario", "eletrico"]).optional(),
  cliente: z.object({
    nome: z.string().min(2).max(120),
    telefone: z.string().min(8).max(20),
    cpf: z.string().optional(),
    data_nascimento: z.string().optional(),
    cep: z.string().optional(),
    endereco: z.string().optional(),
    cidade: z.string().optional(),
    uf: z.string().optional(),
  }),
  leadId: z.string().optional(),
});

/**
 * Cotação COMPLETA — já com todos os dados do cliente (CPF, endereço, etc)
 * extraídos via OCR dos documentos. Dispara mesmo endpoint do Hub (from-plate)
 * mas enriquecendo o customer com os campos extras.
 */
export async function POST(req: NextRequest) {
  let consultorId: string | undefined;
  let groupId: string | null | undefined;
  if (supabaseConfigured()) {
    const auth = await requireApproved();
    if (!auth.ok) return auth.res;
    consultorId = auth.auth.userId;
    groupId = auth.auth.groupId;
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalido", details: parsed.error.flatten() }, { status: 400 });
  }

  const telDigits = parsed.data.cliente.telefone.replace(/[^0-9]/g, "");
  if (telDigits.length < 10) {
    return NextResponse.json({ error: "telefone_invalido", message: "Telefone precisa ter DDD + número." }, { status: 400 });
  }
  const customerPhone = telDigits.startsWith("55") ? telDigits : `55${telDigits}`;
  const leadIdFinal = parsed.data.leadId ?? (consultorId ? `loogstudio:${consultorId}` : undefined);

  // Payload de customer completo (CPF, endereço, CEP, cidade, UF) usado em ambos os caminhos
  const customerExtras = {
    customerName: parsed.data.cliente.nome,
    customerPhone,
    customerCpf: parsed.data.cliente.cpf?.replace(/[^0-9]/g, ""),
    customerBirthDate: parsed.data.cliente.data_nascimento,
    customerCep: parsed.data.cliente.cep?.replace(/[^0-9]/g, ""),
    customerAddress: parsed.data.cliente.endereco,
    customerCity: parsed.data.cliente.cidade,
    customerState: parsed.data.cliente.uf,
    leadId: leadIdFinal,
  };

  // ========================================================================
  // CAMINHO PRIMÁRIO: PlacaFIPE (API paga) → quoteFromText com cliente completo
  // ========================================================================
  try {
    const placafipe = await consultarPlaca(parsed.data.placa);
    if (placafipe.ok && placafipe.veiculo.marca && placafipe.veiculo.modelo) {
      const v = placafipe.veiculo;
      const fipe = placafipe.fipe_recomendado;

      // Preferir SEMPRE modelo+marca do catálogo FIPE (completos) sobre os
      // da base informacoes_veiculo (abreviados). Evita match errado.
      const marcaFinal = fipe?.marca || v.marca;
      const modeloFinal = fipe?.modelo || v.modelo;
      const anoModelo = Number(fipe?.ano_modelo || v.ano_modelo || v.ano || 0);

      if (anoModelo >= 1980 && marcaFinal && modeloFinal) {
        const placaPraHub = placafipe.veiculo.placa_alternativa ?? parsed.data.placa;
        const tipoInferido = inferirTipoVeiculo({
          segmento: v.segmento, sub_segmento: v.sub_segmento, combustivel: fipe?.combustivel ?? v.combustivel,
        });
        const vehicleTypeFinal = parsed.data.tipo_veiculo ?? tipoInferido ?? "carro";

        const result = await quoteFromText({
          brand: marcaFinal,
          model: modeloFinal,
          modelYear: anoModelo,
          fuel: fipe?.combustivel ?? v.combustivel ?? undefined,
          fipeCode: fipe?.codigo_fipe ?? undefined,
          vehicleType: vehicleTypeFinal,
          plate: placaPraHub,
          ...customerExtras,
        });

        if (consultorId) {
          void registrarInteracaoCRM({
            ownerId: consultorId,
            groupId,
            tipo: "cotacao_completa",
            nome: parsed.data.cliente.nome,
            telefone: parsed.data.cliente.telefone,
            cidade: parsed.data.cliente.cidade ?? v.municipio ?? null,
            payload: {
              via: "placafipe+from-text",
              placa: parsed.data.placa,
              marcaCurta: v.marca, modeloCurto: v.modelo,
              marca: marcaFinal, modelo: modeloFinal, ano: anoModelo,
              cor: v.cor, uf: v.uf, municipio: v.municipio,
              cpf: parsed.data.cliente.cpf ?? null,
              endereco: parsed.data.cliente.endereco ?? null,
              cep: parsed.data.cliente.cep ?? null,
              fipeCodigo: fipe?.codigo_fipe ?? null,
              fipeValor: fipe?.valor_formatado ?? null,
              fipeSimilaridade: fipe?.similaridade ?? null,
              vehicle: (result as { vehicle?: unknown }).vehicle ?? null,
              valorFipe: (result as { vehicle?: { fipeFormatted?: string } }).vehicle?.fipeFormatted ?? fipe?.valor_formatado ?? null,
              quoteId: (result as { quoteId?: string }).quoteId ?? null,
            },
          });
        }

        return NextResponse.json({ ok: true, via: "placafipe", ...result });
      }
    } else if (!placafipe.ok) {
      console.warn("[cotacao/completa] PlacaFIPE falhou (seguindo pra Hub):", placafipe.status, placafipe.message);
    }
  } catch (pfErr) {
    console.warn("[cotacao/completa] PlacaFIPE erro:", pfErr instanceof Error ? pfErr.message : pfErr);
  }

  // ========================================================================
  // FALLBACK: Hub quoteFromPlate — tenta variantes (Mercosul ↔ antiga)
  // ========================================================================
  const placasPraTentar = variantesPlaca(parsed.data.placa);
  let ultimoErro: unknown = null;

  for (const placaVariante of placasPraTentar) {
    try {
      const result = await quoteFromPlate({
        plate: placaVariante,
        vehicleType: parsed.data.tipo_veiculo,
        ...customerExtras,
      });

      if (consultorId) {
        void registrarInteracaoCRM({
          ownerId: consultorId,
          groupId,
          tipo: "cotacao_completa",
          nome: parsed.data.cliente.nome,
          telefone: parsed.data.cliente.telefone,
          cidade: parsed.data.cliente.cidade ?? null,
          payload: {
            via: placaVariante !== parsed.data.placa ? "hub-from-plate+variant" : "hub-from-plate",
            placa: parsed.data.placa,
            placaUsada: placaVariante,
            cpf: parsed.data.cliente.cpf ?? null,
            endereco: parsed.data.cliente.endereco ?? null,
            cep: parsed.data.cliente.cep ?? null,
            uf: parsed.data.cliente.uf ?? null,
            vehicle: (result as { vehicle?: unknown }).vehicle ?? null,
            valorFipe: (result as { vehicle?: { fipeFormatted?: string } }).vehicle?.fipeFormatted ?? null,
            quoteId: (result as { quoteId?: string }).quoteId ?? null,
          },
        });
      }

      return NextResponse.json({ ok: true, via: "hub-from-plate", placaUsada: placaVariante, ...result });
    } catch (err) {
      ultimoErro = err;
      if (err instanceof HubError) {
        console.warn(`[cotacao/completa] Hub falhou pra ${placaVariante}: ${err.status} ${err.message}`);
        continue;
      }
      break;
    }
  }

  // Nenhuma variante funcionou — processa o último erro
  {
    const err = ultimoErro;
    if (err instanceof HubError) {
      console.error("[cotacao/completa] HubError:", { status: err.status, code: err.code, message: err.message, placa: parsed.data.placa, payload: err.payload });
      let user: string;
      switch (err.status) {
        case 401: user = "Chave do sistema LOOG inválida ou sessão expirada. Fale com o admin."; break;
        case 403: user = "Placa bloqueada no provedor LOOG."; break;
        case 404: user = "Placa não encontrada no sistema oficial — verifique CRLV."; break;
        case 429: user = "Muitas consultas. Aguarde 30s."; break;
        case 408: case 504: user = "Provedor demorou demais. Tente de novo."; break;
        case 502: case 503: user = "Sistema interno LOOG indisponível no momento."; break;
        default: user = `Erro ao consultar placa (status ${err.status}). ${err.message}`;
      }
      return NextResponse.json({ error: err.code ?? "hub_error", message: user, status: err.status }, { status: err.status >= 400 && err.status < 500 ? err.status : 502 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cotacao/completa] erro nao-Hub:", msg);
    return NextResponse.json({ error: "falha", message: msg }, { status: 500 });
  }
}
