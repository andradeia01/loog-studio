export interface PlateLookupResult {
  plate: string;
  brand: string;
  model: string;
  modelYear: number;
  manufactureYear?: number;
  fuel?: string;
  fuelInitial?: string;
  color?: string;
  chassis?: string;
  city?: string;
  state?: string;
  /** Populated only by providers that already resolve FIPE (e.g. placafipe). */
  fipeCode?: string;
  /** Table month string (e.g. "Setembro de 2026") when the provider returns it. */
  fipeReferenceMonth?: string;
  /** Best-match FIPE value in cents (avoids float precision issues). */
  fipeValueCents?: number;
  provider: string;
  raw?: Record<string, unknown>;
}

export interface PlateLookupProvider {
  readonly name: string;
  lookupByPlate(plate: string): Promise<PlateLookupResult | null>;
}
