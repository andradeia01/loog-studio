import type { VehicleLookupResult, VehicleProvider } from './types.js';

const KNOWN: Record<string, VehicleLookupResult> = {
  ABC1D23: {
    plate: 'ABC1D23',
    brand: 'BMW',
    brandCode: '7',
    model: '320i M Sport 2.0 Turbo',
    version: 'M Sport 2.0 Turbo',
    manufactureYear: 2021,
    modelYear: 2022,
    modelYearCode: '2022-3',
    fuel: 'Gasolina',
    fuelInitial: 'G',
    vehicleType: 1,
    fipeCode: '009XXX-X',
    fipeValueCents: 21_648_000,
    fipeMonth: 'setembro de 2026',
    provider: 'mock',
  },
};

export class MockVehicleProvider implements VehicleProvider {
  readonly name = 'mock';
  async lookupByPlate(plate: string): Promise<VehicleLookupResult | null> {
    return KNOWN[plate] ?? null;
  }
}
