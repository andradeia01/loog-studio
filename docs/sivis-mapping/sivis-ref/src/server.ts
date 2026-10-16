import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import requestContext from './plugins/requestContext.js';
import auth from './plugins/auth.js';
import errorHandler from './plugins/errorHandler.js';
import healthRoutes from './routes/health.js';
import vehicleRoutes from './routes/vehicle.js';
import quoteRoutes from './routes/quote.js';
import quotePdfRoutes from './routes/quote-pdf.js';
import fipeRoutes from './routes/fipe.js';
import enrichRoutes from './routes/enrich.js';
import resolveRoutes from './routes/resolve.js';
import panelRoutes from './routes/panel.js';

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-meta-signature"]',
  '*.password',
  '*.token',
  '*.apiKey',
  '*.access_token',
  '*.cpf',
  '*.rg',
];

const isProd = env.NODE_ENV === 'production';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
      ...(isProd
        ? {}
        : {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:standard' },
            },
          }),
    },
    bodyLimit: 10 * 1024 * 1024,
    trustProxy: true,
    genReqId: () => `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  });

  await app.register(sensible);
  await app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    allowList: (req) => req.url.startsWith('/health'),
  });

  await app.register(requestContext);
  await app.register(errorHandler);
  await app.register(auth);

  await app.register(healthRoutes);
  await app.register(vehicleRoutes);
  await app.register(enrichRoutes);
  await app.register(resolveRoutes);
  await app.register(fipeRoutes);
  await app.register(quoteRoutes);
  await app.register(quotePdfRoutes);
  await app.register(panelRoutes);

  return app;
}
