import { z } from "zod";

export const Temperatura = z.enum(["quente", "morno", "frio"]);
export const StatusCiclo = z.enum(["ativo", "cliente", "perdido"]);
export const InteracaoTipo = z.enum([
  "cotacao_rapida", "cotacao_completa",
  "whatsapp", "ligacao", "reuniao", "email",
  "nota_sistema", "outro",
]);

export const ContactCreateSchema = z.object({
  nome: z.string().trim().min(1).max(120),
  telefone: z.string().trim().max(30).optional().nullable(),
  email: z.string().trim().email().max(120).optional().nullable().or(z.literal("")),
  cidade: z.string().trim().max(80).optional().nullable(),
  origem: z.string().trim().max(40).optional().nullable(),
  temperatura: Temperatura.optional().default("morno"),
  status_ciclo: StatusCiclo.optional().default("ativo"),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});
export type ContactCreate = z.infer<typeof ContactCreateSchema>;

export const ContactPatchSchema = ContactCreateSchema.partial();
export type ContactPatch = z.infer<typeof ContactPatchSchema>;

export const InteractionCreateSchema = z.object({
  contact_id: z.string().uuid(),
  tipo: InteracaoTipo,
  descricao: z.string().trim().max(500).optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
});
export type InteractionCreate = z.infer<typeof InteractionCreateSchema>;

export const NoteCreateSchema = z.object({
  contact_id: z.string().uuid(),
  texto: z.string().trim().min(1).max(4000),
});
export type NoteCreate = z.infer<typeof NoteCreateSchema>;

export const NotePatchSchema = z.object({
  texto: z.string().trim().min(1).max(4000),
});

export const FollowupCreateSchema = z.object({
  contact_id: z.string().uuid(),
  data_followup: z.string().datetime(),
  descricao: z.string().trim().max(500).optional().nullable(),
});
export type FollowupCreate = z.infer<typeof FollowupCreateSchema>;

export const FollowupPatchSchema = z.object({
  done: z.boolean().optional(),
  data_followup: z.string().datetime().optional(),
  descricao: z.string().trim().max(500).optional().nullable(),
});

/** Normaliza telefone removendo tudo que não é dígito. */
export function normTelefone(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/\D/g, "");
}
