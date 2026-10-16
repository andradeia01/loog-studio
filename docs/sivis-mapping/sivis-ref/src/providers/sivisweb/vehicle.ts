import { DomainError } from '../../lib/errors.js';
import type { VehicleLookupResult, VehicleProvider } from '../vehicle/types.js';
import type { SivisWebSessionManager } from './session.js';

interface SivisWebVehiclePayload {
  Marca?: string;
  Modelo?: string;
  AnoModelo?: number;
  Combustivel?: string;
  SiglaCombustivel?: string;
  CodigoFipe?: string;
  Valor?: string;
  MesReferencia?: string;
  TipoVeiculo?: number;
  Placa?: string;
}

function parseBrlToCents(input: string | undefined | null): number | undefined {
  if (!input) return undefined;
  const digits = input.replace(/[^\d,]/g, '').replace(',', '.');
  if (!digits) return undefined;
  const n = Number(digits);
  if (Number.isNaN(n)) return undefined;
  return Math.round(n * 100);
}

export class SivisWebVehicleProvider implements VehicleProvider {
  readonly name = 'sivisweb';
  constructor(
    private readonly sessions: SivisWebSessionManager,
    private readonly storeId: string,
  ) {}

  async lookupByPlate(plate: string): Promise<VehicleLookupResult | null> {
    const http = await this.sessions.getConsultorSession();
    const { status, body } = await http.request<SivisWebVehiclePayload | null>(
      `/loja/${this.storeId}/api/portal/veiculo`,
      {
        method: 'GET',
        ajax: true,
        query: {
          functionPage: 'BuscaPlaca',
          placa: plate,
          id_veiculo: '',
        },
        expectStatuses: [200, 404],
      },
    );
    if (status === 404 || !body || typeof body !== 'object') return null;
    const p = body;
    if (!p.Marca || !p.Modelo) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: 'Sivisweb BuscaPlaca returned an unexpected shape.',
        retryable: true,
      });
    }
    return {
      plate: p.Placa ?? plate,
      brand: p.Marca,
      model: p.Modelo,
      modelYear: p.AnoModelo ?? 0,
      ...(p.Combustivel ? { fuel: p.Combustivel } : {}),
      ...(p.SiglaCombustivel ? { fuelInitial: p.SiglaCombustivel } : {}),
      ...(p.TipoVeiculo !== undefined ? { vehicleType: p.TipoVeiculo } : {}),
      ...(p.CodigoFipe ? { fipeCode: p.CodigoFipe } : {}),
      ...(parseBrlToCents(p.Valor) !== undefined
        ? { fipeValueCents: parseBrlToCents(p.Valor)! }
        : {}),
      ...(p.MesReferencia ? { fipeMonth: p.MesReferencia.trim() } : {}),
      provider: 'sivisweb',
      raw: p as unknown as Record<string, unknown>,
    };
  }
}
