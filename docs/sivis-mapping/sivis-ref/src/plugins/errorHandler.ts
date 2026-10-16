import fp from 'fastify-plugin';
import type { FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from '../lib/errors.js';

export default fp(async (app) => {
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.url} not found.`,
        retryable: false,
      },
      requestId: req.requestId,
    });
  });

  app.setErrorHandler((rawErr, req, reply) => {
    const err = rawErr as FastifyError & { statusCode?: number };
    if (err instanceof DomainError) {
      req.log.warn(
        {
          err: { code: err.code, message: err.message },
          requestId: req.requestId,
          statusCode: err.statusCode,
        },
        'domain_error',
      );
      return reply.status(err.statusCode).send({
        success: false,
        error: err.toPayload(),
        requestId: req.requestId,
      });
    }

    if (err instanceof ZodError) {
      req.log.warn(
        {
          issues: err.issues,
          requestId: req.requestId,
        },
        'validation_error',
      );
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload.',
          retryable: false,
          details: { issues: err.issues },
        },
        requestId: req.requestId,
      });
    }

    const statusCode = err.statusCode ?? 500;
    const isClientError = statusCode >= 400 && statusCode < 500;

    if (isClientError) {
      return reply.status(statusCode).send({
        success: false,
        error: {
          code: statusCode === 429 ? 'RATE_LIMITED' : 'VALIDATION_ERROR',
          message: err.message,
          retryable: statusCode === 429,
        },
        requestId: req.requestId,
      });
    }

    req.log.error(
      {
        err: { name: err.name, message: err.message, stack: err.stack },
        requestId: req.requestId,
      },
      'unhandled_error',
    );

    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        retryable: false,
      },
      requestId: req.requestId,
    });
  });
});
