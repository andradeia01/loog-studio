/**
 * LOOG default coverage bundle for every quick quote.
 *
 * Product owner froze the following selections on 2026-09-29 — they must be
 * applied to every cotação rápida returned by the Hub, independent of the
 * padrao flag in Sivisweb's response.
 *
 * FORCED ON  (checked by regex on cobertura.questao and, when needed, on
 *             item.nome):
 *   - Roubo ou Furto                         → first item
 *   - Colisão, Perda Total, Incêndio, etc.   → first item
 *   - Extensão de reboque                    → keep Sivisweb default (padrao:1, R$0)
 *   - Danos Materiais a Terceiros            → R$ 30.000 tier
 *   - Carro Reserva                          → 10 Dias tier (R$ 0,00)
 *   - Transporte Alternativo (Uber/Táxi)     → first item (usually R$0)
 *   - Cobertura de Vidros (full, não somente para-brisa) → first non-para-brisa
 *
 * FORCED OFF:
 *   - Exerce Atividade Remunerada
 *   - Monitoramento / Rastreador
 *   - Kit GNV
 *   - Cobertura só para-brisa (o full acima já cobre)
 *
 * Anything else falls back to Sivisweb's padrao:1 items (backward compatible).
 */

export interface CoberturaItem {
  id: string;
  nome: string;
  valor: string;
  padrao: number | boolean;
  so_padrao?: number | boolean;
  descricao?: string;
}
export interface Cobertura {
  id: string;
  questao: string;
  descricao?: string;
  tipo: string;
  items: CoberturaItem[];
}

type Action = 'FORCE_ON' | 'FORCE_OFF' | 'KEEP_DEFAULT';

interface CoverageRule {
  label: string;
  questao: RegExp;
  action: Action;
  itemMatch?: RegExp;
  itemReject?: RegExp;
}

export const LOOG_DEFAULT_COVERAGE_RULES: CoverageRule[] = [
  { label: 'roubo_furto', questao: /roubo|furto/i, action: 'FORCE_ON' },
  {
    label: 'colisao_perda_total',
    questao: /colis[aã]o.*(perda\s+total|inc[eê]ndio|fen[oô]menos)/i,
    action: 'FORCE_ON',
  },
  { label: 'extensao_reboque', questao: /reboque/i, action: 'KEEP_DEFAULT' },
  {
    label: 'danos_terceiros',
    questao: /danos\s+materiais.*terceiros/i,
    action: 'FORCE_ON',
    itemMatch: /30\.?000/,
  },
  {
    label: 'transporte_alternativo',
    questao: /transporte\s+alternativo|uber|t[aá]xi/i,
    action: 'FORCE_ON',
  },
  {
    label: 'carro_reserva',
    questao: /carro\s+reserva/i,
    action: 'FORCE_ON',
    itemMatch: /10\s*dias/i,
  },
  {
    label: 'monitoramento',
    questao: /monitoramento|rastreador/i,
    action: 'FORCE_OFF',
  },
  { label: 'kit_gnv', questao: /kit\s*gnv|\bgnv\b/i, action: 'FORCE_OFF' },
  {
    label: 'vidros_parabrisa_only',
    questao: /vidros.*(somente\s+)?para[-\s]?brisa/i,
    action: 'FORCE_OFF',
  },
  {
    label: 'vidros_full',
    questao: /vidros.*(far[oó]is|lanternas|retrovisores)|cobertura\s+de\s+vidros(?!.*para)/i,
    action: 'FORCE_ON',
    itemReject: /somente\s+para[-\s]?brisa/i,
  },
  {
    label: 'atividade_remunerada',
    questao: /atividade\s+remunerada/i,
    action: 'FORCE_OFF',
  },
];

export interface CoverageSelection {
  ruleLabel: string;
  coberturaId: string;
  item: CoberturaItem;
}

export interface CoveragePolicyResult {
  selected: CoberturaItem[];
  audit: Array<{
    coberturaId: string;
    questao: string;
    matchedRule: string | null;
    decision: Action | 'FALLBACK_PADRAO' | 'NONE';
    chosenItemId: string | null;
  }>;
}

function findRuleFor(questao: string): CoverageRule | null {
  for (const r of LOOG_DEFAULT_COVERAGE_RULES) {
    if (r.questao.test(questao)) return r;
  }
  return null;
}

function pickPadraoItem(items: CoberturaItem[]): CoberturaItem | null {
  const forced = items.find(
    (i) => (i.so_padrao === 1 || i.so_padrao === true) && (i.padrao === 1 || i.padrao === true),
  );
  if (forced) return forced;
  return items.find((i) => i.padrao === 1 || i.padrao === true) ?? null;
}

function pickFirstMatching(
  items: CoberturaItem[],
  rule: CoverageRule,
): CoberturaItem | null {
  const filtered = rule.itemReject
    ? items.filter((i) => !rule.itemReject!.test(i.nome))
    : items;
  if (rule.itemMatch) {
    const found = filtered.find((i) => rule.itemMatch!.test(i.nome));
    if (found) return found;
  }
  return filtered[0] ?? null;
}

/**
 * Apply the LOOG default policy to a Sivisweb buscarCoberturas response.
 */
export function applyLoogCoveragePolicy(list: Cobertura[]): CoveragePolicyResult {
  const selected: CoberturaItem[] = [];
  const audit: CoveragePolicyResult['audit'] = [];

  for (const c of list) {
    const rule = findRuleFor(c.questao);
    if (!rule) {
      const padrao = pickPadraoItem(c.items);
      audit.push({
        coberturaId: c.id,
        questao: c.questao,
        matchedRule: null,
        decision: padrao ? 'FALLBACK_PADRAO' : 'NONE',
        chosenItemId: padrao?.id ?? null,
      });
      if (padrao) selected.push(padrao);
      continue;
    }
    if (rule.action === 'FORCE_OFF') {
      audit.push({
        coberturaId: c.id,
        questao: c.questao,
        matchedRule: rule.label,
        decision: 'FORCE_OFF',
        chosenItemId: null,
      });
      continue;
    }
    if (rule.action === 'KEEP_DEFAULT') {
      const padrao = pickPadraoItem(c.items);
      audit.push({
        coberturaId: c.id,
        questao: c.questao,
        matchedRule: rule.label,
        decision: 'KEEP_DEFAULT',
        chosenItemId: padrao?.id ?? null,
      });
      if (padrao) selected.push(padrao);
      continue;
    }
    // FORCE_ON
    const chosen = pickFirstMatching(c.items, rule);
    audit.push({
      coberturaId: c.id,
      questao: c.questao,
      matchedRule: rule.label,
      decision: 'FORCE_ON',
      chosenItemId: chosen?.id ?? null,
    });
    if (chosen) selected.push(chosen);
  }

  return { selected, audit };
}
