import type Anthropic from '@anthropic-ai/sdk';
import { normalizeBrazilianPlate } from '../../domain/plate.js';
import { DomainError } from '../../lib/errors.js';
import { getProviders } from '../../providers/factory.js';
import type { Conversation, Stage } from '../types.js';
import { STAGES } from '../types.js';
import { canTransition } from './stateMachine.js';

export interface ToolContext {
  conversation: Conversation;
  logger: (msg: string, extra?: Record<string, unknown>) => void;
}

export interface ToolExecutionResult {
  ok: boolean;
  output: Record<string, unknown> | string;
  mutations?: Partial<Conversation>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Anthropic.Tool.InputSchema;
  execute: (input: unknown, ctx: ToolContext) => Promise<ToolExecutionResult>;
}

function requireString(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v.trim()) {
    throw new DomainError({
      code: 'VALIDATION_ERROR',
      message: `Tool argument "${field}" must be a non-empty string.`,
    });
  }
  return v.trim();
}

function optionalString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function requireNumber(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new DomainError({
      code: 'VALIDATION_ERROR',
      message: `Tool argument "${field}" must be a finite number.`,
    });
  }
  return v;
}

// ------------------------- lookup_vehicle_by_plate -------------------------

export const lookupVehicleTool: ToolDefinition = {
  name: 'lookup_vehicle_by_plate',
  description:
    'Consulta um veículo pelo número da placa. Retorna marca, modelo, ano, código FIPE e valor. Use quando o lead te mandar a placa.',
  input_schema: {
    type: 'object',
    properties: {
      plate: { type: 'string', description: 'Placa no padrão brasileiro (ABC1234 ou ABC1D23)' },
    },
    required: ['plate'],
  },
  async execute(input, _ctx) {
    const raw = requireString((input as { plate?: unknown }).plate, 'plate');
    const norm = normalizeBrazilianPlate(raw);
    const { vehicle } = getProviders();
    const found = await vehicle.lookupByPlate(norm.value);
    if (!found) {
      return {
        ok: false,
        output: { error: 'VEHICLE_NOT_FOUND', plate: norm.value },
      };
    }
    return {
      ok: true,
      output: {
        plate: norm.value,
        brand: found.brand,
        brandCode: found.brandCode,
        model: found.model,
        modelYear: found.modelYear,
        modelYearCode: found.modelYearCode,
        fuel: found.fuel,
        fuelInitial: found.fuelInitial,
        vehicleType: found.vehicleType,
        fipeCode: found.fipeCode,
        fipeValueCents: found.fipeValueCents,
        fipeMonth: found.fipeMonth,
      },
      mutations: {
        vehicle: {
          plate: norm.value,
          brand: found.brand,
          ...(found.brandCode !== undefined ? { brandCode: found.brandCode } : {}),
          model: found.model,
          ...(found.modelCode !== undefined ? { modelCode: found.modelCode } : {}),
          modelYear: found.modelYear,
          ...(found.modelYearCode !== undefined ? { modelYearCode: found.modelYearCode } : {}),
          ...(found.fuel !== undefined ? { fuel: found.fuel } : {}),
          ...(found.fuelInitial !== undefined ? { fuelInitial: found.fuelInitial } : {}),
          ...(found.vehicleType !== undefined ? { vehicleType: Number(found.vehicleType) } : {}),
          ...(found.fipeCode !== undefined ? { fipeCode: found.fipeCode } : {}),
          ...(found.fipeValueCents !== undefined ? { fipeValueCents: found.fipeValueCents } : {}),
          ...(found.fipeMonth !== undefined ? { fipeMonth: found.fipeMonth } : {}),
          confirmed: false,
        },
      },
    };
  },
};

// ------------------------- capture_vehicle_details -------------------------

export const captureVehicleDetailsTool: ToolDefinition = {
  name: 'capture_vehicle_details',
  description:
    'Registra dados do veículo informados em texto pelo lead quando ele não tem/não sabe a placa. Não substitui a busca por placa; use apenas em casos manuais.',
  input_schema: {
    type: 'object',
    properties: {
      brand: { type: 'string' },
      model: { type: 'string' },
      modelYear: { type: 'number' },
    },
    required: ['brand', 'model', 'modelYear'],
  },
  async execute(input) {
    const brand = requireString((input as { brand?: unknown }).brand, 'brand');
    const model = requireString((input as { model?: unknown }).model, 'model');
    const modelYear = requireNumber((input as { modelYear?: unknown }).modelYear, 'modelYear');
    return {
      ok: true,
      output: { captured: true, brand, model, modelYear },
      mutations: {
        vehicle: {
          brand,
          model,
          modelYear,
          confirmed: false,
        },
      },
    };
  },
};

// ------------------------- mark_vehicle_confirmed -------------------------

export const markVehicleConfirmedTool: ToolDefinition = {
  name: 'mark_vehicle_confirmed',
  description:
    'Marca que o lead confirmou explicitamente que o veículo identificado é o dele. Só use após um "sim, confere" claro.',
  input_schema: {
    type: 'object',
    properties: {
      confirmed: { type: 'boolean' },
    },
    required: ['confirmed'],
  },
  async execute(input, ctx) {
    const confirmed = Boolean((input as { confirmed?: unknown }).confirmed);
    return {
      ok: true,
      output: { confirmed },
      mutations: { vehicle: { ...ctx.conversation.vehicle, confirmed } },
    };
  },
};

// ------------------------- capture_pain -------------------------

export const capturePainTool: ToolDefinition = {
  name: 'capture_pain',
  description:
    'Registra a dor/motivação principal do lead. Códigos sugeridos: ROUBO_FURTO, COLISAO, TERCEIROS, PRECO_SEGURADORA, PERFIL, CARRO_RESERVA, OUTROS.',
  input_schema: {
    type: 'object',
    properties: {
      pain: { type: 'string' },
    },
    required: ['pain'],
  },
  async execute(input) {
    const pain = requireString((input as { pain?: unknown }).pain, 'pain');
    return { ok: true, output: { pain }, mutations: { pain } };
  },
};

// ------------------------- capture_objection -------------------------

export const captureObjectionTool: ToolDefinition = {
  name: 'capture_objection',
  description:
    'Registra a objeção do lead. Códigos: PRECO, CONCORRENTE, DESCONFIANCA, TIMING, COBERTURA, PERFIL, OUTROS.',
  input_schema: {
    type: 'object',
    properties: {
      objection: { type: 'string' },
    },
    required: ['objection'],
  },
  async execute(input) {
    const objection = requireString((input as { objection?: unknown }).objection, 'objection');
    return { ok: true, output: { objection }, mutations: { objection } };
  },
};

// ------------------------- capture_documentation -------------------------

export const captureDocumentationTool: ToolDefinition = {
  name: 'capture_documentation',
  description:
    'Registra dados de fechamento (CPF, endereço, email). Um campo por chamada.',
  input_schema: {
    type: 'object',
    properties: {
      field: { type: 'string', enum: ['cpf', 'email', 'address'] },
      value: { type: 'string' },
    },
    required: ['field', 'value'],
  },
  async execute(input, ctx) {
    const field = requireString((input as { field?: unknown }).field, 'field');
    const value = requireString((input as { value?: unknown }).value, 'value');
    if (!['cpf', 'email', 'address'].includes(field)) {
      throw new DomainError({
        code: 'VALIDATION_ERROR',
        message: `Unsupported documentation field: ${field}`,
      });
    }
    const customer = { ...ctx.conversation.customer, [field]: value };
    return { ok: true, output: { field, saved: true }, mutations: { customer } };
  },
};

// ------------------------- create_quick_quote -------------------------

export const createQuickQuoteTool: ToolDefinition = {
  name: 'create_quick_quote',
  description:
    'Cria uma cotação rápida no sistema com os dados do veículo já confirmado. Retorna quoteId, valor mensal, taxa de adesão e a mensagem oficial de WhatsApp pra enviar ao lead.',
  input_schema: {
    type: 'object',
    properties: {
      customerName: { type: 'string' },
    },
    required: ['customerName'],
  },
  async execute(input, ctx) {
    const customerName = requireString((input as { customerName?: unknown }).customerName, 'customerName');
    const v = ctx.conversation.vehicle;
    if (!v.confirmed) {
      return {
        ok: false,
        output: {
          error: 'VEHICLE_NOT_CONFIRMED',
          message: 'Confirme o veículo com o lead antes de cotar.',
        },
      };
    }
    const required = ['plate', 'brand', 'model', 'modelYear', 'fipeCode', 'fipeValueCents', 'fipeMonth'] as const;
    for (const field of required) {
      if (v[field] === undefined || v[field] === null || v[field] === '') {
        return {
          ok: false,
          output: {
            error: 'VEHICLE_INCOMPLETE',
            missing: field,
            message: `Falta ${field} no veículo pra fazer a cotação.`,
          },
        };
      }
    }
    const { quote } = getProviders();
    const result = await quote.createQuickQuote({
      idempotencyKey: `sdr-${ctx.conversation.leadId}-${Date.now()}`,
      leadId: ctx.conversation.leadId,
      customer: { name: customerName, phone: ctx.conversation.phone, sourceId: 29 },
      vehicle: {
        plate: v.plate!,
        brand: v.brand!,
        brandCode: v.brandCode,
        model: v.model!,
        modelCode: v.modelCode,
        modelYear: v.modelYear!,
        modelYearCode: v.modelYearCode,
        fuel: v.fuel,
        fuelInitial: v.fuelInitial,
        vehicleType: v.vehicleType,
        fipeCode: v.fipeCode!,
        fipeValueCents: v.fipeValueCents!,
        fipeMonth: v.fipeMonth!,
      },
    });
    return {
      ok: true,
      output: {
        quoteId: result.quoteId,
        planName: result.plan?.name,
        monthlyValueFormatted: result.plan?.monthlyValueFormatted,
        joinFeeFormatted: result.plan?.joinFeeFormatted,
        portalUrl: result.portalUrl,
        whatsappMessage: result.whatsappMessage,
      },
      mutations: {
        customer: { ...ctx.conversation.customer, name: customerName },
        quote: {
          quoteId: result.quoteId,
          ...(result.plan?.monthlyValueCents !== undefined
            ? { monthlyValueCents: result.plan.monthlyValueCents }
            : {}),
          ...(result.plan?.monthlyValueFormatted !== undefined
            ? { monthlyValueFormatted: result.plan.monthlyValueFormatted }
            : {}),
          ...(result.plan?.joinFeeValueCents !== undefined
            ? { joinFeeCents: result.plan.joinFeeValueCents }
            : {}),
          ...(result.plan?.joinFeeFormatted !== undefined
            ? { joinFeeFormatted: result.plan.joinFeeFormatted }
            : {}),
          planName: result.plan?.name ?? '',
          ...(result.portalUrl !== undefined ? { portalUrl: result.portalUrl } : {}),
          ...(result.whatsappMessage !== undefined ? { whatsappMessage: result.whatsappMessage } : {}),
          createdAt: new Date().toISOString(),
        },
      },
    };
  },
};

// ------------------------- advance_stage -------------------------

export const advanceStageTool: ToolDefinition = {
  name: 'advance_stage',
  description:
    'Avança a jornada do lead para um novo estado. Só use quando o marco do estado atual foi cumprido.',
  input_schema: {
    type: 'object',
    properties: {
      stage: { type: 'string', enum: STAGES },
      reason: { type: 'string' },
    },
    required: ['stage', 'reason'],
  },
  async execute(input, ctx) {
    const stage = requireString((input as { stage?: unknown }).stage, 'stage') as Stage;
    const reason = optionalString((input as { reason?: unknown }).reason) ?? '';
    if (!STAGES.includes(stage)) {
      return { ok: false, output: { error: 'UNKNOWN_STAGE', stage } };
    }
    if (!canTransition(ctx.conversation.stage, stage)) {
      return {
        ok: false,
        output: {
          error: 'INVALID_TRANSITION',
          from: ctx.conversation.stage,
          to: stage,
          allowed: [],
        },
      };
    }
    ctx.logger('stage_advanced', { from: ctx.conversation.stage, to: stage, reason });
    return { ok: true, output: { stage, reason }, mutations: { stage } };
  },
};

// ------------------------- request_human_handoff -------------------------

export const requestHumanHandoffTool: ToolDefinition = {
  name: 'request_human_handoff',
  description:
    'Passa a conversa pra um humano. Use quando: lead pediu pessoa, você não conseguiu ajudar em 3 tentativas, ou o assunto foge do escopo.',
  input_schema: {
    type: 'object',
    properties: {
      reason: { type: 'string' },
    },
    required: ['reason'],
  },
  async execute(input) {
    const reason = requireString((input as { reason?: unknown }).reason, 'reason');
    return {
      ok: true,
      output: { handoff: true, reason },
      mutations: { stage: 'HUMAN_HANDOFF', handoffReason: reason },
    };
  },
};

// ------------------------- registry -------------------------

export const ALL_TOOLS: ToolDefinition[] = [
  lookupVehicleTool,
  captureVehicleDetailsTool,
  markVehicleConfirmedTool,
  capturePainTool,
  captureObjectionTool,
  captureDocumentationTool,
  createQuickQuoteTool,
  advanceStageTool,
  requestHumanHandoffTool,
];
