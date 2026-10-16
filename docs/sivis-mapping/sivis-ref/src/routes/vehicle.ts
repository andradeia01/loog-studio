import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { normalizeBrazilianPlate } from '../domain/plate.js';
import { DomainError } from '../lib/errors.js';
import { getProviders } from '../providers/factory.js';

const LookupBody = z.object({
  plate: z.string().min(1),
});

const vehicleRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/vehicle/lookup', async (req) => {
    const { plate } = LookupBody.parse(req.body);
    const normalized = normalizeBrazilianPlate(plate);
    const { vehicle } = getProviders();
    const found = await vehicle.lookupByPlate(normalized.value);
    if (!found) {
      throw new DomainError({
        code: 'VEHICLE_NOT_FOUND',
        message: `No vehicle found for plate ${normalized.value}.`,
      });
    }
    return {
      success: true,
      data: found,
      provider: found.provider,
      plateFormat: normalized.format,
      requestId: req.requestId,
    };
  });
};

export default vehicleRoutes;
