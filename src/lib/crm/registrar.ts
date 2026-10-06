import { createSupabaseServer } from "@/lib/supabase/server";
import { normTelefone } from "./schemas";

export interface RegistrarArgs {
  ownerId: string;
  groupId?: string | null;
  tipo: "cotacao_rapida" | "cotacao_completa";
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  cidade?: string | null;
  payload?: Record<string, unknown>; // placa, veiculo, valorFipe, mensalidade, quoteId...
}

/**
 * Side-effect: registra uma interação de cotação no CRM. Upsert do contato por
 * (owner_id, telefone_norm) + INSERT em crm_interactions. Falhas são capturadas
 * e logadas — JAMAIS devem derrubar a cotação principal.
 *
 * Requer que o chamador já tenha autenticado; ownerId é o userId do auth.
 */
export async function registrarInteracaoCRM(args: RegistrarArgs): Promise<{ ok: boolean; contactId?: string; error?: string }> {
  const telNorm = normTelefone(args.telefone);
  if (!telNorm || !args.nome) {
    // sem telefone ou sem nome não dá pra fazer dedup/criar lead útil → ignora
    return { ok: false, error: "missing_telefone_or_nome" };
  }

  try {
    const supabase = await createSupabaseServer();

    // 1) procura contato existente por (owner, telefone_norm)
    const { data: existing, error: selErr } = await supabase
      .from("crm_contacts")
      .select("id")
      .eq("owner_id", args.ownerId)
      .eq("telefone_norm", telNorm)
      .maybeSingle();

    if (selErr) throw selErr;

    let contactId: string;

    if (existing?.id) {
      contactId = existing.id;
      // só atualiza o last_touch_at (trigger faz isso automaticamente via INSERT da interaction);
      // mas atualiza também nome/email/cidade se vieram vazios antes
      await supabase
        .from("crm_contacts")
        .update({
          nome: args.nome,
          ...(args.email ? { email: args.email } : {}),
          ...(args.cidade ? { cidade: args.cidade } : {}),
        })
        .eq("id", contactId);
    } else {
      // 2) cria novo contato
      const { data: created, error: insErr } = await supabase
        .from("crm_contacts")
        .insert({
          owner_id: args.ownerId,
          group_id: args.groupId ?? null,
          nome: args.nome,
          telefone: args.telefone ?? null,
          email: args.email ?? null,
          cidade: args.cidade ?? null,
          origem: args.tipo,
          temperatura: "morno",
          status_ciclo: "ativo",
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      contactId = created.id;
    }

    // 3) append na timeline
    const { error: intErr } = await supabase
      .from("crm_interactions")
      .insert({
        contact_id: contactId,
        owner_id: args.ownerId,
        tipo: args.tipo,
        descricao: args.tipo === "cotacao_rapida" ? "Cotação rápida registrada" : "Cotação completa registrada",
        metadata: args.payload ?? {},
      });
    if (intErr) throw intErr;

    return { ok: true, contactId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[crm/registrar] falhou:", msg);
    return { ok: false, error: msg };
  }
}
