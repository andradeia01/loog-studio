import { z } from "zod";

export const LeadStatus = z.enum(["lead", "prospect", "pendencia", "cliente", "perdido"]);
export type LeadStatus = z.infer<typeof LeadStatus>;

export const SivisSyncStatus = z.enum(["pending", "synced", "failed", "skipped", "stale"]);
export type SivisSyncStatus = z.infer<typeof SivisSyncStatus>;

export const DocTipo = z.enum([
  "cnh",
  "crlv",
  "comprovante_residencia",
  "comprovante_renda",
  "selfie",
  "outros",
]);
export type DocTipo = z.infer<typeof DocTipo>;

export const PendenciaStatus = z.enum(["aberta", "resolvida", "cancelada"]);

export const VehicleTipo = z.enum(["carro", "moto", "caminhao", "utilitario", "eletrico"]);
export type VehicleTipo = z.infer<typeof VehicleTipo>;

/** Normaliza telefone/CPF/CEP removendo tudo que não é dígito. */
export function onlyDigits(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/\D/g, "");
}

/** Valida CPF (checksum). Aceita formatado ou só dígitos. Vazio = ok (opcional). */
export function isValidCpf(cpf: string | null | undefined): boolean {
  if (!cpf) return true;
  const d = onlyDigits(cpf);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const calc = (slice: number) => {
    let sum = 0;
    for (let i = 0; i < slice; i++) sum += Number(d[i]) * (slice + 1 - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

// ─── LEAD ──────────────────────────────────────────────────────────────────
const CpfStr = z
  .string()
  .trim()
  .max(14)
  .refine((v) => !v || isValidCpf(v), { message: "CPF inválido" })
  .optional()
  .nullable();

export const LeadCreateSchema = z.object({
  contratante_nome: z.string().trim().min(1).max(120),
  contratante_email: z.string().trim().email().max(160).optional().nullable().or(z.literal("")),
  contratante_cpf: CpfStr,
  contratante_telefone: z.string().trim().max(30).optional().nullable(),
  contratante_data_nasc: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  contratante_cep: z.string().trim().max(10).optional().nullable(),
  contratante_endereco: z.string().trim().max(200).optional().nullable(),
  contratante_numero: z.string().trim().max(20).optional().nullable(),
  contratante_bairro: z.string().trim().max(80).optional().nullable(),
  contratante_cidade: z.string().trim().max(80).optional().nullable(),
  contratante_uf: z.string().trim().length(2).toUpperCase().optional().nullable(),
  contratante_complemento: z.string().trim().max(100).optional().nullable(),
  procedencia: z.string().trim().max(60).optional().nullable(),
  observacao: z.string().trim().max(2000).optional().nullable(),
  status: LeadStatus.optional().default("lead"),
});
export type LeadCreate = z.infer<typeof LeadCreateSchema>;

export const LeadPatchSchema = LeadCreateSchema.partial();
export type LeadPatch = z.infer<typeof LeadPatchSchema>;

// ─── VEHICLE ───────────────────────────────────────────────────────────────
export const VehicleCreateSchema = z.object({
  placa: z.string().trim().max(10).optional().nullable(),
  fipe_code: z.string().trim().max(20).optional().nullable(),
  marca: z.string().trim().min(1).max(60),
  modelo: z.string().trim().min(1).max(160),
  ano_modelo: z.number().int().min(1950).max(new Date().getFullYear() + 2).optional().nullable(),
  combustivel: z.string().trim().max(40).optional().nullable(),
  sigla_combustivel: z.string().trim().max(5).optional().nullable(),
  mes_referencia_fipe: z.string().trim().max(60).optional().nullable(),
  tipo: VehicleTipo,
  consulta_fipe: z.number().int().min(0).max(2).default(0),
  valor_fipe_cents: z.number().int().min(0).optional().nullable(),
  valor_fipe_formatado: z.string().trim().max(40).optional().nullable(),
  cotacao_snapshot: z.unknown().optional().nullable(),
});
export type VehicleCreate = z.infer<typeof VehicleCreateSchema>;

// ─── DOCUMENT ──────────────────────────────────────────────────────────────
export const DocumentCreateSchema = z.object({
  tipo: DocTipo,
  filename: z.string().trim().min(1).max(200),
  mime_type: z.string().trim().max(80).optional().nullable(),
  size_bytes: z.number().int().min(0).max(50_000_000).optional().nullable(),
});
export type DocumentCreate = z.infer<typeof DocumentCreateSchema>;

// ─── PENDENCIA ─────────────────────────────────────────────────────────────
export const PendenciaCreateSchema = z.object({
  tipo: z.string().trim().min(1).max(60),
  descricao: z.string().trim().max(500).optional().nullable(),
  document_id: z.string().uuid().optional().nullable(),
});
export const PendenciaPatchSchema = z.object({
  status: PendenciaStatus.optional(),
  descricao: z.string().trim().max(500).optional().nullable(),
  document_id: z.string().uuid().optional().nullable(),
  auto_resolvida: z.boolean().optional(),
});

// ─── STATUS TRANSITION ─────────────────────────────────────────────────────
export const StatusTransitionSchema = z.object({
  from: LeadStatus,
  to: LeadStatus,
});
/** Transições permitidas no funil. Em ordem — nunca "pula" status. */
export const TRANSICOES_VALIDAS: Record<LeadStatus, LeadStatus[]> = {
  lead: ["prospect", "perdido"],
  prospect: ["pendencia", "cliente", "perdido"],
  pendencia: ["cliente", "perdido"],
  cliente: [], // cliente é terminal — admin pode forçar reset via SQL
  perdido: ["lead"], // reaquecer
};
export function transicaoValida(from: LeadStatus, to: LeadStatus): boolean {
  return TRANSICOES_VALIDAS[from].includes(to);
}
