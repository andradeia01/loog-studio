import path from 'node:path';
import fs from 'node:fs';
import type { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
  type WAMessage,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { env } from '../../../config/env.js';
import type { InboundMessage, OutboundMessage } from '../../orchestrator.js';

/**
 * ⚠️ BAILEYS violates the WhatsApp Terms of Service. Numbers connected here
 * can be banned by Meta at any time, especially with high outbound volume.
 * Use only with numbers you accept losing, warm them up, and rotate.
 */
export interface BaileysChannelOptions {
  label: string;
  authDir?: string;
  logger?: pino.Logger;
  onInbound: (msg: InboundMessage) => Promise<void>;
}

export class BaileysChannel {
  private sock: WASocket | null = null;
  private readonly authDir: string;
  private readonly logger: pino.Logger;
  private connected = false;
  private starting = false;

  constructor(private readonly opts: BaileysChannelOptions) {
    this.authDir =
      opts.authDir ??
      path.resolve(env.SDR_DATA_DIR, 'baileys', opts.label.replace(/[^a-z0-9_-]/gi, '_'));
    fs.mkdirSync(this.authDir, { recursive: true });
    this.logger = opts.logger ?? pino({ level: 'warn' }).child({ channel: 'baileys' });
  }

  async start(): Promise<void> {
    if (this.starting || this.connected) return;
    this.starting = true;
    try {
      await this.connect();
    } finally {
      this.starting = false;
    }
  }

  private async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(this.authDir);
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: this.logger.child({ scope: 'baileys-lib' }) as unknown as pino.Logger,
      browser: ['LOOG SDR', 'Chrome', '1.0'],
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    this.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        this.logger.info('QR code received — scan it with the WhatsApp app on the phone:');
        qrcode.generate(qr, { small: true });
      }
      if (connection === 'open') {
        this.connected = true;
        this.logger.info({ label: this.opts.label }, 'WhatsApp connected');
      } else if (connection === 'close') {
        this.connected = false;
        const status = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const shouldReconnect = status !== DisconnectReason.loggedOut;
        this.logger.warn({ status, shouldReconnect }, 'WhatsApp connection closed');
        if (shouldReconnect) {
          setTimeout(() => {
            this.connect().catch((err) => this.logger.error({ err }, 'reconnect failed'));
          }, 2000);
        } else {
          this.logger.error(
            'This session was logged out. Delete the auth folder and start again to pair a new number.',
          );
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        try {
          await this.handleIncoming(msg);
        } catch (err) {
          this.logger.error({ err }, 'inbound_handler_error');
        }
      }
    });
  }

  private async handleIncoming(msg: WAMessage): Promise<void> {
    if (msg.key.fromMe) return;
    if (!msg.message) return;

    const jid = msg.key.remoteJid;
    if (!jid) return;
    // Only accept 1:1 user JIDs — reject groups, newsletters, broadcasts,
    // status broadcasts and WhatsApp "LID" identifiers (not real phones).
    if (!jid.endsWith('@s.whatsapp.net')) {
      this.logger.debug({ jid }, 'ignoring non-user JID');
      return;
    }

    const phone = jidToPhone(jid);
    // Brazilian mobile is 12–13 digits (55 + DDD + 8-9). Anything shorter or
    // wildly longer (LID leaks, group ids) is not a real lead phone.
    if (phone.length < 10 || phone.length > 15) {
      this.logger.debug({ jid, phone: mask(phone) }, 'ignoring — phone length out of range');
      return;
    }

    const text = extractText(msg);
    if (!text) return; // ignore stickers, images-only, audios etc. in MVP

    const displayName = msg.pushName ?? undefined;
    await this.opts.onInbound({
      phone,
      ...(displayName ? { displayName } : {}),
      text,
      receivedAt: new Date(Number(msg.messageTimestamp ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      raw: msg,
    });
  }

  async send(out: OutboundMessage): Promise<void> {
    if (!this.sock || !this.connected) {
      throw new Error('Baileys socket not connected — cannot send.');
    }
    const jid = phoneToJid(out.phone);

    if (out.quoteWhatsappMessage) {
      await this.sock.sendMessage(jid, { text: out.quoteWhatsappMessage });
      await new Promise((r) => setTimeout(r, 800));
    }
    if (out.text) {
      await this.sock.sendMessage(jid, { text: out.text });
    }
    if (out.handoffReason) {
      this.logger.warn(
        { phone: mask(out.phone), reason: out.handoffReason },
        'HUMAN_HANDOFF requested — notify the ops channel manually for now',
      );
    }
  }

  async stop(): Promise<void> {
    try {
      await this.sock?.end(undefined);
    } catch {
      // ignore
    }
  }
}

function jidToPhone(jid: string): string {
  const bare = jid.split('@')[0] ?? '';
  return bare.replace(/[^0-9]/g, '');
}

function phoneToJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return `${digits}@s.whatsapp.net`;
}

function extractText(msg: WAMessage): string | undefined {
  const m = msg.message;
  if (!m) return undefined;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.ephemeralMessage?.message?.conversation) return m.ephemeralMessage.message.conversation;
  if (m.ephemeralMessage?.message?.extendedTextMessage?.text)
    return m.ephemeralMessage.message.extendedTextMessage.text;
  return undefined;
}

function mask(phone: string): string {
  const d = phone.replace(/\D/g, '');
  if (d.length < 6) return '***';
  return `${d.slice(0, 4)}****${d.slice(-2)}`;
}
