import { randomUUID } from 'node:crypto';

export const newRequestId = (): string => `req_${randomUUID()}`;
export const newCorrelationId = (): string => `cor_${randomUUID()}`;
