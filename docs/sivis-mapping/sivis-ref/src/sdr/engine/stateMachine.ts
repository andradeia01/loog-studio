import type { Stage } from '../types.js';

export interface StageDefinition {
  id: Stage;
  goal: string;
  allowedTools: string[];
  canAdvanceTo: Stage[];
  terminal: boolean;
}

export const STAGE_DEFINITIONS: Record<Stage, StageDefinition> = {
  NEW_LEAD: {
    id: 'NEW_LEAD',
    goal: 'Cumprimentar, criar proximidade, entender que o lead quer proteção veicular.',
    allowedTools: ['advance_stage'],
    canAdvanceTo: ['GREETING', 'VEHICLE_CAPTURE'],
    terminal: false,
  },
  GREETING: {
    id: 'GREETING',
    goal: 'Estabelecer rapport curto e puxar pra captura do veículo.',
    allowedTools: ['advance_stage', 'lookup_vehicle_by_plate'],
    canAdvanceTo: ['VEHICLE_CAPTURE'],
    terminal: false,
  },
  VEHICLE_CAPTURE: {
    id: 'VEHICLE_CAPTURE',
    goal: 'Obter placa (preferido) ou marca+modelo+ano do veículo.',
    allowedTools: ['lookup_vehicle_by_plate', 'capture_vehicle_details', 'advance_stage'],
    canAdvanceTo: ['VEHICLE_CONFIRMATION'],
    terminal: false,
  },
  VEHICLE_CONFIRMATION: {
    id: 'VEHICLE_CONFIRMATION',
    goal: 'Mostrar veículo identificado e obter confirmação explícita.',
    allowedTools: ['mark_vehicle_confirmed', 'advance_stage', 'lookup_vehicle_by_plate'],
    canAdvanceTo: ['PAIN_DISCOVERY', 'VEHICLE_CAPTURE'],
    terminal: false,
  },
  PAIN_DISCOVERY: {
    id: 'PAIN_DISCOVERY',
    goal: 'Descobrir a motivação/dor principal com poucas perguntas naturais.',
    allowedTools: ['capture_pain', 'advance_stage'],
    canAdvanceTo: ['PRE_QUOTE'],
    terminal: false,
  },
  PRE_QUOTE: {
    id: 'PRE_QUOTE',
    goal: 'Confirmar nome do cliente e disparar create_quick_quote.',
    allowedTools: ['create_quick_quote', 'advance_stage'],
    canAdvanceTo: ['QUOTE_PRESENTED', 'HUMAN_HANDOFF'],
    terminal: false,
  },
  QUOTE_PRESENTED: {
    id: 'QUOTE_PRESENTED',
    goal: 'Apresentar o resultado da cotação e conduzir pra próxima etapa.',
    allowedTools: ['advance_stage', 'request_human_handoff'],
    canAdvanceTo: ['OBJECTION_HANDLING', 'CLOSING', 'HUMAN_HANDOFF'],
    terminal: false,
  },
  OBJECTION_HANDLING: {
    id: 'OBJECTION_HANDLING',
    goal: 'Entender a objeção antes de responder; responder objetivamente.',
    allowedTools: ['capture_objection', 'advance_stage', 'request_human_handoff', 'create_quick_quote'],
    canAdvanceTo: ['QUOTE_PRESENTED', 'CLOSING', 'HUMAN_HANDOFF'],
    terminal: false,
  },
  CLOSING: {
    id: 'CLOSING',
    goal: 'Coletar dados finais (CPF, endereço) um por vez e fazer handoff.',
    allowedTools: ['capture_documentation', 'request_human_handoff', 'advance_stage'],
    canAdvanceTo: ['HUMAN_HANDOFF', 'WON'],
    terminal: false,
  },
  HUMAN_HANDOFF: {
    id: 'HUMAN_HANDOFF',
    goal: 'Encerrar participação do SDR e passar contexto.',
    allowedTools: ['request_human_handoff'],
    canAdvanceTo: ['WON', 'LOST', 'NURTURE'],
    terminal: true,
  },
  WON: { id: 'WON', goal: 'Encerrado com sucesso.', allowedTools: [], canAdvanceTo: [], terminal: true },
  LOST: { id: 'LOST', goal: 'Encerrado sem sucesso.', allowedTools: [], canAdvanceTo: [], terminal: true },
  NURTURE: {
    id: 'NURTURE',
    goal: 'Manter contato futuro; SDR não responde neste estado.',
    allowedTools: [],
    canAdvanceTo: ['GREETING'],
    terminal: true,
  },
};

export function canTransition(from: Stage, to: Stage): boolean {
  const def = STAGE_DEFINITIONS[from];
  return def.canAdvanceTo.includes(to);
}

export function isToolAllowedInStage(stage: Stage, tool: string): boolean {
  return STAGE_DEFINITIONS[stage].allowedTools.includes(tool);
}
