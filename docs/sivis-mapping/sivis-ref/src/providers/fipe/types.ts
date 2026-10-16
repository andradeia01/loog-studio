export interface FipeLookupInput {
  fipeCode?: string;
  brand?: string;
  brandCode?: string;
  model?: string;
  modelCode?: string;
  modelYear?: number;
  modelYearCode?: string;
  vehicleType?: number;
}

export interface FipeResult {
  fipeCode: string;
  brand: string;
  brandCode?: string;
  model: string;
  modelCode?: string;
  modelYear: number;
  modelYearCode?: string;
  fuel?: string;
  fuelInitial?: string;
  referenceMonth: string;
  valueCents: number;
  formattedValue: string;
  provider: string;
  raw?: Record<string, unknown>;
}

export interface FipeProvider {
  readonly name: string;
  lookup(input: FipeLookupInput): Promise<FipeResult | null>;
}
