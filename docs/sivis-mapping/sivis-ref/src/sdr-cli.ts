/**
 * LOOG SDR runtime — connects a WhatsApp number via Baileys and runs the
 * conversational agent loop. Single-number per process for the MVP.
 *
 * Usage:
 *   npm run sdr
 *
 * Environment:
 *   ANTHROPIC_API_KEY           required
 *   INTERNAL_API_KEY            required (envelope for the Hub HTTP layer)
 *   QUOTE_PROVIDER=sivisweb     required to enable Sivisweb integration
 *   SIVISWEB_USERNAME / SIVISWEB_PASSWORD  required for the Sivisweb path
 *   SDR_WHATSAPP_NUMBER_LABEL   any string; scopes the Baileys session folder
 */
import pino from 'pino';
import Anthropic from '@anthropic-ai/sdk';
import { env } from './config/env.js';
import { BaileysChannel } from './sdr/channels/whatsapp/baileys.js';
import { ConversationStore } from './sdr/persistence/store.js';
import { Orchestrator } from './sdr/orchestrator.js';

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    // eslint-disable-next-line no-console
    console.error('ANTHROPIC_API_KEY is required to run the SDR.');
    process.exit(1);
  }
  const logger = pino({
    level: env.LOG_LEVEL,
    transport:
      env.NODE_ENV === 'production'
        ? undefined
        : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        '*.password',
        '*.token',
        '*.cpf',
        '*.rg',
      ],
      censor: '[REDACTED]',
    },
  });
  logger.info({ label: env.SDR_WHATSAPP_NUMBER_LABEL }, 'SDR starting');

  const store = new ConversationStore();
  const anthropic = new Anthropic();

  const orchestrator = new Orchestrator({
    store,
    anthropic,
    logger,
    send: async (out) => {
      await channel.send(out);
    },
  });

  const channel = new BaileysChannel({
    label: env.SDR_WHATSAPP_NUMBER_LABEL,
    logger,
    onInbound: async (msg) => {
      logger.info(
        { phone: mask(msg.phone), preview: msg.text.slice(0, 80) },
        'inbound message received',
      );
      try {
        await orchestrator.handleInbound(msg);
      } catch (err) {
        logger.error({ err, phone: mask(msg.phone) }, 'orchestrator_error');
      }
    },
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    await channel.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await channel.start();
  logger.info('SDR loop ready — waiting for WhatsApp messages');
}

function mask(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length < 6) return '***';
  return `${d.slice(0, 4)}****${d.slice(-2)}`;
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal', err);
  process.exit(1);
});
