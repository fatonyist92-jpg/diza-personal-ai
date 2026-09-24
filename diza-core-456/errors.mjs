export const ErrorCode = Object.freeze({
  QUOTA: 'QUOTA',
  TIMEOUT: 'TIMEOUT',
  SERVER: 'SERVER',
  AUTH: 'AUTH',
  BAD_REQUEST: 'BAD_REQUEST',
  PAID_REQUIRED: 'PAID_REQUIRED',
  NETWORK: 'NETWORK',
  UNKNOWN: 'UNKNOWN',
});

export class ProviderError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'ProviderError';
    this.code = code || ErrorCode.UNKNOWN;
    this.retryAfterMs = options.retryAfterMs ?? null;
    this.resetAt = options.resetAt ?? null;
    this.status = options.status ?? null;
    this.details = options.details ?? null;
  }
}

export function normalizeProviderError(error) {
  if (error instanceof ProviderError) return error;
  const status = Number(error?.status || error?.response?.status || 0) || null;
  if (status === 401 || status === 403) return new ProviderError(ErrorCode.AUTH, error?.message || 'Provider auth failed', { status });
  if (status === 429) return new ProviderError(ErrorCode.QUOTA, error?.message || 'Provider quota exhausted', { status });
  if (status && status >= 500) return new ProviderError(ErrorCode.SERVER, error?.message || 'Provider server error', { status });
  if (status && status >= 400) return new ProviderError(ErrorCode.BAD_REQUEST, error?.message || 'Provider request rejected', { status });
  if (error?.name === 'AbortError') return new ProviderError(ErrorCode.TIMEOUT, 'Provider request timed out');
  return new ProviderError(ErrorCode.UNKNOWN, error?.message || 'Unknown provider error');
}
