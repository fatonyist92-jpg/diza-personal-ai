import { ProviderError, ErrorCode } from '../errors.mjs';

function parseNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/,/g,'').trim());
  return Number.isFinite(n) ? n : null;
}

export function parseReset(v, now = Date.now()) {
  if (!v) return null;
  const raw=String(v).trim().toLowerCase();
  const n=Number(raw);
  if (Number.isFinite(n)) {
    return n > 10_000_000_000 ? n : (n > 1_000_000_000 ? n * 1000 : now + n * 1000);
  }

  let totalMs=0,matched=false;
  const re=/([0-9]+(?:\.[0-9]+)?)\s*(ms|d|h|m|s)/g;
  let m;
  while((m=re.exec(raw))){
    matched=true;
    const value=Number(m[1]);
    const unit=m[2];
    totalMs+=unit==='d'?value*86400000
      :unit==='h'?value*3600000
      :unit==='m'?value*60000
      :unit==='s'?value*1000
      :value;
  }
  if(matched&&totalMs>0)return now+Math.round(totalMs);

  const date = Date.parse(v);
  return Number.isFinite(date) ? date : null;
}

function quotaWindow(metric,period,limit,remaining,resetAt){
  if(limit==null&&remaining==null&&resetAt==null)return null;
  return {
    metric,
    period:period||'header',
    limit,
    remaining,
    resetAt,
    authoritative:true
  };
}

export class OpenAICompatibleProvider {
  constructor({
    id,
    modelId,
    baseUrl,
    apiKey,
    capabilities = ['text'],
    billingMode = 'free_only',
    paidAllowed = false,
    timeoutMs = 60_000,
    quality = 0.8,
    latencyMs = 1200,
    contextWindow = 128000,
    extraHeaders = {},
    rateLimitSemantics = {},
    now = () => Date.now(),
    fetchImpl = globalThis.fetch
  }) {
    Object.assign(this, {
      id, modelId, baseUrl: baseUrl.replace(/\/$/, ''), apiKey,
      billingMode, paidAllowed, timeoutMs, quality, latencyMs,
      contextWindow, extraHeaders, rateLimitSemantics, now, fetchImpl
    });
    this.capabilities = new Set(capabilities);
  }

  supports(requirements = {}) {
    return (requirements.capabilities || ['text']).every((c) => this.capabilities.has(c));
  }

  async generate(request) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(this.baseUrl+'/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer '+this.apiKey,
          ...this.extraHeaders
        },
        body: JSON.stringify({
          model: this.modelId,
          messages: request.messages || [{ role: 'user', content: request.input }],
          temperature: request.temperature ?? 0.2
        }),
      });

      const body = await res.json().catch(() => ({}));
      const headers = res.headers;
      const reqLimit=parseNumber(headers?.get?.('x-ratelimit-limit-requests'));
      const reqRemaining=parseNumber(headers?.get?.('x-ratelimit-remaining-requests'));
      const tokenLimit=parseNumber(headers?.get?.('x-ratelimit-limit-tokens'));
      const tokenRemaining=parseNumber(headers?.get?.('x-ratelimit-remaining-tokens'));
      const reqReset=parseReset(headers?.get?.('x-ratelimit-reset-requests'),this.now());
      const tokenReset=parseReset(headers?.get?.('x-ratelimit-reset-tokens'),this.now());
      const retryReset=parseReset(headers?.get?.('retry-after'),this.now());

      const quotaWindows=[
        quotaWindow('requests',this.rateLimitSemantics.requests,reqLimit,reqRemaining,reqReset),
        quotaWindow('tokens',this.rateLimitSemantics.tokens,tokenLimit,tokenRemaining,tokenReset)
      ].filter(Boolean);

      const resetCandidates=[retryReset,reqReset,tokenReset].filter(Boolean);
      const usage = {
        authoritative: quotaWindows.length>0,
        quotaWindows,
        tokensConsumed: parseNumber(body?.usage?.total_tokens),
        resetAt: resetCandidates.length?Math.min(...resetCandidates):null,
      };

      if (!res.ok) {
        const msg = body?.error?.message || ('HTTP '+res.status);
        if (res.status === 429) {
          throw new ProviderError(ErrorCode.QUOTA, msg, {
            status: 429,
            resetAt: usage.resetAt,
            retryAfterMs: usage.resetAt ? Math.max(0,usage.resetAt-this.now()) : 60_000
          });
        }
        if (res.status === 401 || res.status === 403) {
          throw new ProviderError(ErrorCode.AUTH, msg, { status: res.status });
        }
        if (res.status >= 500) {
          throw new ProviderError(ErrorCode.SERVER, msg, { status: res.status });
        }
        throw new ProviderError(ErrorCode.BAD_REQUEST, msg, { status: res.status });
      }

      const text = body?.choices?.[0]?.message?.content ?? body?.output_text ?? '';
      return { text, usage };
    } finally {
      clearTimeout(timer);
    }
  }
}
