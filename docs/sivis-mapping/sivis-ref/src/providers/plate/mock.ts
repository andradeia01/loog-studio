import type { PlateLookupProvider, PlateLookupResult } from './types.js';

const KNOWN: Record<string, PlateLookupResult> = {
  ABC1D23: {
    plate: 'ABC1D23',
    brand: 'BMW',
    model: '320i M Sport 2.0 Turbo',
    modelYear: 2022,
    manufactureYear: 2021,
    fuel: 'GASOLINA',
    fuelInitial: 'G',
    provider: 'mock',
  },
  TST1L23: {
    plate: 'TST1L23',
    brand: 'FORD',
    model: 'KA 1.5 SEDAN SE',
    modelYear: 2021,
    manufactureYear: 2020,
    fuel: 'FLEX',
    fuelInitial: 'F',
    provider: 'mock',
  },
};

export class MockPlateLookupProvider implements PlateLookupProvider {
  readonly name = 'mock';
  async lookupByPlate(plate: string): Promise<PlateLookupResult | null> {
    return KNOWN[plate] ?? null;
  }
}
