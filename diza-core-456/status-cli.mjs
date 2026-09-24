import { createDizaSystem } from "./system.mjs";

const system=await createDizaSystem({
  stateDir:process.env.DIZA_STATE_DIR||".diza-state",
  env:process.env
});

const live=system.providers.map(p=>({
  id:p.id,
  modelId:p.modelId,
  capabilities:[...p.capabilities]
}));

const catalog=system.catalog.list().map(p=>({
  id:p.id,
  name:p.name,
  autoEligible:Boolean(p.autoEligible),
  enabled:p.enabled!==false,
  disabledReason:p.disabledReason||null,
  freeStatus:p.intel?.freeStatus||"unknown",
  checkedAt:p.intel?.checkedAt||null
}));

const quota=system.ledger.snapshot().map(q=>({
  providerId:q.providerId,
  modelId:q.modelId,
  disabled:Boolean(q.disabled),
  healthScore:q.healthScore,
  cooldownUntil:q.cooldownUntil,
  windows:Object.values(q.windows||{}).map(w=>({
    metric:w.metric,
    period:w.period,
    limit:w.limit,
    used:w.used,
    remaining:w.remaining,
    resetAt:w.resetAt
  }))
}));

const tasks=system.taskStore.list().map(t=>({
  id:t.id,
  title:t.title,
  status:t.status,
  providerCalls:t.providerCalls,
  maxProviderCalls:t.maxProviderCalls,
  activeRuntimeMs:t.activeRuntimeMs,
  maxRuntimeMs:t.maxRuntimeMs,
  wakeAt:t.wakeAt
}));

console.log(JSON.stringify({
  liveProviders:live,
  catalog,
  quota,
  candidates:system.catalog.listCandidates(),
  tasks
},null,2));
