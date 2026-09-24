import { ErrorCode } from './errors.mjs';

const pct = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

export class QuotaLedger {
  constructor({ now = () => Date.now(), reserveRatio = 0.10, freeOnly = true } = {}) {
    this.now = now;
    this.reserveRatio = reserveRatio;
    this.freeOnly = freeOnly;
    this.records = new Map();
  }

  key(providerId, modelId = 'default') { return `${providerId}::${modelId}`; }

  upsert(providerId, modelId = 'default', patch = {}) {
    const key = this.key(providerId, modelId);
    const prev = this.records.get(key) || {
      providerId, modelId,
      quotaType: 'unknown', requestLimit: null, requestsUsed: 0,
      tokenLimit: null, tokensUsed: 0, creditRemaining: null,
      resetAt: null, cooldownUntil: null, disabled: false,
      billingMode: 'free_only', paidAllowed: false,
      healthScore: 1, consecutiveErrors: 0,
      authoritative: false,
      lastSuccess: null, lastError: null,
    };
    const next = { ...prev, ...patch, providerId, modelId };
    this.records.set(key, next);
    return next;
  }

  get(providerId, modelId = 'default') {
    return this.records.get(this.key(providerId, modelId)) || this.upsert(providerId, modelId);
  }

  refreshWindow(record) {
    const now = this.now();
    if (record.resetAt && now >= Number(record.resetAt)) {
      record.requestsUsed = 0;
      record.tokensUsed = 0;
      record.cooldownUntil = null;
      record.resetAt = null;
      record.consecutiveErrors = 0;
      record.healthScore = Math.max(record.healthScore, 0.7);
    }
    if (record.cooldownUntil && now >= Number(record.cooldownUntil)) record.cooldownUntil = null;
    return record;
  }

  remainingRatio(providerId, modelId = 'default') {
    const r = this.refreshWindow(this.get(providerId, modelId));
    const ratios = [];
    if (r.requestLimit != null && r.requestLimit > 0) ratios.push((r.requestLimit - r.requestsUsed) / r.requestLimit);
    if (r.tokenLimit != null && r.tokenLimit > 0) ratios.push((r.tokenLimit - r.tokensUsed) / r.tokenLimit);
    if (r.creditRemaining != null) ratios.push(r.creditRemaining > 0 ? 1 : 0);
    return ratios.length ? pct(Math.min(...ratios)) : 1;
  }

  canUse(provider, { estimatedTokens = 0 } = {}) {
    const r = this.refreshWindow(this.get(provider.id, provider.modelId));
    const now = this.now();
    if (r.disabled) return { ok: false, reason: 'disabled' };
    if (this.freeOnly && (provider.billingMode !== 'free_only' || provider.paidAllowed === true || r.paidAllowed === true)) {
      return { ok: false, reason: 'paid_blocked' };
    }
    if (r.cooldownUntil && now < r.cooldownUntil) return { ok: false, reason: 'cooldown', nextAt: r.cooldownUntil };
    if (r.requestLimit != null) {
      const usable = Math.floor(r.requestLimit * (1 - this.reserveRatio));
      if (r.requestsUsed + 1 > usable) return { ok: false, reason: 'request_reserve', nextAt: r.resetAt };
    }
    if (r.tokenLimit != null && estimatedTokens > 0) {
      const usable = Math.floor(r.tokenLimit * (1 - this.reserveRatio));
      if (r.tokensUsed + estimatedTokens > usable) return { ok: false, reason: 'token_reserve', nextAt: r.resetAt };
    }
    if (r.creditRemaining != null && r.creditRemaining <= 0) return { ok: false, reason: 'credit_empty', nextAt: r.resetAt };
    return { ok: true, remainingRatio: this.remainingRatio(provider.id, provider.modelId) };
  }

  reserve(provider, { estimatedTokens = 0 } = {}) {
    const check = this.canUse(provider, { estimatedTokens });
    if (!check.ok) return check;
    const r = this.get(provider.id, provider.modelId);
    r.requestsUsed += 1;
    r.tokensUsed += Math.max(0, estimatedTokens || 0);
    return { ok: true, record: r };
  }

  reconcile(provider, usage = {}) {
    const r = this.get(provider.id, provider.modelId);
    if (usage.requestsUsed != null) r.requestsUsed = Math.max(r.requestsUsed, Number(usage.requestsUsed));
    if (usage.tokensUsed != null) r.tokensUsed = Math.max(r.tokensUsed, Number(usage.tokensUsed));
    if (usage.requestLimit != null) r.requestLimit = Number(usage.requestLimit);
    if (usage.tokenLimit != null) r.tokenLimit = Number(usage.tokenLimit);
    if (usage.creditRemaining != null) r.creditRemaining = Number(usage.creditRemaining);
    if (usage.resetAt != null) r.resetAt = Number(usage.resetAt);
    if (usage.authoritative != null) r.authoritative = Boolean(usage.authoritative);
    return r;
  }

  markSuccess(provider, usage = {}) {
    const r = this.reconcile(provider, usage);
    r.lastSuccess = this.now();
    r.lastError = null;
    r.consecutiveErrors = 0;
    r.healthScore = Math.min(1, r.healthScore + 0.08);
  }

  markFailure(provider, error) {
    const r = this.get(provider.id, provider.modelId);
    r.lastError = { at: this.now(), code: error.code, message: error.message };
    r.consecutiveErrors += 1;
    r.healthScore = Math.max(0, r.healthScore - (error.code === ErrorCode.SERVER || error.code === ErrorCode.TIMEOUT ? 0.2 : 0.1));
    if (error.code === ErrorCode.AUTH || error.code === ErrorCode.PAID_REQUIRED) r.disabled = true;
    if (error.code === ErrorCode.QUOTA) {
      r.cooldownUntil = Number(error.resetAt || (this.now() + Number(error.retryAfterMs || 60_000)));
      if (error.resetAt) r.resetAt = Number(error.resetAt);
    }
    if ((error.code === ErrorCode.SERVER || error.code === ErrorCode.TIMEOUT || error.code === ErrorCode.NETWORK) && r.consecutiveErrors >= 3) {
      r.cooldownUntil = this.now() + 5 * 60_000;
    }
    return r;
  }

  nextResetAt(providers = []) {
    const times = providers.map((p) => {
      const r = this.refreshWindow(this.get(p.id, p.modelId));
      return [r.cooldownUntil, r.resetAt].filter(Boolean).map(Number);
    }).flat().filter((t) => t > this.now());
    return times.length ? Math.min(...times) : null;
  }

  snapshot() { return [...this.records.values()].map((x) => ({ ...x })); }
}
