import { ProviderError, ErrorCode } from '../errors.mjs';

function parseNumber(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function parseReset(v, now = Date.now()) {
  if (!v) return null;
  const n = Number(v);
  if (Number.isFinite(n)) return n > 10_000_000_000 ? n : (n > 1_000_000_000 ? n * 1000 : now + n * 1000);
  const date = Date.parse(v); return Number.isFinite(date) ? date : null;
}

export class OpenAICompatibleProvider {
  constructor({ id, modelId, baseUrl, apiKey, capabilities = ['text'], billingMode = 'free_only', paidAllowed = false, timeoutMs = 60_000, quality = 0.8, latencyMs = 1200, contextWindow = 128000, extraHeaders = {} }) {
    Object.assign(this, { id, modelId, baseUrl: baseUrl.replace(/\/$/, ''), apiKey, billingMode, paidAllowed, timeoutMs, quality, latencyMs, contextWindow, extraHeaders });
    this.capabilities = new Set(capabilities);
  }

  supports(requirements = {}) { return (requirements.capabilities || ['text']).every((c) => this.capabilities.has(c)); }

  async generate(request) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}`, ...this.extraHeaders },
        body: JSON.stringify({ model: this.modelId, messages: request.messages || [{ role: 'user', content: request.input }], temperature: request.temperature ?? 0.2 }),
      });
      const body = await res.json().catch(() => ({}));
      const headers = res.headers;
      const usage = {
        authoritative: true,
        requestLimit: parseNumber(headers.get('x-ratelimit-limit-requests')),
        tokenLimit: parseNumber(headers.get('x-ratelimit-limit-tokens')),
        requestsUsed: null,
        tokensUsed: parseNumber(body?.usage?.total_tokens),
        resetAt: parseReset(headers.get('x-ratelimit-reset-requests') || headers.get('retry-after')),
      };
      if (!res.ok) {
        const msg = body?.error?.message || `HTTP ${res.status}`;
        if (res.status === 429) throw new ProviderError(ErrorCode.QUOTA, msg, { status: 429, resetAt: usage.resetAt });
        if (res.status === 401 || res.status === 403) throw new ProviderError(ErrorCode.AUTH, msg, { status: res.status });
        if (res.status >= 500) throw new ProviderError(ErrorCode.SERVER, msg, { status: res.status });
        throw new ProviderError(ErrorCode.BAD_REQUEST, msg, { status: res.status });
      }
      const text = body?.choices?.[0]?.message?.content ?? body?.output_text ?? '';
      return { text, usage };
    } finally { clearTimeout(timer); }
  }
}
