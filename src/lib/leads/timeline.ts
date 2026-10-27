/**
 * Helper pra registrar eventos no lead_timeline (append-only, auditoria).
 *
 * Uso tipico:
 *   await registrarEvento(supabase, {
 *     leadId, actorId: consultorId,
 *     evento: "lead_criado",
 *     detalhes: { nome, placa }
 *   });
 *
 * Nao da throw — se falha, so loga. Timeline nao pode derrubar fluxo principal.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type EventoTimeline =
  | "lead_criado"
  | "lead_atualizado"
  | "lead_deletado"
  | "veiculo_adicionado"
  | "veiculo_removido"
  | "doc_enviado"
  | "doc_removido"
  | "pendencia_criada"
  | "pendencia_resolvida"
  | "pendencia_cancelada"
  | "status_mudou"
  | "sivis_sync_enfileirado"
  | "sivis_sync_ok"
  | "sivis_sync_falhou"
  | "nota";

export interface RegistrarEventoInput {
  leadId: string;
  actorId: string | null;
  evento: EventoTimeline;
  detalhes?: Record<string, unknown>;
}

export async function registrarEvento(
  supabase: SupabaseClient,
  input: RegistrarEventoInput,
): Promise<void> {
  const { error } = await supabase.from("lead_timeline").insert({
    lead_id: input.leadId,
    actor_id: input.actorId,
    evento: input.evento,
    detalhes: input.detalhes ?? {},
  });
  if (error) {
    console.warn("[timeline] falhou (nao bloqueia):", input.evento, error.message);
  }
}
