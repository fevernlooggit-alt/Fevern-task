// Canonical error envelope (PRD §8): { error: { code, message, details? } }.

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toEnvelope() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }
}

export const Errors = {
  unauthorized: (msg = 'Authentication required') => new ApiError(401, 'unauthorized', msg),
  forbidden: (msg = 'Insufficient permissions') => new ApiError(403, 'forbidden', msg),
  notFound: (msg = 'Resource not found') => new ApiError(404, 'not_found', msg),
  validation: (msg = 'Invalid request', details?: unknown) =>
    new ApiError(422, 'validation_error', msg, details),
  /** Illegal state-machine transition — PRD §8 maps this to 422. */
  illegalTransition: (msg: string, details?: unknown) =>
    new ApiError(422, 'illegal_transition', msg, details),
  /** Lock collision — PRD §8 maps this to 409, includes current holder. */
  conflict: (msg: string, details?: unknown) => new ApiError(409, 'conflict', msg, details),
  badRequest: (msg = 'Bad request', details?: unknown) =>
    new ApiError(400, 'bad_request', msg, details),
  tooManyRequests: (msg = 'Too many requests', details?: unknown) =>
    new ApiError(429, 'too_many_requests', msg, details),
  internal: (msg = 'Internal server error') => new ApiError(500, 'internal_error', msg),
};
