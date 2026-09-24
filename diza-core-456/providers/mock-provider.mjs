import { ProviderError, ErrorCode } from '../errors.mjs';

export class MockProvider {
  constructor({ id, modelId = 'mock', capabilities = ['text'], billingMode = 'free_only', paidAllowed = false, latencyMs = 50, quality = 0.8, contextWindow = 128000, behavior } = {}) {
    this.id = id;
    this.modelId = modelId;
    this.capabilities = new Set(capabilities);
    this.billingMode = billingMode;
    this.paidAllowed = paidAllowed;
    this.latencyMs = latencyMs;
    this.quality = quality;
    this.contextWindow = contextWindow;
    this.behavior = behavior || (async (req) => ({ text: `[${id}] ${req.input}`, usage: { tokensUsed: req.estimatedTokens || 1 } }));
    this.calls = [];
  }

  supports(requirements = {}) {
    return (requirements.capabilities || ['text']).every((c) => this.capabilities.has(c));
  }

  async generate(request) {
    this.calls.push(structuredClone(request));
    const result = await this.behavior(request, this.calls.length);
    if (result instanceof Error) throw result;
    if (result?.errorCode) throw new ProviderError(result.errorCode, result.message || result.errorCode, result.options || {});
    return result;
  }
}

export function quotaFailure({ resetAt, retryAfterMs } = {}) {
  return { errorCode: ErrorCode.QUOTA, message: 'quota exhausted', options: { resetAt, retryAfterMs } };
}
