export type Stage =
  | 'NEW_LEAD'
  | 'GREETING'
  | 'VEHICLE_CAPTURE'
  | 'VEHICLE_CONFIRMATION'
  | 'PAIN_DISCOVERY'
  | 'PRE_QUOTE'
  | 'QUOTE_PRESENTED'
  | 'OBJECTION_HANDLING'
  | 'CLOSING'
  | 'HUMAN_HANDOFF'
  | 'WON'
  | 'LOST'
  | 'NURTURE';

export const STAGES: Stage[] = [
  'NEW_LEAD',
  'GREETING',
  'VEHICLE_CAPTURE',
  'VEHICLE_CONFIRMATION',
  'PAIN_DISCOVERY',
  'PRE_QUOTE',
  'QUOTE_PRESENTED',
  'OBJECTION_HANDLING',
  'CLOSING',
  'HUMAN_HANDOFF',
  'WON',
  'LOST',
  'NURTURE',
];

export interface VehicleSnapshot {
  plate?: string;
  brand?: string;
  brandCode?: string;
  model?: string;
  modelCode?: string;
  modelYear?: number;
  modelYearCode?: string;
  fuel?: string;
  fuelInitial?: string;
  vehicleType?: number;
  fipeCode?: string;
  fipeValueCents?: number;
  fipeMonth?: string;
  confirmed: boolean;
}

export interface CustomerSnapshot {
  name?: string;
  phone: string;
  cpf?: string;
  email?: string;
  address?: string;
}

export interface QuoteSnapshot {
  quoteId: string;
  monthlyValueCents?: number;
  monthlyValueFormatted?: string;
  joinFeeCents?: number;
  joinFeeFormatted?: string;
  planName: string;
  portalUrl?: string;
  whatsappMessage?: string;
  createdAt: string;
}

export interface ConversationMessage {
  id: string;
  ts: string;
  from: 'lead' | 'sdr' | 'system';
  text: string;
}

export interface Conversation {
  leadId: string;
  phone: string;
  displayName?: string;
  stage: Stage;
  vehicle: VehicleSnapshot;
  customer: CustomerSnapshot;
  pain?: string;
  objection?: string;
  quote?: QuoteSnapshot;
  handoffReason?: string;
  createdAt: string;
  updatedAt: string;
  history: ConversationMessage[];
}
