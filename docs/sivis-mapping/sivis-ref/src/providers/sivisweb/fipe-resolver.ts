import { CookieJar } from './cookies.js';
import { makeSivisWebHttpClient, type SivisWebHttpClient } from './http.js';

/**
 * Resolve Sivisweb internal codes + FIPE value from free-text vehicle
 * information (brand / model / year / fuel). Uses the public fipejson.php
 * chain — no authenticated session required.
 */
export interface ResolveByTextInput {
  brand: string;
  model: string;
  modelYear: number;
  fuel?: string;
  fuelInitial?: string;
  vehicleType?: number;
}

export interface ResolveByTextResult {
  brand: string;
  brandCode: string;
  model: string;
  modelCode: string;
  modelYear: number;
  modelYearCode: string;
  fuel?: string;
  fuelInitial?: string;
  fipeCode: string;
  referenceMonth: string;
  valueCents: number;
  formattedValue: string;
  confidence: number;
  provider: 'sivisweb';
}

interface FipeMarca {
  Label: string;
  Value: string;
}
interface FipeModelo {
  Label: string;
  Value: string;
}
interface FipeVeiculo {
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

const FIPE_ORIGIN = 'https://sivisweb.com.br';

function normalizeTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(/(\d+)\.(\d+)/g, '$1 $2')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function coverageScore(needle: string, haystack: string): number {
  const need = normalizeTokens(needle);
  if (need.length === 0) return 0;
  const hay = new Set(normalizeTokens(haystack));
  let matches = 0;
  for (const t of need) if (hay.has(t)) matches += 1;
  return matches / need.length;
}

function bestMatch<T>(
  target: string,
  items: T[],
  getText: (t: T) => string,
): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const it of items) {
    const s = coverageScore(target, getText(it));
    if (!best || s > best.score) best = { item: it, score: s };
  }
  return best;
}

function parseBrlToCents(input: string | undefined | null): number {
  if (!input) return 0;
  const digits = input.replace(/[^\d,]/g, '').replace(',', '.');
  const n = Number(digits);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function fuelSuffixOrder(fuelInitial?: string, fuel?: string): string[] {
  const f = (fuelInitial ?? '').toUpperCase();
  const label = (fuel ?? '').toUpperCase();
  if (f === 'F' || label.includes('FLEX')) return ['5', '1', '3', '2', '6'];
  if (f === 'G' || label.includes('GASOL')) return ['1', '5', '3', '2', '6'];
  if (f === 'D' || label.includes('DIESEL')) return ['3', '5', '1', '2', '6'];
  if (f === 'A' || label.includes('ALCOOL') || label.includes('ETANOL'))
    return ['2', '5', '1', '3', '6'];
  if (f === 'H' || label.includes('HIBR')) return ['6', '5', '1', '3', '2'];
  if (f === 'E' || label.includes('ELET')) return ['6', '5', '1', '3', '2'];
  return ['5', '1', '3', '2', '6'];
}

export class SivisWebFipeResolver {
  private readonly http: SivisWebHttpClient;
  constructor(private readonly storeId: string) {
    this.http = makeSivisWebHttpClient(FIPE_ORIGIN, new CookieJar());
  }

  private async getBrands(vehicleType: number): Promise<FipeMarca[]> {
    const { body } = await this.http.request<FipeMarca[]>('/Modulos/Seguro/ajax/fipejson.php', {
      method: 'GET',
      query: {
        functionPage: 'getMarca',
        tipo: vehicleType,
        tipoFipe: 0,
        contrato: this.storeId,
      },
    });
    return Array.isArray(body) ? body : [];
  }

  private async getModelsByYear(
    codMarca: string,
    codAno: string,
    vehicleType: number,
  ): Promise<FipeModelo[]> {
    const { body } = await this.http.request<FipeModelo[]>(
      '/Modulos/Seguro/ajax/fipejson.php',
      {
        method: 'GET',
        query: {
          functionPage: 'getModeloPorAno',
          codMarca,
          codAno,
          tipo: vehicleType,
          tipoFipe: 0,
          contrato: this.storeId,
        },
      },
    );
    return Array.isArray(body) ? body : [];
  }

  private async getVeiculo(
    codMarca: string,
    codModelo: string,
    codAno: string,
    vehicleType: number,
  ): Promise<FipeVeiculo | null> {
    const { body } = await this.http.request<FipeVeiculo>(
      '/Modulos/Seguro/ajax/fipejson.php',
      {
        method: 'GET',
        query: {
          functionPage: 'getVeiculo',
          codMarca,
          codModelo,
          tipo: vehicleType,
          tipoFipe: 0,
          codAno,
          contrato: this.storeId,
          valor: '',
        },
      },
    );
    if (!body || typeof body !== 'object' || !body.Valor) return null;
    return body;
  }

  async resolveByText(input: ResolveByTextInput): Promise<ResolveByTextResult | null> {
    const vehicleType = input.vehicleType ?? 1;

    const brands = await this.getBrands(vehicleType);
    const brandMatch = bestMatch(input.brand, brands, (b) => b.Label);
    if (!brandMatch || brandMatch.score < 0.5) return null;

    const suffixes = fuelSuffixOrder(input.fuelInitial, input.fuel);
    let picked: {
      codAno: string;
      brandMatchScore: number;
      model: FipeModelo;
      modelScore: number;
    } | null = null;

    for (const suffix of suffixes) {
      const codAno = `${input.modelYear}-${suffix}`;
      const models = await this.getModelsByYear(brandMatch.item.Value, codAno, vehicleType);
      if (models.length === 0) continue;
      const modelMatch = bestMatch(input.model, models, (m) => m.Label);
      if (!modelMatch) continue;
      // require reasonable coverage AND a plausible gap over the runner-up
      if (modelMatch.score < 0.5) continue;
      picked = {
        codAno,
        brandMatchScore: brandMatch.score,
        model: modelMatch.item,
        modelScore: modelMatch.score,
      };
      break;
    }

    if (!picked) return null;

    const veiculo = await this.getVeiculo(
      brandMatch.item.Value,
      picked.model.Value,
      picked.codAno,
      vehicleType,
    );
    if (!veiculo) return null;

    return {
      brand: veiculo.Marca,
      brandCode: brandMatch.item.Value,
      model: veiculo.Modelo,
      modelCode: picked.model.Value,
      modelYear: veiculo.AnoModelo,
      modelYearCode: picked.codAno,
      ...(veiculo.Combustivel ? { fuel: veiculo.Combustivel } : {}),
      ...(veiculo.SiglaCombustivel ? { fuelInitial: veiculo.SiglaCombustivel } : {}),
      fipeCode: veiculo.CodigoFipe,
      referenceMonth: veiculo.MesReferencia.trim(),
      valueCents: parseBrlToCents(veiculo.Valor),
      formattedValue: veiculo.Valor,
      confidence: (picked.brandMatchScore + picked.modelScore) / 2,
      provider: 'sivisweb',
    };
  }
}
