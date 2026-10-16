import fp from 'fastify-plugin';
import { newCorrelationId, newRequestId } from '../lib/ids.js';

declare module 'fastify' {
  interface FastifyRequest {
    requestId: string;
    correlationId: string;
    leadId?: string;
  }
}

export default fp(async (app) => {
  app.addHook('onRequest', async (req, reply) => {
    const incomingRequestId =
      req.headers['x-request-id'] && typeof req.headers['x-request-id'] === 'string'
        ? req.headers['x-request-id']
        : undefined;
    const incomingCorrelationId =
      req.headers['x-correlation-id'] && typeof req.headers['x-correlation-id'] === 'string'
        ? req.headers['x-correlation-id']
        : undefined;
    const leadIdHeader =
      req.headers['x-lead-id'] && typeof req.headers['x-lead-id'] === 'string'
        ? req.headers['x-lead-id']
        : undefined;

    req.requestId = incomingRequestId ?? newRequestId();
    req.correlationId = incomingCorrelationId ?? newCorrelationId();
    if (leadIdHeader) req.leadId = leadIdHeader;

    reply.header('x-request-id', req.requestId);
    reply.header('x-correlation-id', req.correlationId);
  });
});
