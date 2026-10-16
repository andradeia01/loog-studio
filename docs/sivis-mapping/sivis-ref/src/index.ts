import { env } from './config/env.js';
import { buildServer } from './server.js';
import { getSivisWebSessionsForRoutes } from './providers/factory.js';

const shutdownSignals = ['SIGINT', 'SIGTERM'] as const;

/**
 * Cold-start Sivisweb login so the first real quote request doesn't pay the
 * 2-3s login RTT. Runs fire-and-forget after the HTTP server is listening —
 * failures just log; the on-demand session flow still works as fallback.
 */
async function warmSivisWebSession(app: import('fastify').FastifyInstance): Promise<void> {
  if (env.QUOTE_PROVIDER !== 'sivisweb') return;
  const started = Date.now();
  try {
    const sessions = getSivisWebSessionsForRoutes();
    await sessions.getConsultorSession();
    app.log.info(
      { elapsed_ms: Date.now() - started },
      'sivisweb_session_warmed',
    );
  } catch (err) {
    app.log.warn({ err, elapsed_ms: Date.now() - started }, 'sivisweb_warmup_failed');
  }
}

async function main(): Promise<void> {
  const app = await buildServer();

  for (const signal of shutdownSignals) {
    process.on(signal, async () => {
      app.log.info({ signal }, 'shutdown_signal_received');
      try {
        await app.close();
        process.exit(0);
      } catch (err) {
        app.log.error({ err }, 'shutdown_error');
        process.exit(1);
      }
    });
  }

  try {
    await app.listen({ host: '0.0.0.0', port: env.PORT });
    // Warm login AFTER the server is accepting requests, so /health can respond
    // during the ~2-3s the Sivisweb login takes on cold start.
    void warmSivisWebSession(app);
  } catch (err) {
    app.log.error({ err }, 'listen_failed');
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal_bootstrap_error', err);
  process.exit(1);
});
