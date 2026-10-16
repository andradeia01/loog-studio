import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DomainError } from '../lib/errors.js';
import { getProviders } from '../providers/factory.js';

const FipeLookupBody = z.object({
  fipeCode: z.string().min(1).optional(),
  brandCode: z.string().min(1).optional(),
  modelCode: z.string().min(1).optional(),
  modelYearCode: z.string().min(1).optional(),
  brand: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  modelYear: z.number().int().positive().optional(),
  vehicleType: z.number().int().positive().optional(),
});

const fipeRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/fipe/lookup', async (req) => {
    const body = FipeLookupBody.parse(req.body);
    const { fipe } = getProviders();
    const result = await fipe.lookup({
      ...(body.fipeCode !== undefined ? { fipeCode: body.fipeCode } : {}),
      ...(body.brand !== undefined ? { brand: body.brand } : {}),
      ...(body.brandCode !== undefined ? { brandCode: body.brandCode } : {}),
      ...(body.model !== undefined ? { model: body.model } : {}),
      ...(body.modelCode !== undefined ? { modelCode: body.modelCode } : {}),
      ...(body.modelYear !== undefined ? { modelYear: body.modelYear } : {}),
      ...(body.modelYearCode !== undefined ? { modelYearCode: body.modelYearCode } : {}),
      ...(body.vehicleType !== undefined ? { vehicleType: body.vehicleType } : {}),
    });
    if (!result) {
      throw new DomainError({
        code: 'FIPE_NOT_FOUND',
        message:
          'FIPE não encontrada. Informe fipeCode, ou brandCode+modelCode+modelYearCode.',
      });
    }
    return {
      success: true,
      data: result,
      provider: result.provider,
      requestId: req.requestId,
    };
  });
};

export default fipeRoutes;
