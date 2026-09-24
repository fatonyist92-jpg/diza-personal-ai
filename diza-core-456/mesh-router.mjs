import { normalizeProviderError, ErrorCode } from './errors.mjs';

export function inferRequirements(input = {}) {
  if (input.requirements) return input.requirements;
  const text = String(input.input || input.prompt || '').toLowerCase();
  const caps = new Set(['text']);
  if (input.hasImage || /image|photo|gambar|foto|vision/.test(text)) caps.add('vision');
  if (input.hasPdf || /pdf|document|dokumen/.test(text)) caps.add('document');
  if (/code|coding|repo|github|bug|typescript|javascript|python/.test(text)) caps.add('coding');
  return { capabilities: [...caps], privacy: input.privacy || 'standard', longContext: Boolean(input.longContext) };
}

export class IdempotencyStore {
  constructor(snapshot = []) {
    this.map = new Map(snapshot);
  }
  get(key) { return this.map.get(key); }
  set(key, value) { this.map.set(key, value); }
  snapshot() { return [...this.map.entries()]; }
  import(snapshot = []) { this.map = new Map(snapshot); }
}

export class MeshRouter {
  constructor({ providers = [], ledger, idempotency = new IdempotencyStore(), now = () => Date.now() } = {}) {
    this.providers = [...providers];
    this.ledger = ledger;
    this.idempotency = idempotency;
    this.now = now;
  }

  register(provider) { this.providers.push(provider); return provider; }
  setProviders(providers = []) { this.providers = [...providers]; return this.providers; }
  listProviders() { return [...this.providers]; }

  score(provider, request, requirements) {
    const quota = this.ledger.canUse(provider, { estimatedTokens: request.estimatedTokens || 0 });
    if (!quota.ok || !provider.supports(requirements)) return { provider, eligible: false, reason: quota.reason || 'capability' };
    const record = this.ledger.get(provider.id, provider.modelId);
    const capFit = 1;
    const quotaHealth = quota.remainingRatio ?? 1;
    const reliability = record.healthScore ?? 1;
    const latency = 1 / (1 + Math.max(0, provider.latencyMs || 0) / 2000);
    const quality = provider.quality ?? 0.7;
    const contextFit = requirements.longContext ? Math.min(1, (provider.contextWindow || 0) / 500_000) : 1;
    const privacyFit = requirements.privacy === 'strict' ? (provider.privacyClass === 'strict' ? 1 : 0) : 1;
    if (privacyFit === 0) return { provider, eligible: false, reason: 'privacy' };
    const score = capFit * 30 + quotaHealth * 30 + reliability * 20 + latency * 8 + quality * 8 + contextFit * 4;
    return { provider, eligible: true, score, quotaHealth, reliability };
  }

  ranked(request) {
    const requirements = inferRequirements(request);
    return this.providers.map((p) => this.score(p, request, requirements))
      .filter((x) => x.eligible)
      .sort((a, b) => b.score - a.score);
  }

  async execute(request) {
    if (!request.requestId) throw new Error('requestId is required for idempotency');
    const cached = this.idempotency.get(request.requestId);
    if (cached) return { ...cached, cached: true };

    const requirements = inferRequirements(request);
    const candidates = this.ranked({ ...request, requirements });
    const attempts = [];
    const maxProviderAttempts = Number.isFinite(request.maxProviderAttempts)
      ? Math.max(0, Math.floor(request.maxProviderAttempts))
      : candidates.length;

    for (const entry of candidates) {
      if (attempts.length >= maxProviderAttempts) break;
      const p = entry.provider;
      const reservation = this.ledger.reserve(p, { estimatedTokens: request.estimatedTokens || 0 });
      if (!reservation.ok) continue;

      try {
        const result = await p.generate({ ...request, requirements });
        this.ledger.markSuccess(p, result.usage || {});
        const output = {
          providerId: p.id,
          modelId: p.modelId,
          text: result.text,
          usage: result.usage || {},
          attempts: [...attempts, { providerId: p.id, ok: true }]
        };
        this.idempotency.set(request.requestId, output);
        return output;
      } catch (raw) {
        const error = normalizeProviderError(raw);
        this.ledger.markFailure(p, error);
        attempts.push({ providerId: p.id, ok: false, code: error.code, message: error.message });
        if (error.code === ErrorCode.BAD_REQUEST) continue;
        if ([ErrorCode.QUOTA, ErrorCode.TIMEOUT, ErrorCode.SERVER, ErrorCode.NETWORK, ErrorCode.AUTH, ErrorCode.PAID_REQUIRED, ErrorCode.UNKNOWN].includes(error.code)) continue;
      }
    }

    const nextAt = this.ledger.nextResetAt(this.providers);
    const err = new Error('No compatible free provider is currently available');
    err.code = 'NO_FREE_PROVIDER';
    err.nextAt = nextAt;
    err.attempts = attempts;
    throw err;
  }
}
