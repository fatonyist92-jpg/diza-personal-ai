import { ErrorCode } from './errors.mjs';

const pct = (n) => Math.max(0, Math.min(1, Number.isFinite(n) ? n : 0));

function cloneWindow(w){
  return {
    metric:String(w.metric||'requests'),
    period:String(w.period||'unknown'),
    limit:w.limit==null?null:Number(w.limit),
    used:w.used==null?0:Number(w.used),
    remaining:w.remaining==null?null:Number(w.remaining),
    resetAt:w.resetAt==null?null:Number(w.resetAt),
    periodMs:w.periodMs==null?null:Number(w.periodMs),
    authoritative:Boolean(w.authoritative),
  };
}
function windowKey(w){return String(w.metric||'requests')+':'+String(w.period||'unknown');}

export class QuotaLedger {
  constructor({ now = () => Date.now(), reserveRatio = 0.10, freeOnly = true } = {}) {
    this.now = now;
    this.reserveRatio = reserveRatio;
    this.freeOnly = freeOnly;
    this.records = new Map();
  }

  key(providerId, modelId = 'default') { return providerId + '::' + modelId; }

  upsert(providerId, modelId = 'default', patch = {}) {
    const key = this.key(providerId, modelId);
    const prev = this.records.get(key) || {
      providerId, modelId,
      quotaType: 'unknown', periodMs: null,
      requestLimit: null, requestsUsed: 0,
      tokenLimit: null, tokensUsed: 0,
      creditRemaining: null,
      resetAt: null, cooldownUntil: null, disabled: false,
      billingMode: 'free_only', paidAllowed: false,
      healthScore: 1, consecutiveErrors: 0,
      authoritative: false,
      lastSuccess: null, lastError: null,
      windows: {},
    };
    const next = { ...prev, ...patch, providerId, modelId };
    next.windows = { ...(prev.windows || {}), ...(patch.windows || {}) };
    if (Array.isArray(patch.quotaWindows)) {
      for (const raw of patch.quotaWindows) {
        const w=cloneWindow(raw);
        next.windows[windowKey(w)]={...(next.windows[windowKey(w)]||{}),...w};
      }
    }
    delete next.quotaWindows;
    this.records.set(key, next);
    return next;
  }

  get(providerId, modelId = 'default') {
    return this.records.get(this.key(providerId, modelId)) || this.upsert(providerId, modelId);
  }

  refreshOneWindow(w) {
    const now=this.now();
    if (w.resetAt && now >= Number(w.resetAt)) {
      w.used=0;
      w.remaining=w.limit;
      if (w.periodMs && Number(w.periodMs)>0) {
        let next=Number(w.resetAt);
        while(next<=now)next+=Number(w.periodMs);
        w.resetAt=next;
      } else {
        w.resetAt=null;
      }
    }
    return w;
  }

  refreshWindow(record) {
    const now = this.now();
    for (const w of Object.values(record.windows || {})) this.refreshOneWindow(w);

    if (record.resetAt && now >= Number(record.resetAt)) {
      record.requestsUsed = 0;
      record.tokensUsed = 0;
      record.cooldownUntil = null;
      record.consecutiveErrors = 0;
      record.healthScore = Math.max(record.healthScore, 0.7);
      if (record.periodMs && Number(record.periodMs) > 0) {
        let next = Number(record.resetAt);
        while (next <= now) next += Number(record.periodMs);
        record.resetAt = next;
      } else {
        record.resetAt = null;
      }
    }
    if (record.cooldownUntil && now >= Number(record.cooldownUntil)) record.cooldownUntil = null;
    return record;
  }

  windowRemainingRatio(w){
    this.refreshOneWindow(w);
    if(w.limit==null||w.limit<=0)return 1;
    const remaining=w.remaining!=null?w.remaining:(w.limit-(w.used||0));
    return pct(remaining/w.limit);
  }

  remainingRatio(providerId, modelId = 'default') {
    const r = this.refreshWindow(this.get(providerId, modelId));
    const ratios = [];
    for(const w of Object.values(r.windows||{})){
      if(w.limit!=null&&w.limit>0)ratios.push(this.windowRemainingRatio(w));
    }
    if (r.requestLimit != null && r.requestLimit > 0) ratios.push((r.requestLimit - r.requestsUsed) / r.requestLimit);
    if (r.tokenLimit != null && r.tokenLimit > 0) ratios.push((r.tokenLimit - r.tokensUsed) / r.tokenLimit);
    if (r.creditRemaining != null) ratios.push(r.creditRemaining > 0 ? 1 : 0);
    return ratios.length ? pct(Math.min(...ratios)) : 1;
  }

  deltaForWindow(w,estimatedTokens){
    if(w.metric==='requests')return 1;
    if(w.metric==='tokens')return Math.max(0,estimatedTokens||0);
    return 0;
  }

  canUse(provider, { estimatedTokens = 0 } = {}) {
    const r = this.refreshWindow(this.get(provider.id, provider.modelId));
    const now = this.now();
    if (r.disabled) return { ok: false, reason: 'disabled' };
    if (this.freeOnly && (provider.billingMode !== 'free_only' || provider.paidAllowed === true || r.paidAllowed === true)) {
      return { ok: false, reason: 'paid_blocked' };
    }
    if (r.cooldownUntil && now < r.cooldownUntil) return { ok: false, reason: 'cooldown', nextAt: r.cooldownUntil };

    for(const w of Object.values(r.windows||{})){
      if(w.limit==null||w.limit<=0)continue;
      const delta=this.deltaForWindow(w,estimatedTokens);
      if(delta<=0)continue;
      const usable=Math.floor(w.limit*(1-this.reserveRatio));
      const used=w.remaining!=null?(w.limit-w.remaining):(w.used||0);
      if(used+delta>usable){
        return {ok:false,reason:w.metric+'_reserve',nextAt:w.resetAt||null,window:{...w}};
      }
    }

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

    for(const w of Object.values(r.windows||{})){
      if(w.authoritative && w.remaining!=null)continue;
      const delta=this.deltaForWindow(w,estimatedTokens);
      w.used=(w.used||0)+delta;
      if(w.limit!=null)w.remaining=Math.max(0,w.limit-w.used);
    }

    r.requestsUsed += 1;
    r.tokensUsed += Math.max(0, estimatedTokens || 0);
    return { ok: true, record: r };
  }

  reconcileWindows(r,windows=[]){
    for(const raw of windows){
      const incoming=cloneWindow(raw);
      const key=windowKey(incoming);
      const prev=r.windows?.[key]||{};
      const next={...prev,...incoming};
      if(next.limit!=null&&incoming.remaining!=null){
        next.used=Math.max(0,next.limit-incoming.remaining);
      }
      r.windows=r.windows||{};
      r.windows[key]=next;
    }
  }

  reconcile(provider, usage = {}) {
    const r = this.get(provider.id, provider.modelId);
    if(Array.isArray(usage.quotaWindows))this.reconcileWindows(r,usage.quotaWindows);
    if (usage.requestsUsed != null) r.requestsUsed = Math.max(r.requestsUsed, Number(usage.requestsUsed));
    if (usage.tokensUsed != null && !Array.isArray(usage.quotaWindows)) r.tokensUsed = Math.max(r.tokensUsed, Number(usage.tokensUsed));
    if (usage.requestLimit != null) r.requestLimit = Number(usage.requestLimit);
    if (usage.tokenLimit != null) r.tokenLimit = Number(usage.tokenLimit);
    if (usage.creditRemaining != null) r.creditRemaining = Number(usage.creditRemaining);
    if (usage.resetAt != null) r.resetAt = Number(usage.resetAt);
    if (usage.periodMs != null) r.periodMs = Number(usage.periodMs);
    if (usage.quotaType != null) r.quotaType = String(usage.quotaType);
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
    const times=[];
    for(const p of providers){
      const r=this.refreshWindow(this.get(p.id,p.modelId));
      for(const t of [r.cooldownUntil,r.resetAt]){
        if(t&&Number(t)>this.now())times.push(Number(t));
      }
      for(const w of Object.values(r.windows||{})){
        if(w.resetAt&&Number(w.resetAt)>this.now())times.push(Number(w.resetAt));
      }
    }
    return times.length ? Math.min(...times) : null;
  }

  snapshot() { return [...this.records.values()].map((x) => structuredClone(x)); }

  import(snapshot = []) {
    this.records = new Map();
    for (const row of snapshot) {
      this.records.set(this.key(row.providerId, row.modelId), structuredClone(row));
    }
  }
}
