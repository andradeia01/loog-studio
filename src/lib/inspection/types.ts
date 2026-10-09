export type InspectionStatus =
  | "DRAFT"
  | "RECORDING"
  | "UPLOADING"
  | "PROCESSING"
  | "APPROVED"
  | "REJECTED"
  | "NEEDS_REVIEW";

export type InspectionMode = "PRESENCIAL" | "REMOTE";

export type InspectionTipo = "NOVA" | "MIGRACAO";

export type CaptureKind =
  | "OPERATOR_SELFIE"
  | "VIDEO"
  | "FRAME"
  | "ODOMETER_PHOTO"
  | "CHASSIS_PHOTO"
  | "ENGINE_PHOTO"
  | "DAMAGE_PHOTO";

export interface Inspection {
  id: string;
  owner_id: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  ano: number | null;
  cor: string | null;
  fipe_valor: string | null;
  fipe_codigo: string | null;
  nome_associado: string | null;
  telefone_associado: string | null;
  tipo_vistoria: InspectionTipo;
  migracao_origem: string | null;
  mode: InspectionMode;
  status: InspectionStatus;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_accuracy_m: number | null;
  gps_timestamp: string | null;
  ai_result: AiResult | null;
  ai_approved: boolean | null;
  ai_reason: string | null;
  ai_model_used: string | null;
  ai_processed_at: string | null;
  audio_transcript: string | null;
  remote_token: string | null;
  remote_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface InspectionCapture {
  id: string;
  inspection_id: string;
  kind: CaptureKind;
  storage_path: string;
  mime_type: string;
  size_bytes: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

/** Resultado da análise IA — JSON estruturado */
export interface AiResult {
  vehicleDetected: boolean;
  vehicleRunning: boolean; // painel aceso + som motor
  vehicleRunningEvidence: string[]; // ["painel iluminado no frame 12", "ruído motor audível"]
  anglesCaptured: Array<"FRONT" | "FRONT_LEFT" | "LEFT" | "REAR_LEFT" | "REAR" | "REAR_RIGHT" | "RIGHT" | "FRONT_RIGHT">;
  anglesMissing: string[];
  detectedPlate: string | null;
  plateMatches: boolean | null; // bate com placa cadastrada?
  odometerKm: number | null;
  odometerReadable: boolean;
  // Chassi
  chassisVisible: boolean;
  chassisNumber: string | null;      // VIN de 17 chars quando legível
  chassisReadable: boolean;
  // Cofre do motor
  engineBayVisible: boolean;         // capô aberto + motor visível
  engineBayCondition: "normal" | "reparos" | "irregularidades" | "unknown";
  engineBayObservations: string[];   // ex: "soldagem recente perto do bloco", "etiqueta de identificação legível"
  // Avarias
  damages: Array<{
    description: string;
    severity: "minor" | "moderate" | "severe";
    location: string;
    frameMs: number | null;
  }>;
  overallQuality: "excellent" | "good" | "poor" | "unusable";
  reasons: string[]; // lista de motivos pra aprovar/reprovar
  recommendation: "approve" | "reject" | "needs_review";
  rejectionReason?: string;
}
