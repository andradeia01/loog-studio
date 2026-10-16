import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { normalizeBrazilianPlate } from '../domain/plate.js';
import { DomainError } from '../lib/errors.js';
import { getProviders } from '../providers/factory.js';
import type { FipeResult } from '../providers/fipe/types.js';
import type { PlateLookupResult } from '../providers/plate/types.js';
import type { ResolveByTextResult } from '../providers/sivisweb/fipe-resolver.js';
import type { VehicleLookupResult } from '../providers/vehicle/types.js';

const EnrichBody = z.object({ plate: z.string().min(1) });

interface EnrichedVehicle {
  plate: string;
  brand: string;
  brandCode?: string;
  model: string;
  modelCode?: string;
  version?: string;
  manufactureYear?: number;
  modelYear: number;
  modelYearCode?: string;
  fuel?: string;
  fuelInitial?: string;
  vehicleType?: string | number;
  fipeCode?: string;
  color?: string;
  chassis?: string;
}

interface EnrichedFipe {
  fipeCode: string;
  brand: string;
  model: string;
  modelYear: number;
  referenceMonth: string;
  valueCents: number;
  formattedValue: string;
}

function fipeFromResolveResult(r: ResolveByTextResult): EnrichedFipe {
  return {
    fipeCode: r.fipeCode,
    brand: r.brand,
    model: r.model,
    modelYear: r.modelYear,
    referenceMonth: r.referenceMonth,
    valueCents: r.valueCents,
    formattedValue: r.formattedValue,
  };
}

function fipeFromLookup(v: VehicleLookupResult): EnrichedFipe | null {
  if (v.fipeValueCents === undefined || v.fipeMonth === undefined || v.fipeCode === undefined) {
    return null;
  }
  return {
    fipeCode: v.fipeCode,
    brand: v.brand,
    model: v.model,
    modelYear: v.modelYear,
    referenceMonth: v.fipeMonth,
    valueCents: v.fipeValueCents,
    formattedValue: `R$ ${(v.fipeValueCents / 100).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`,
  };
}

function fipeFromResult(r: FipeResult): EnrichedFipe {
  return {
    fipeCode: r.fipeCode,
    brand: r.brand,
    model: r.model,
    modelYear: r.modelYear,
    referenceMonth: r.referenceMonth,
    valueCents: r.valueCents,
    formattedValue: r.formattedValue,
  };
}

function mergePlateResolve(
  plate: string,
  p: PlateLookupResult,
  r: ResolveByTextResult,
): EnrichedVehicle {
  return {
    plate,
    brand: r.brand,
    brandCode: r.brandCode,
    model: r.model,
    modelCode: r.modelCode,
    modelYear: r.modelYear,
    modelYearCode: r.modelYearCode,
    ...(p.manufactureYear !== undefined ? { manufactureYear: p.manufactureYear } : {}),
    ...(r.fuel ? { fuel: r.fuel } : {}),
    ...(r.fuelInitial ? { fuelInitial: r.fuelInitial } : {}),
    fipeCode: r.fipeCode,
    vehicleType: 1,
    ...(p.color ? { color: p.color } : {}),
    ...(p.chassis ? { chassis: p.chassis } : {}),
  };
}

function fromVehicleLookup(v: VehicleLookupResult): EnrichedVehicle {
  return {
    plate: v.plate,
    brand: v.brand,
    ...(v.brandCode !== undefined ? { brandCode: v.brandCode } : {}),
    model: v.model,
    ...(v.modelCode !== undefined ? { modelCode: v.modelCode } : {}),
    ...(v.version !== undefined ? { version: v.version } : {}),
    ...(v.manufactureYear !== undefined ? { manufactureYear: v.manufactureYear } : {}),
    modelYear: v.modelYear,
    ...(v.modelYearCode !== undefined ? { modelYearCode: v.modelYearCode } : {}),
    ...(v.fuel !== undefined ? { fuel: v.fuel } : {}),
    ...(v.fuelInitial !== undefined ? { fuelInitial: v.fuelInitial } : {}),
    ...(v.vehicleType !== undefined ? { vehicleType: v.vehicleType } : {}),
    ...(v.fipeCode !== undefined ? { fipeCode: v.fipeCode } : {}),
  };
}

const enrichRoutes: FastifyPluginAsync = async (app) => {
  app.post('/v1/vehicle/enrich', async (req) => {
    const { plate } = EnrichBody.parse(req.body);
    const normalized = normalizeBrazilianPlate(plate);
    const providers = getProviders();

    // Path A: external plate lookup + Sivisweb text→FIPE resolver (preferred).
    if (providers.plate && providers.sivisWebFipeResolver) {
      const p = await providers.plate.lookupByPlate(normalized.value);
      if (!p) {
        throw new DomainError({
          code: 'VEHICLE_NOT_FOUND',
          message: `Plate ${normalized.value} not found in ${providers.plate.name}.`,
        });
      }
      const resolved = await providers.sivisWebFipeResolver.resolveByText({
        brand: p.brand,
        model: p.model,
        modelYear: p.modelYear,
        ...(p.fuel ? { fuel: p.fuel } : {}),
        ...(p.fuelInitial ? { fuelInitial: p.fuelInitial } : {}),
      });
      if (!resolved) {
        req.log.warn({ plate: normalized.value, plateResult: p }, 'fipe_resolve_by_text_failed');
        throw new DomainError({
          code: 'FIPE_NOT_FOUND',
          message: `Could not resolve FIPE for ${p.brand} ${p.model} ${p.modelYear}. Ask the user to confirm details.`,
        });
      }
      return {
        success: true,
        data: {
          vehicle: mergePlateResolve(normalized.value, p, resolved),
          fipe: fipeFromResolveResult(resolved),
        },
        confidence: resolved.confidence,
        plateFormat: normalized.format,
        plateProvider: providers.plate.name,
        fipeProvider: 'sivisweb',
        requestId: req.requestId,
      };
    }

    // Path B: single vehicle provider (mock / Sivisweb BuscaPlaca / etc.).
    const found = await providers.vehicle.lookupByPlate(normalized.value);
    if (!found) {
      throw new DomainError({
        code: 'VEHICLE_NOT_FOUND',
        message: `No vehicle found for plate ${normalized.value}.`,
      });
    }

    let enrichedFipe = fipeFromLookup(found);
    let confidence = 0.9;

    if (!enrichedFipe && found.fipeCode) {
      try {
        const r = await providers.fipe.lookup({
          fipeCode: found.fipeCode,
          ...(found.brand !== undefined ? { brand: found.brand } : {}),
          ...(found.brandCode !== undefined ? { brandCode: found.brandCode } : {}),
          ...(found.model !== undefined ? { model: found.model } : {}),
          ...(found.modelCode !== undefined ? { modelCode: found.modelCode } : {}),
          modelYear: found.modelYear,
          ...(found.modelYearCode !== undefined ? { modelYearCode: found.modelYearCode } : {}),
          ...(found.vehicleType !== undefined && typeof found.vehicleType === 'number'
            ? { vehicleType: found.vehicleType }
            : {}),
        });
        if (r) enrichedFipe = fipeFromResult(r);
      } catch (err) {
        req.log.warn({ err }, 'fipe_lookup_failed_during_enrich');
      }
    }
    if (enrichedFipe) confidence = 1.0;
    else if (!found.fipeCode) confidence = 0.75;

    return {
      success: true,
      data: {
        vehicle: fromVehicleLookup(found),
        fipe: enrichedFipe,
      },
      confidence,
      plateFormat: normalized.format,
      provider: found.provider,
      requestId: req.requestId,
    };
  });
};

export default enrichRoutes;
