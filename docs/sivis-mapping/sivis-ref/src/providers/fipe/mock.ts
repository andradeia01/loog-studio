import type { FipeLookupInput, FipeProvider, FipeResult } from './types.js';

export class MockFipeProvider implements FipeProvider {
  readonly name = 'mock';
  async lookup(input: FipeLookupInput): Promise<FipeResult | null> {
    if (!input.fipeCode) return null;
    return {
      fipeCode: input.fipeCode,
      brand: input.brand ?? 'BMW',
      model: input.model ?? '320i M Sport',
      modelYear: input.modelYear ?? 2022,
      referenceMonth: 'setembro de 2026',
      valueCents: 21_648_000,
      formattedValue: 'R$ 216.480,00',
      provider: 'mock',
    };
  }
}
