import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env.js';
import { DomainError } from '../lib/errors.js';

const PUBLIC_PREFIXES = ['/health', '/docs', '/webhooks/', '/panel'];

// GET /v1/quote/<id>/pdf?t=<token> — protected by the signed token itself,
// so the lead can open the link on WhatsApp without a Bearer.
const SIGNED_PDF_PATTERN = /^\/v1\/quote\/[^/]+\/pdf(?:\?|$)/;

const isPublic = (url: string, method: string): boolean => {
  if (PUBLIC_PREFIXES.some((p) => url.startsWith(p))) return true;
  if (method === 'GET' && SIGNED_PDF_PATTERN.test(url)) return true;
  return false;
};

const timingSafeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};

export default fp(async (app) => {
  app.addHook('onRequest', async (req: FastifyRequest, _reply: FastifyReply) => {
    if (req.method === 'OPTIONS') return;
    if (isPublic(req.url, req.method)) return;

    const header = req.headers.authorization;
    if (!header || typeof header !== 'string') {
      throw new DomainError({
        code: 'UNAUTHORIZED',
        message: 'Missing Authorization header.',
      });
    }

    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new DomainError({
        code: 'UNAUTHORIZED',
        message: 'Authorization scheme must be Bearer.',
      });
    }

    if (!timingSafeEqual(token, env.INTERNAL_API_KEY)) {
      throw new DomainError({
        code: 'UNAUTHORIZED',
        message: 'Invalid API key.',
      });
    }
  });
});
