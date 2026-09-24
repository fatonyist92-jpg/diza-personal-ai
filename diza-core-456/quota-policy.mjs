const PERIOD_MS = {
  minute: 60_000,
  hour: 60 * 60_000,
  day: 24 * 60 * 60_000,
  week: 7 * 24 * 60 * 60_000,
  month: 30 * 24 * 60 * 60_000,
};

function toWindow(limit,current,now){
  const periodMs=PERIOD_MS[limit.period]||null;
  const key=String(limit.metric)+":"+String(limit.period);
  const prev=current?.windows?.[key]||null;
  let resetAt=prev?.resetAt||null;
  if(periodMs&&(!resetAt||Number(resetAt)<=now())){
    resetAt=now()+periodMs;
  }
  return {
    metric:limit.metric,
    period:limit.period,
    limit:Number(limit.value),
    used:prev?.used||0,
    remaining:prev?.remaining??null,
    resetAt,
    periodMs,
    authoritative:false,
  };
}

export function syncLedgerFromCatalog(catalog, ledger, { now = () => Date.now(), providers = [] } = {}) {
  const byId = new Map(providers.map((p) => [p.id, p]));
  const updated = [];

  for (const entry of catalog.list()) {
    const provider = byId.get(entry.id);
    const modelId = provider?.modelId || entry.defaultModel || "default";
    const intel = entry.intel;
    const current = ledger.get(entry.id, modelId);
    const limits=Array.isArray(intel?.limits)?intel.limits:[];
    const quotaWindows=limits
      .filter(x=>["requests","tokens"].includes(x.metric)&&PERIOD_MS[x.period])
      .map(x=>toWindow(x,current,now));

    const patch = {
      paidAllowed: false,
      billingMode: "free_only",
      disabled:
        entry.enabled === false
        || entry.policyBlocked === true
        || entry.safetyDisabled === true
        || (!provider && entry.autoEligible === false),
      ...(quotaWindows.length?{quotaWindows}:{}),
    };

    const request=limits.find(x=>x.metric==="requests");
    const token=limits.find(x=>x.metric==="tokens");
    if(request)patch.requestLimit=Number(request.value);
    if(token)patch.tokenLimit=Number(token.value);

    ledger.upsert(entry.id, modelId, patch);
    updated.push({ providerId: entry.id, modelId, patch });
  }
  return updated;
}
