import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DomainError } from '../lib/errors.js';
import { getProviders } from '../providers/factory.js';

const ResolveBody = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  modelYear: z.number().int().min(1900).max(2100),
  fuel: z.string().optional(),
  fuelInitial: z.string().length(1).optional(),
  plate: z.string().optional(),
  vehicleType: z.number().int().positive().optional(),
});

const resolveRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/vehicle/resolve-by-text', async (req) => {
    const body = ResolveBody.parse(req.body);
    const providers = getProviders();
    if (!providers.sivisWebFipeResolver) {
      throw new DomainError({
        code: 'FIPE_PROVIDER_UNAVAILABLE',
        message: 'Text resolver requires QUOTE_PROVIDER=sivisweb.',
      });
    }

    const resolved = await providers.sivisWebFipeResolver.resolveByText({
      brand: body.brand,
      model: body.model,
      modelYear: body.modelYear,
      ...(body.fuel ? { fuel: body.fuel } : {}),
      ...(body.fuelInitial ? { fuelInitial: body.fuelInitial } : {}),
      ...(body.vehicleType ? { vehicleType: body.vehicleType } : {}),
    });

    if (!resolved) {
      throw new DomainError({
        code: 'FIPE_NOT_FOUND',
        message: `Could not resolve FIPE for "${body.brand} ${body.model} ${body.modelYear}". Ask the lead to confirm details (brand + model + year).`,
      });
    }

    return {
      success: true,
      data: {
        vehicle: {
          plate: body.plate ?? '',
          brand: resolved.brand,
          brandCode: resolved.brandCode,
          model: resolved.model,
          modelCode: resolved.modelCode,
          modelYear: resolved.modelYear,
          modelYearCode: resolved.modelYearCode,
          ...(resolved.fuel ? { fuel: resolved.fuel } : {}),
          ...(resolved.fuelInitial ? { fuelInitial: resolved.fuelInitial } : {}),
          vehicleType: 1,
          fipeCode: resolved.fipeCode,
        },
        fipe: {
          fipeCode: resolved.fipeCode,
          brand: resolved.brand,
          model: resolved.model,
          modelYear: resolved.modelYear,
          referenceMonth: resolved.referenceMonth,
          valueCents: resolved.valueCents,
          formattedValue: resolved.formattedValue,
        },
      },
      confidence: resolved.confidence,
      provider: 'sivisweb',
      requestId: req.requestId,
    };
  });
};

export default resolveRoutes;
