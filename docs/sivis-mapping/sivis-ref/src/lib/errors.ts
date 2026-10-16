export const ERROR_CODES = [
  'INVALID_PLATE',
  'VEHICLE_NOT_FOUND',
  'VEHICLE_PROVIDER_UNAVAILABLE',
  'FIPE_NOT_FOUND',
  'FIPE_PROVIDER_UNAVAILABLE',
  'DOCUMENT_UNREADABLE',
  'DOCUMENT_LOW_CONFIDENCE',
  'DOCUMENT_VEHICLE_MISMATCH',
  'TTS_FAILED',
  'WHATSAPP_SEND_FAILED',
  'QUOTE_PROVIDER_UNAVAILABLE',
  'QUOTE_LOGIN_FAILED',
  'RATE_LIMITED',
  'UNAUTHORIZED',
  'VALIDATION_ERROR',
  'PAYLOAD_TOO_LARGE',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface DomainErrorPayload {
  code: ErrorCode;
  message: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: ErrorCode;
    message: string;
    statusCode?: number;
    retryable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(input.message);
    this.name = 'DomainError';
    this.code = input.code;
    this.statusCode = input.statusCode ?? DomainError.defaultStatus(input.code);
    this.retryable = input.retryable ?? DomainError.defaultRetryable(input.code);
    if (input.details) this.details = input.details;
  }

  toPayload(): DomainErrorPayload {
    const base: DomainErrorPayload = {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
    };
    if (this.details) base.details = this.details;
    return base;
  }

  static defaultStatus(code: ErrorCode): number {
    switch (code) {
      case 'INVALID_PLATE':
      case 'VALIDATION_ERROR':
        return 400;
      case 'UNAUTHORIZED':
        return 401;
      case 'NOT_FOUND':
      case 'VEHICLE_NOT_FOUND':
      case 'FIPE_NOT_FOUND':
        return 404;
      case 'METHOD_NOT_ALLOWED':
        return 405;
      case 'PAYLOAD_TOO_LARGE':
        return 413;
      case 'DOCUMENT_UNREADABLE':
      case 'DOCUMENT_LOW_CONFIDENCE':
      case 'DOCUMENT_VEHICLE_MISMATCH':
        return 422;
      case 'RATE_LIMITED':
        return 429;
      case 'VEHICLE_PROVIDER_UNAVAILABLE':
      case 'FIPE_PROVIDER_UNAVAILABLE':
      case 'QUOTE_PROVIDER_UNAVAILABLE':
      case 'TTS_FAILED':
      case 'WHATSAPP_SEND_FAILED':
      case 'QUOTE_LOGIN_FAILED':
        return 502;
      case 'INTERNAL_ERROR':
      default:
        return 500;
    }
  }

  static defaultRetryable(code: ErrorCode): boolean {
    switch (code) {
      case 'VEHICLE_PROVIDER_UNAVAILABLE':
      case 'FIPE_PROVIDER_UNAVAILABLE':
      case 'QUOTE_PROVIDER_UNAVAILABLE':
      case 'TTS_FAILED':
      case 'WHATSAPP_SEND_FAILED':
      case 'RATE_LIMITED':
        return true;
      default:
        return false;
    }
  }
}

export const unauthorized = (message = 'Missing or invalid credentials.'): DomainError =>
  new DomainError({ code: 'UNAUTHORIZED', message });

export const validationError = (
  message: string,
  details?: Record<string, unknown>,
): DomainError => {
  const err = new DomainError({ code: 'VALIDATION_ERROR', message });
  if (details) (err as { details?: Record<string, unknown> }).details = details;
  return err;
};

export const notFound = (message = 'Resource not found.'): DomainError =>
  new DomainError({ code: 'NOT_FOUND', message });
