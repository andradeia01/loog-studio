import { env } from '../config/env.js';
import { DomainError } from '../lib/errors.js';
import { MockFipeProvider } from './fipe/mock.js';
import type { FipeProvider } from './fipe/types.js';
import { MockVehicleProvider } from './vehicle/mock.js';
import type { VehicleProvider } from './vehicle/types.js';
import { NoneQuoteProvider } from './quote/none.js';
import type { QuoteProvider } from './quote/types.js';
import { ApiBrasilPlateLookupProvider } from './plate/apibrasil.js';
import { MockPlateLookupProvider } from './plate/mock.js';
import { PlacasAppBrPlateLookupProvider } from './plate/placas-app-br.js';
import { PlaceFipePlateLookupProvider } from './plate/placafipe.js';
import { Wdapi2PlateLookupProvider } from './plate/wdapi2.js';
import type { PlateLookupProvider } from './plate/types.js';
import { SivisWebFipeProvider } from './sivisweb/fipe.js';
import { SivisWebFipeResolver } from './sivisweb/fipe-resolver.js';
import { SivisWebQuoteProvider } from './sivisweb/quote.js';
import { SivisWebSessionManager } from './sivisweb/session.js';
import { SivisWebVehicleProvider } from './sivisweb/vehicle.js';

export interface Providers {
  vehicle: VehicleProvider;
  fipe: FipeProvider;
  quote: QuoteProvider;
  plate: PlateLookupProvider | null;
  sivisWebFipeResolver: SivisWebFipeResolver | null;
}

let sivisweb: SivisWebSessionManager | null = null;

function getSivisWebSessions(): SivisWebSessionManager {
  if (sivisweb) return sivisweb;
  if (
    !env.SIVISWEB_BASE_URL ||
    !env.SIVISWEB_STORE_ID ||
    !env.SIVISWEB_USERNAME ||
    !env.SIVISWEB_PASSWORD
  ) {
    throw new DomainError({
      code: 'QUOTE_PROVIDER_UNAVAILABLE',
      message:
        'Sivisweb selected but SIVISWEB_BASE_URL/STORE_ID/USERNAME/PASSWORD are not fully configured.',
    });
  }
  sivisweb = new SivisWebSessionManager({
    baseUrl: env.SIVISWEB_BASE_URL,
    storeId: env.SIVISWEB_STORE_ID,
    username: env.SIVISWEB_USERNAME,
    password: env.SIVISWEB_PASSWORD,
    sessionTtlMinutes: env.SIVISWEB_SESSION_TTL_MINUTES,
  });
  return sivisweb;
}

export function getSivisWebSessionsForRoutes(): SivisWebSessionManager {
  return getSivisWebSessions();
}

export function buildProviders(): Providers {
  const vehicle: VehicleProvider =
    env.VEHICLE_API_PROVIDER === 'mock' && env.QUOTE_PROVIDER !== 'sivisweb'
      ? new MockVehicleProvider()
      : env.QUOTE_PROVIDER === 'sivisweb'
        ? new SivisWebVehicleProvider(getSivisWebSessions(), env.SIVISWEB_STORE_ID ?? '028')
        : new MockVehicleProvider();

  const fipe: FipeProvider =
    env.FIPE_API_PROVIDER === 'mock' && env.QUOTE_PROVIDER !== 'sivisweb'
      ? new MockFipeProvider()
      : env.QUOTE_PROVIDER === 'sivisweb'
        ? new SivisWebFipeProvider(env.SIVISWEB_STORE_ID ?? '028')
        : new MockFipeProvider();

  const quote: QuoteProvider =
    env.QUOTE_PROVIDER === 'sivisweb'
      ? new SivisWebQuoteProvider(getSivisWebSessions(), env.SIVISWEB_STORE_ID ?? '028', {
          consultorId: env.SIVISWEB_CONSULTOR_ID,
          hubBaseUrl: env.APP_URL,
        })
      : new NoneQuoteProvider();

  let plate: PlateLookupProvider | null = null;
  if (env.PLATE_LOOKUP_PROVIDER === 'mock') plate = new MockPlateLookupProvider();
  else if (env.PLATE_LOOKUP_PROVIDER === 'apibrasil') {
    if (!env.APIBRASIL_BEARER_TOKEN) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: 'PLATE_LOOKUP_PROVIDER=apibrasil requires APIBRASIL_BEARER_TOKEN.',
      });
    }
    plate = new ApiBrasilPlateLookupProvider({
      baseUrl: env.APIBRASIL_BASE_URL,
      ...(env.APIBRASIL_DEVICE_TOKEN ? { deviceToken: env.APIBRASIL_DEVICE_TOKEN } : {}),
      bearerToken: env.APIBRASIL_BEARER_TOKEN,
    });
  } else if (env.PLATE_LOOKUP_PROVIDER === 'wdapi2') {
    if (!env.WDAPI2_TOKEN) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: 'PLATE_LOOKUP_PROVIDER=wdapi2 requires WDAPI2_TOKEN.',
      });
    }
    plate = new Wdapi2PlateLookupProvider({
      baseUrl: env.WDAPI2_BASE_URL,
      token: env.WDAPI2_TOKEN,
    });
  } else if (env.PLATE_LOOKUP_PROVIDER === 'placas-app-br') {
    if (!env.PLACAS_APP_BR_TOKEN && !(env.PLACAS_APP_BR_EMAIL && env.PLACAS_APP_BR_PASSWORD)) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message:
          'PLATE_LOOKUP_PROVIDER=placas-app-br requires PLACAS_APP_BR_TOKEN or PLACAS_APP_BR_EMAIL + PLACAS_APP_BR_PASSWORD.',
      });
    }
    plate = new PlacasAppBrPlateLookupProvider({
      baseUrl: env.PLACAS_APP_BR_BASE_URL,
      ...(env.PLACAS_APP_BR_EMAIL ? { email: env.PLACAS_APP_BR_EMAIL } : {}),
      ...(env.PLACAS_APP_BR_PASSWORD ? { password: env.PLACAS_APP_BR_PASSWORD } : {}),
      ...(env.PLACAS_APP_BR_TOKEN ? { token: env.PLACAS_APP_BR_TOKEN } : {}),
    });
  } else if (env.PLATE_LOOKUP_PROVIDER === 'placafipe') {
    if (!env.PLACAFIPE_TOKEN) {
      throw new DomainError({
        code: 'VEHICLE_PROVIDER_UNAVAILABLE',
        message: 'PLATE_LOOKUP_PROVIDER=placafipe requires PLACAFIPE_TOKEN.',
      });
    }
    plate = new PlaceFipePlateLookupProvider({
      baseUrl: env.PLACAFIPE_BASE_URL,
      token: env.PLACAFIPE_TOKEN,
    });
  }

  const sivisWebFipeResolver =
    env.QUOTE_PROVIDER === 'sivisweb'
      ? new SivisWebFipeResolver(env.SIVISWEB_STORE_ID ?? '028')
      : null;

  return { vehicle, fipe, quote, plate, sivisWebFipeResolver };
}

/** For tests: allow replacing providers at runtime. */
let overrideProviders: Providers | null = null;
export function setProvidersForTest(p: Providers | null): void {
  overrideProviders = p;
}
export function getProviders(): Providers {
  return overrideProviders ?? buildProviders();
}
