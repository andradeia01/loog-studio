export interface QuickQuoteCustomer {
  name: string;
  phone: string;
  sourceId?: number;
}

export interface QuickQuoteVehicle {
  plate: string;
  brand: string;
  brandCode?: string;
  model: string;
  modelCode?: string;
  modelYear: number;
  modelYearCode?: string;
  fuel?: string;
  fuelInitial?: string;
  vehicleType?: number;
  fipeCode: string;
  fipeValueCents: number;
  fipeMonth: string;
}

export interface QuickQuoteInput {
  idempotencyKey: string;
  leadId?: string;
  customer: QuickQuoteCustomer;
  vehicle: QuickQuoteVehicle;
  productId?: number | string;
}

export interface QuickQuotePlan {
  productId: string | number;
  name: string;
  monthlyValueCents?: number;
  monthlyValueFormatted?: string;
  joinFeeValueCents?: number;
  joinFeeFormatted?: string;
  defaultServices?: Array<{ id: string; name: string; valueFormatted: string }>;
  defaultCoverages?: Array<{ id: string; name: string; valueFormatted: string }>;
  raw?: Record<string, unknown>;
}

export interface QuickQuoteResult {
  quoteId: string;
  provider: string;
  plan?: QuickQuotePlan;
  whatsappMessage?: string;
  portalUrl?: string;
  /** Direct Sivisweb print URL that renders the printable HTML proposal. */
  printUrl?: string;
  /** Public Hub URL that streams the PDF (fetches from Sivisweb server-side). */
  pdfUrl?: string;
  raw?: Record<string, unknown>;
}

export interface QuoteProvider {
  readonly name: string;
  createQuickQuote(input: QuickQuoteInput): Promise<QuickQuoteResult>;
}
