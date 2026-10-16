import type { FastifyPluginAsync } from 'fastify';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { normalizeBrazilianPlate } from '../domain/plate.js';
import { DomainError } from '../lib/errors.js';
import { runIdempotent } from '../lib/idempotency.js';
import { getProviders } from '../providers/factory.js';
import { orderedVehicleTypesForFipeCode } from '../providers/plate/placafipe.js';
import type { ResolveByTextInput, ResolveByTextResult } from '../providers/sivisweb/fipe-resolver.js';
import type { SivisWebFipeResolver } from '../providers/sivisweb/fipe-resolver.js';

/**
 * Try to resolve a vehicle across Sivisweb FIPE categories (car→moto→truck)
 * in the order suggested by the FIPE code prefix. Returns the first hit.
 */
async function resolveWithCascade(
  resolver: SivisWebFipeResolver,
  input: Omit<ResolveByTextInput, 'vehicleType'>,
  hintFipeCode: string | undefined,
): Promise<{ resolved: ResolveByTextResult; vehicleType: number } | null> {
  for (const vehicleType of orderedVehicleTypesForFipeCode(hintFipeCode)) {
    const r = await resolver.resolveByText({ ...input, vehicleType });
    if (r) return { resolved: r, vehicleType };
  }
  return null;
}

const QuickQuoteBody = z.object({
  idempotencyKey: z.string().min(8).max(128),
  leadId: z.string().optional(),
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().min(8),
    sourceId: z.number().int().positive().optional(),
  }),
  vehicle: z.object({
    plate: z.string().min(1),
    brand: z.string().min(1),
    brandCode: z.string().optional(),
    model: z.string().min(1),
    modelCode: z.string().optional(),
    modelYear: z.number().int().positive(),
    modelYearCode: z.string().optional(),
    fuel: z.string().optional(),
    fuelInitial: z.string().optional(),
    vehicleType: z.number().int().positive().optional(),
    fipeCode: z.string().min(1),
    fipeValueCents: z.number().int().nonnegative(),
    fipeMonth: z.string().min(1),
  }),
  productId: z.union([z.string(), z.number()]).optional(),
});

const FromPlateBody = z.object({
  plate: z.string().min(1),
  customerName: z.string().min(1),
  customerPhone: z.string().min(8),
  leadId: z.string().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  productId: z.union([z.string(), z.number()]).optional(),
});

const FromTextBody = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  // Accept number OR numeric string (seuIA sends {{ano}} as string via webhook).
  modelYear: z.coerce.number().int().min(1900).max(2100),
  fuel: z.string().optional(),
  fuelInitial: z.string().length(1).optional(),
  plate: z.string().optional(),
  customerName: z.string().min(1),
  customerPhone: z.string().min(8),
  leadId: z.string().optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
  productId: z.union([z.string(), z.number()]).optional(),
});

const quoteRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/quote/quick', async (req, reply) => {
    const body = QuickQuoteBody.parse(req.body);
    const normalizedPlate = normalizeBrazilianPlate(body.vehicle.plate);
    const { quote } = getProviders();

    const { result, replayed } = await runIdempotent({
      key: body.idempotencyKey,
      scope: 'quote.quick',
      run: () =>
        quote.createQuickQuote({
          idempotencyKey: body.idempotencyKey,
          ...(body.leadId ? { leadId: body.leadId } : {}),
          customer: body.customer,
          vehicle: { ...body.vehicle, plate: normalizedPlate.value },
          ...(body.productId !== undefined ? { productId: body.productId } : {}),
        }),
    });

    if (replayed) reply.header('x-idempotent-replay', 'true');
    return {
      success: true,
      data: result,
      requestId: req.requestId,
    };
  });

  /**
   * One-shot endpoint that takes only a plate + customer and internally does
   * enrich (plate provider + Sivisweb FIPE resolver) followed by quote.
   * Designed for LLM tool-calling: minimal properties, no client-side chaining.
   */
  app.post('/v1/quote/from-plate', async (req, reply) => {
    const body = FromPlateBody.parse(req.body);
    const normalized = normalizeBrazilianPlate(body.plate);
    const providers = getProviders();

    if (!providers.plate || !providers.sivisWebFipeResolver) {
      throw new DomainError({
        code: 'QUOTE_PROVIDER_UNAVAILABLE',
        message:
          '/v1/quote/from-plate requires a plate provider and QUOTE_PROVIDER=sivisweb.',
      });
    }

    const p = await providers.plate.lookupByPlate(normalized.value);
    if (!p) {
      throw new DomainError({
        code: 'VEHICLE_NOT_FOUND',
        message: `Placa ${normalized.value} não encontrada em ${providers.plate.name}.`,
      });
    }

    const cascade = await resolveWithCascade(
      providers.sivisWebFipeResolver,
      {
        brand: p.brand,
        model: p.model,
        modelYear: p.modelYear,
        ...(p.fuel ? { fuel: p.fuel } : {}),
        ...(p.fuelInitial ? { fuelInitial: p.fuelInitial } : {}),
      },
      p.fipeCode,
    );
    if (!cascade) {
      req.log.warn(
        { plate: normalized.value, plateResult: p },
        'from_plate_fipe_resolve_failed',
      );
      throw new DomainError({
        code: 'FIPE_NOT_FOUND',
        message: `Não consegui achar o código FIPE para ${p.brand} ${p.model} ${p.modelYear}. Peça pro lead confirmar marca/modelo/versão.`,
      });
    }
    const { resolved, vehicleType: resolvedType } = cascade;

    // Stable idempotency key so repeated calls with the same lead/plate replay
    // instead of creating duplicate Sivisweb records.
    const idempotencyKey =
      body.idempotencyKey ??
      `plate:${normalized.value}:${createHash('sha256').update(body.customerPhone).digest('hex').slice(0, 16)}`;

    const { result, replayed } = await runIdempotent({
      key: idempotencyKey,
      scope: 'quote.from-plate',
      run: () =>
        providers.quote.createQuickQuote({
          idempotencyKey,
          ...(body.leadId ? { leadId: body.leadId } : {}),
          customer: { name: body.customerName, phone: body.customerPhone },
          vehicle: {
            plate: normalized.value,
            brand: resolved.brand,
            ...(resolved.brandCode ? { brandCode: resolved.brandCode } : {}),
            model: resolved.model,
            ...(resolved.modelCode ? { modelCode: resolved.modelCode } : {}),
            modelYear: resolved.modelYear,
            ...(resolved.modelYearCode ? { modelYearCode: resolved.modelYearCode } : {}),
            ...(resolved.fuel ? { fuel: resolved.fuel } : {}),
            ...(resolved.fuelInitial ? { fuelInitial: resolved.fuelInitial } : {}),
            vehicleType: resolvedType,
            fipeCode: resolved.fipeCode,
            fipeValueCents: resolved.valueCents,
            fipeMonth: resolved.referenceMonth,
          },
          ...(body.productId !== undefined ? { productId: body.productId } : {}),
        }),
    });

    if (replayed) reply.header('x-idempotent-replay', 'true');
    return {
      success: true,
      data: {
        ...result,
        // Also surface the resolved vehicle info so the agent can echo it back
        // to the lead when phrasing the confirmation message.
        vehicle: {
          plate: normalized.value,
          brand: resolved.brand,
          model: resolved.model,
          modelYear: resolved.modelYear,
          color: p.color,
          fipeCode: resolved.fipeCode,
          fipeFormatted: resolved.formattedValue,
          vehicleType: resolvedType,
          vehicleCategory:
            resolvedType === 2 ? 'moto' : resolvedType === 3 ? 'caminhão' : 'carro',
        },
      },
      requestId: req.requestId,
    };
  });

  /**
   * Fallback endpoint when the lead won't send a plate. Takes brand + model +
   * year as free text, resolves via Sivisweb text→FIPE, and creates a quote in
   * one shot. Same response shape as /v1/quote/from-plate.
   */
  app.post('/v1/quote/from-text', async (req, reply) => {
    const body = FromTextBody.parse(req.body);
    const providers = getProviders();

    if (!providers.sivisWebFipeResolver) {
      throw new DomainError({
        code: 'QUOTE_PROVIDER_UNAVAILABLE',
        message: '/v1/quote/from-text requires QUOTE_PROVIDER=sivisweb.',
      });
    }

    const cascade = await resolveWithCascade(
      providers.sivisWebFipeResolver,
      {
        brand: body.brand,
        model: body.model,
        modelYear: body.modelYear,
        ...(body.fuel ? { fuel: body.fuel } : {}),
        ...(body.fuelInitial ? { fuelInitial: body.fuelInitial } : {}),
      },
      undefined,
    );
    if (!cascade) {
      req.log.warn({ body }, 'from_text_fipe_resolve_failed');
      throw new DomainError({
        code: 'FIPE_NOT_FOUND',
        message: `Não consegui achar o código FIPE para ${body.brand} ${body.model} ${body.modelYear}. Peça pro lead confirmar marca/modelo/versão ou passar a placa.`,
      });
    }
    const { resolved, vehicleType: resolvedType } = cascade;

    const plate = body.plate ?? '';
    const idempotencyKey =
      body.idempotencyKey ??
      `text:${resolved.fipeCode}:${createHash('sha256')
        .update(body.customerPhone)
        .digest('hex')
        .slice(0, 16)}`;

    const { result, replayed } = await runIdempotent({
      key: idempotencyKey,
      scope: 'quote.from-text',
      run: () =>
        providers.quote.createQuickQuote({
          idempotencyKey,
          ...(body.leadId ? { leadId: body.leadId } : {}),
          customer: { name: body.customerName, phone: body.customerPhone },
          vehicle: {
            plate,
            brand: resolved.brand,
            ...(resolved.brandCode ? { brandCode: resolved.brandCode } : {}),
            model: resolved.model,
            ...(resolved.modelCode ? { modelCode: resolved.modelCode } : {}),
            modelYear: resolved.modelYear,
            ...(resolved.modelYearCode ? { modelYearCode: resolved.modelYearCode } : {}),
            ...(resolved.fuel ? { fuel: resolved.fuel } : {}),
            ...(resolved.fuelInitial ? { fuelInitial: resolved.fuelInitial } : {}),
            vehicleType: resolvedType,
            fipeCode: resolved.fipeCode,
            fipeValueCents: resolved.valueCents,
            fipeMonth: resolved.referenceMonth,
          },
          ...(body.productId !== undefined ? { productId: body.productId } : {}),
        }),
    });

    if (replayed) reply.header('x-idempotent-replay', 'true');
    return {
      success: true,
      data: {
        ...result,
        vehicle: {
          plate,
          brand: resolved.brand,
          model: resolved.model,
          modelYear: resolved.modelYear,
          fipeCode: resolved.fipeCode,
          fipeFormatted: resolved.formattedValue,
          vehicleType: resolvedType,
          vehicleCategory:
            resolvedType === 2 ? 'moto' : resolvedType === 3 ? 'caminhão' : 'carro',
        },
      },
      requestId: req.requestId,
    };
  });
};

export default quoteRoutes;
