import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { DomainError, notFound } from '../lib/errors.js';
import { getSivisWebSessionsForRoutes } from '../providers/factory.js';
import { getQuoteRecord, verifyPdfAccessToken } from '../providers/sivisweb/quote-store.js';

const Params = z.object({ quoteId: z.string().min(1) });
const Query = z.object({ t: z.string().min(1).optional() });

const quotePdfRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/quote/:quoteId/pdf', async (req, reply) => {
    if (env.QUOTE_PROVIDER !== 'sivisweb') {
      throw new DomainError({
        code: 'QUOTE_PROVIDER_UNAVAILABLE',
        message: 'PDF endpoint requires QUOTE_PROVIDER=sivisweb.',
      });
    }
    const { quoteId } = Params.parse(req.params);
    const { t } = Query.parse(req.query ?? {});
    const record = getQuoteRecord(quoteId);
    if (!record) {
      throw notFound(`No quote record for id ${quoteId} (may have expired or never issued).`);
    }
    // Public route (skips Bearer auth) — the signed token in ?t= must match.
    if (!t || !verifyPdfAccessToken(record.pdfAccessToken, t)) {
      throw new DomainError({
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid PDF access token.',
      });
    }

    const sessions = getSivisWebSessionsForRoutes();
    const http = await sessions.getConsultorSession();
    const cookieHeader = http.jar.header();

    const upstream = await fetch(record.sivisWebPrintUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/pdf,*/*;q=0.8',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
        'User-Agent': 'LoogSDRHub/1.0 (+sivisweb-pdf-proxy)',
      },
    });
    if (!upstream.ok) {
      throw new DomainError({
        code: 'QUOTE_PROVIDER_UNAVAILABLE',
        message: `Sivisweb returned ${upstream.status} when fetching the print URL.`,
        retryable: upstream.status >= 500,
      });
    }
    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
    const bytes = Buffer.from(await upstream.arrayBuffer());

    // If Sivisweb returned an HTML print view, mark it so callers know they
    // need to render to PDF client-side (or via a headless renderer we add
    // later). If it returned application/pdf, stream it as-is.
    reply.header('content-type', contentType);
    reply.header('cache-control', 'private, max-age=300');
    if (!contentType.includes('pdf')) {
      reply.header('x-loog-source-format', 'html');
      reply.header(
        'x-loog-hint',
        'Sivisweb returned printable HTML, not a PDF file. Zaia should render it via a headless browser or open as a link.',
      );
    }
    return reply.send(bytes);
  });
};

export default quotePdfRoutes;
