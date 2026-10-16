import Anthropic from '@anthropic-ai/sdk';
import pino from 'pino';
import { env } from '../config/env.js';
import { runAgentTurn } from './engine/agent.js';
import { ConversationStore } from './persistence/store.js';
import type { Conversation } from './types.js';

export interface InboundMessage {
  phone: string;
  displayName?: string;
  text: string;
  receivedAt: string;
  raw?: unknown;
}

export interface OutboundMessage {
  phone: string;
  text: string;
  quoteWhatsappMessage?: string;
  handoffReason?: string;
}

export interface OrchestratorDeps {
  store: ConversationStore;
  anthropic: Anthropic;
  logger: pino.Logger;
  send: (msg: OutboundMessage) => Promise<void>;
}

/**
 * Central turn processor: inbound WhatsApp message → agent → outbound.
 * All state mutations serialize per phone via the store's lock.
 */
export class Orchestrator {
  constructor(private readonly deps: OrchestratorDeps) {}

  async handleInbound(msg: InboundMessage): Promise<void> {
    const { store, logger, send, anthropic } = this.deps;
    await store.withLock(msg.phone, async () => {
      const conv = await store.getOrCreate(msg.phone, msg.displayName);
      if (isTerminalAndSilent(conv)) {
        logger.info(
          { phone: mask(msg.phone), stage: conv.stage },
          'skipping — stage is terminal/handoff, SDR is silent',
        );
        return;
      }
      const turn = await runAgentTurn(
        {
          conversation: conv,
          userMessage: msg.text,
          logger: (m, extra) => logger.info({ phone: mask(msg.phone), ...(extra ?? {}) }, m),
        },
        { client: anthropic },
      );
      await store.save(turn.updatedConversation);
      logger.info(
        {
          phone: mask(msg.phone),
          stage: turn.updatedConversation.stage,
          tokensIn: turn.tokensIn,
          tokensOut: turn.tokensOut,
          toolCalls: turn.toolCalls.map((t) => t.name),
        },
        'agent_turn_done',
      );

      if (!turn.assistantText && !turn.updatedConversation.quote?.whatsappMessage) {
        logger.warn({ phone: mask(msg.phone) }, 'agent produced no text');
        return;
      }

      // If the agent just closed a quote, prefer sending the official portal message,
      // then the agent's own text as a follow-up.
      const quoteMsg = didJustQuote(conv, turn.updatedConversation)
        ? turn.updatedConversation.quote?.whatsappMessage
        : undefined;

      const out: OutboundMessage = {
        phone: msg.phone,
        text: turn.assistantText,
        ...(quoteMsg ? { quoteWhatsappMessage: quoteMsg } : {}),
        ...(turn.updatedConversation.handoffReason && conv.handoffReason !== turn.updatedConversation.handoffReason
          ? { handoffReason: turn.updatedConversation.handoffReason }
          : {}),
      };
      await send(out);
    });
  }
}

function isTerminalAndSilent(c: Conversation): boolean {
  return c.stage === 'HUMAN_HANDOFF' || c.stage === 'WON' || c.stage === 'LOST' || c.stage === 'NURTURE';
}

function didJustQuote(before: Conversation, after: Conversation): boolean {
  const wasThere = Boolean(before.quote?.quoteId);
  const isThere = Boolean(after.quote?.quoteId);
  const changed = before.quote?.quoteId !== after.quote?.quoteId;
  return !wasThere && isThere && changed;
}

function mask(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 6) return '***';
  return `${digits.slice(0, 4)}****${digits.slice(-2)}`;
}

export function defaultOrchestrator(deps: {
  store?: ConversationStore;
  anthropic?: Anthropic;
  logger?: pino.Logger;
  send: (msg: OutboundMessage) => Promise<void>;
}): Orchestrator {
  return new Orchestrator({
    store: deps.store ?? new ConversationStore(),
    anthropic:
      deps.anthropic ??
      new Anthropic(
        env.ANTHROPIC_WORKSPACE_ID
          ? { defaultHeaders: { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } }
          : {},
      ),
    logger:
      deps.logger ??
      pino({
        level: env.LOG_LEVEL,
        redact: {
          paths: ['*.cpf', '*.rg', '*.password', '*.token'],
          censor: '[REDACTED]',
        },
      }),
    send: deps.send,
  });
}
