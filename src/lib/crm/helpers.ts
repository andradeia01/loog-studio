/**
 * Helpers do CRM — scoring, agrupamento, templates WhatsApp, formatação.
 * Pure functions, usadas no cliente.
 */

export type Temperatura = "quente" | "morno" | "frio";
export type StatusCiclo = "ativo" | "cliente" | "perdido";
export type InteracaoTipo =
  | "cotacao_rapida" | "cotacao_completa"
  | "whatsapp" | "ligacao" | "reuniao" | "email"
  | "nota_sistema" | "outro";

export interface LeadScoreInput {
  temperatura: Temperatura;
  status_ciclo: StatusCiclo;
  last_touch_at: string | null;
  created_at: string;
  interactionCount?: number;
}

/**
 * Score 0-100 derivado do contexto. Serve pra ordenar e dar sinal visual.
 * Não substitui `temperatura` (que o consultor controla manualmente), é
 * complementar — tipo um "nível de atenção que esse lead merece agora".
 */
export function calcLeadScore(c: LeadScoreInput): number {
  let s = 50; // baseline

  // temperatura manual pesa muito
  if (c.temperatura === "quente") s += 30;
  else if (c.temperatura === "frio") s -= 25;

  // status
  if (c.status_ciclo === "cliente") s = 100;         // cliente fechado = topo
  else if (c.status_ciclo === "perdido") s = 10;     // perdido = fundo

  if (c.status_ciclo === "ativo") {
    // dias desde último toque
    const base = c.last_touch_at ? new Date(c.last_touch_at) : new Date(c.created_at);
    const dias = (Date.now() - base.getTime()) / 86_400_000;
    if (dias < 1) s += 10;         // tocou hoje
    else if (dias < 3) s += 5;
    else if (dias > 14) s -= 15;   // esfriou
    else if (dias > 30) s -= 25;

    // multi-cotação é sinal forte
    if ((c.interactionCount ?? 0) >= 3) s += 15;
    else if ((c.interactionCount ?? 0) >= 2) s += 8;
  }

  return Math.max(0, Math.min(100, Math.round(s)));
}

/** Agrupamento inteligente da lista. Ordem define prioridade visual. */
export type LeadGrupo =
  | "pra_ligar_hoje"
  | "quentes_sumidos"
  | "novos_7d"
  | "ativos"
  | "clientes"
  | "frios"
  | "perdidos";

export interface Agrupavel {
  temperatura: Temperatura;
  status_ciclo: StatusCiclo;
  last_touch_at: string | null;
  created_at: string;
  hasPendingFollowupHoje?: boolean;
}

export function grupoDoLead(c: Agrupavel): LeadGrupo {
  if (c.status_ciclo === "cliente") return "clientes";
  if (c.status_ciclo === "perdido") return "perdidos";
  if (c.hasPendingFollowupHoje) return "pra_ligar_hoje";

  const base = c.last_touch_at ? new Date(c.last_touch_at) : new Date(c.created_at);
  const dias = (Date.now() - base.getTime()) / 86_400_000;

  if (c.temperatura === "quente" && dias > 3) return "quentes_sumidos";
  if (dias < 7) return "novos_7d";
  if (c.temperatura === "frio" || dias > 14) return "frios";
  return "ativos";
}

export const GRUPO_META: Record<LeadGrupo, { label: string; icon: string; color: string; prioridade: number }> = {
  pra_ligar_hoje:  { label: "📞 Pra ligar hoje",       icon: "📞", color: "from-blue-500/20 to-blue-500/5",   prioridade: 1 },
  quentes_sumidos: { label: "🔥 Quentes sumidos",      icon: "🔥", color: "from-red-500/20 to-red-500/5",     prioridade: 2 },
  novos_7d:        { label: "🆕 Novos (últimos 7 dias)", icon: "🆕", color: "from-emerald-500/20 to-emerald-500/5", prioridade: 3 },
  ativos:          { label: "💬 Ativos",              icon: "💬", color: "from-sky-500/20 to-sky-500/5",      prioridade: 4 },
  frios:           { label: "❄️ Frios / sumidos (>14d)", icon: "❄️", color: "from-cyan-500/20 to-cyan-500/5",   prioridade: 5 },
  clientes:        { label: "✅ Clientes fechados",   icon: "✅", color: "from-emerald-500/25 to-emerald-500/5", prioridade: 6 },
  perdidos:        { label: "💤 Perdidos",            icon: "💤", color: "from-gray-500/15 to-gray-500/5",   prioridade: 7 },
};

/** Templates de WhatsApp contextuais — gera texto pronto pra enviar. */
export interface TplContext {
  nomeConsultor?: string;
  nomeLead: string;
  veiculo?: string | null;      // "Nivus 1.0 TSI 2024"
  valorMensal?: string | null;  // "R$ 189,00"
  diasDesdeToque?: number;
}

export const WHATSAPP_TEMPLATES: { id: string; label: string; icon: string; render: (c: TplContext) => string }[] = [
  {
    id: "primeiro_contato",
    label: "Primeiro contato",
    icon: "👋",
    render: (c) => `Olá ${c.nomeLead.split(" ")[0]}! Aqui é ${c.nomeConsultor ?? "da LOOG"}. Fiz sua cotação${c.veiculo ? ` do ${c.veiculo}` : ""} e tenho uma condição especial pra te mostrar. Tem 2 minutinhos pra conversar?`,
  },
  {
    id: "cotou_sumiu",
    label: "Cotou e sumiu",
    icon: "👻",
    render: (c) => `${c.nomeLead.split(" ")[0]}, tudo bem? Vi que você fez uma cotação${c.veiculo ? ` pro ${c.veiculo}` : ""} aqui com a gente há ${c.diasDesdeToque ?? "alguns"} dias. Posso te ajudar a tirar alguma dúvida ou já quer avançar com a proteção?`,
  },
  {
    id: "lembrete_followup",
    label: "Lembrete amigável",
    icon: "🔔",
    render: (c) => `Oi ${c.nomeLead.split(" ")[0]}! Passando pra lembrar da nossa conversa sobre a proteção${c.veiculo ? ` do ${c.veiculo}` : ""}. Mantenho sua cotação ativa aqui — qualquer coisa é só falar!`,
  },
  {
    id: "oferta_desconto",
    label: "Oferta especial",
    icon: "🎁",
    render: (c) => `${c.nomeLead.split(" ")[0]}, consegui uma condição ainda melhor${c.valorMensal ? ` — ${c.valorMensal}/mês` : ""}. Posso te enviar os detalhes agora?`,
  },
  {
    id: "pos_venda",
    label: "Pós-venda / cliente",
    icon: "⭐",
    render: (c) => `Oi ${c.nomeLead.split(" ")[0]}! Como estão as coisas por aí? Qualquer necessidade com a proteção${c.veiculo ? ` do ${c.veiculo}` : ""}, me chame. Tô sempre à disposição.`,
  },
];

/** Formata data relativa curtinha ("agora", "2h", "3d", "há 2 meses"). */
export function fmtRelativo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffM = Math.round(diffMs / 60_000);
  if (diffM < 1) return "agora";
  if (diffM < 60) return `${diffM}min`;
  const diffH = Math.round(diffM / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  if (diffD < 30) return `${Math.round(diffD / 7)}sem`;
  const diffMo = Math.round(diffD / 30);
  if (diffMo < 12) return `${diffMo}mês`;
  return d.toLocaleDateString("pt-BR");
}

/** Formata data+hora em pt-BR compacto. */
export function fmtDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Monta deeplink WhatsApp com telefone + mensagem. */
export function waLink(telefone: string | null, text?: string): string {
  if (!telefone) return "#";
  const d = telefone.replace(/\D/g, "");
  const full = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${full}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/** Dias desde um timestamp. Retorna 0 se null. */
export function diasDesde(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/** Extrai um resumo humano do metadata de uma interaction. */
export function resumoInteracao(tipo: InteracaoTipo, metadata: Record<string, unknown>): string[] {
  const linhas: string[] = [];
  const m = metadata ?? {};
  if (tipo === "cotacao_rapida" || tipo === "cotacao_completa") {
    const v = m.vehicle as { brand?: string; model?: string; modelYear?: number; plate?: string } | null | undefined;
    if (v) {
      const nome = [v.brand, v.model].filter(Boolean).join(" ");
      if (nome) linhas.push(`🚗 ${nome}${v.modelYear ? ` ${v.modelYear}` : ""}`);
      if (v.plate) linhas.push(`🔖 Placa ${v.plate}`);
    } else if (m.placa) {
      linhas.push(`🔖 Placa ${String(m.placa)}`);
    }
    if (m.valorFipe) linhas.push(`💰 FIPE ${String(m.valorFipe)}`);
    if (m.quoteId) linhas.push(`📄 Proposta #${String(m.quoteId)}`);
    if (m.cpf) linhas.push(`🆔 CPF ${String(m.cpf)}`);
    if (m.endereco) linhas.push(`📍 ${String(m.endereco)}`);
  }
  return linhas;
}

/** Dicionário de insights pra o banner no topo da lista. */
export interface InsightInput {
  total: number;
  quentes: number;
  pendingFollowupsHoje: number;
  quentesSumidos: number;
  novos7d: number;
  clientesMes: number;
}

export function gerarInsights(i: InsightInput): { icon: string; texto: string; tone: "ok" | "atencao" | "critico" }[] {
  const out: { icon: string; texto: string; tone: "ok" | "atencao" | "critico" }[] = [];
  if (i.pendingFollowupsHoje > 0) {
    out.push({ icon: "📞", texto: `${i.pendingFollowupsHoje} follow-up${i.pendingFollowupsHoje > 1 ? "s" : ""} agendado${i.pendingFollowupsHoje > 1 ? "s" : ""} pra hoje`, tone: "atencao" });
  }
  if (i.quentesSumidos > 0) {
    out.push({ icon: "🔥", texto: `${i.quentesSumidos} lead${i.quentesSumidos > 1 ? "s" : ""} quente${i.quentesSumidos > 1 ? "s" : ""} sem contato há 3+ dias`, tone: "critico" });
  }
  if (i.novos7d > 0) {
    out.push({ icon: "🆕", texto: `${i.novos7d} novo${i.novos7d > 1 ? "s" : ""} lead${i.novos7d > 1 ? "s" : ""} esta semana`, tone: "ok" });
  }
  if (i.clientesMes > 0) {
    out.push({ icon: "✅", texto: `${i.clientesMes} fechamento${i.clientesMes > 1 ? "s" : ""} este mês. Mantém o ritmo!`, tone: "ok" });
  }
  if (out.length === 0 && i.total === 0) {
    out.push({ icon: "🌱", texto: "Faça sua primeira cotação — o CRM se preenche sozinho.", tone: "ok" });
  }
  return out;
}

export const TONE_CLS: Record<"ok" | "atencao" | "critico", string> = {
  ok:      "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  atencao: "border-amber-500/40 bg-amber-500/10 text-amber-200",
  critico: "border-red-500/40 bg-red-500/10 text-red-200",
};

export const TIPO_META_RICH: Record<InteracaoTipo, { label: string; icon: string; dotCls: string }> = {
  cotacao_rapida:   { label: "Cotação Rápida",   icon: "⚡", dotCls: "bg-amber-500 border-amber-500/60"   },
  cotacao_completa: { label: "Cotação Completa", icon: "📄", dotCls: "bg-blue-500 border-blue-500/60"     },
  whatsapp:         { label: "WhatsApp",         icon: "💬", dotCls: "bg-emerald-500 border-emerald-500/60" },
  ligacao:          { label: "Ligação",          icon: "📞", dotCls: "bg-sky-500 border-sky-500/60"       },
  reuniao:          { label: "Reunião",          icon: "🤝", dotCls: "bg-violet-500 border-violet-500/60" },
  email:            { label: "E-mail",           icon: "✉️", dotCls: "bg-indigo-500 border-indigo-500/60" },
  nota_sistema:     { label: "Sistema",          icon: "ℹ️", dotCls: "bg-gray-500 border-gray-500/60"     },
  outro:            { label: "Outro",            icon: "•",  dotCls: "bg-gray-400 border-gray-400/60"     },
};
