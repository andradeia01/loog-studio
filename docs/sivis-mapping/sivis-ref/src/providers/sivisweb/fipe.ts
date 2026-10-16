import { DomainError } from '../../lib/errors.js';
import type { FipeLookupInput, FipeProvider, FipeResult } from '../fipe/types.js';
import { CookieJar } from './cookies.js';
import { makeSivisWebHttpClient } from './http.js';

const FIPE_ORIGIN = 'https://sivisweb.com.br';

interface FipeVeiculoPayload {
  Valor: string;
  Marca: string;
  Modelo: string;
  AnoModelo: number;
  Combustivel: string;
  CodigoFipe: string;
  MesReferencia: string;
  SiglaCombustivel: string;
  TipoVeiculo: number;
}

function parseBrlToCents(input: string | undefined | null): number | undefined {
  if (!input) return undefined;
  const digits = input.replace(/[^\d,]/g, '').replace(',', '.');
  if (!digits) return undefined;
  const n = Number(digits);
  if (Number.isNaN(n)) return undefined;
  return Math.round(n * 100);
}

/**
 * Sivisweb exposes the FIPE table at sivisweb.com.br/Modulos/Seguro/ajax/fipejson.php.
 * These endpoints do NOT require a logged-in session; they are keyed by contrato (storeId).
 */
export class SivisWebFipeProvider implements FipeProvider {
  readonly name = 'sivisweb';
  private readonly http = makeSivisWebHttpClient(FIPE_ORIGIN, new CookieJar());

  constructor(private readonly storeId: string) {}

  async lookup(input: FipeLookupInput): Promise<FipeResult | null> {
    // Full lookup requires the Sivisweb identifiers (brandCode + modelCode + modelYearCode).
    // If any is missing we cannot resolve the vehicle deterministically here.
    if (!input.brandCode || !input.modelCode || !input.modelYearCode) return null;

    const { body } = await this.http.request<FipeVeiculoPayload>(
      '/Modulos/Seguro/ajax/fipejson.php',
      {
        method: 'GET',
        query: {
          functionPage: 'getVeiculo',
          codMarca: input.brandCode,
          codModelo: input.modelCode,
          tipo: input.vehicleType ?? 1,
          tipoFipe: 0,
          codAno: input.modelYearCode,
          contrato: this.storeId,
          valor: '',
        },
      },
    );

    if (!body || typeof body !== 'object' || !body.Valor) {
      throw new DomainError({
        code: 'FIPE_NOT_FOUND',
        message: 'Sivisweb FIPE getVeiculo returned an empty payload.',
      });
    }
    const cents = parseBrlToCents(body.Valor) ?? 0;
    return {
      fipeCode: body.CodigoFipe,
      brand: body.Marca,
      ...(input.brandCode ? { brandCode: input.brandCode } : {}),
      model: body.Modelo,
      ...(input.modelCode ? { modelCode: input.modelCode } : {}),
      modelYear: body.AnoModelo,
      ...(input.modelYearCode ? { modelYearCode: input.modelYearCode } : {}),
      ...(body.Combustivel ? { fuel: body.Combustivel } : {}),
      ...(body.SiglaCombustivel ? { fuelInitial: body.SiglaCombustivel } : {}),
      referenceMonth: body.MesReferencia.trim(),
      valueCents: cents,
      formattedValue: body.Valor,
      provider: 'sivisweb',
      raw: body as unknown as Record<string, unknown>,
    };
  }
}
