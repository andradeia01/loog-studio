export interface VehicleLookupResult {
  plate: string;
  brand: string;
  brandCode?: string;
  model: string;
  modelCode?: string;
  version?: string;
  manufactureYear?: number;
  modelYear: number;
  modelYearCode?: string;
  fuel?: string;
  fuelInitial?: string;
  vehicleType?: string | number;
  fipeCode?: string;
  fipeValueCents?: number;
  fipeMonth?: string;
  provider: string;
  raw?: Record<string, unknown>;
}

export interface VehicleProvider {
  readonly name: string;
  lookupByPlate(plate: string): Promise<VehicleLookupResult | null>;
}
