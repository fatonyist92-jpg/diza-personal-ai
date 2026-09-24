import { createDizaSystem } from "./system.mjs";

const args=new Set(process.argv.slice(2));
const forceAll=args.has("--force");
const forceDaily=forceAll||args.has("--daily");
const forceDiscovery=forceAll||args.has("--discover");

const system=await createDizaSystem({
  stateDir:process.env.DIZA_STATE_DIR||".diza-state",
  env:process.env,
  onError:(error)=>console.error("[DIZA MAINTENANCE]",error?.stack||error)
});

const report=await system.runtime.runMaintenanceNow({
  forceDaily,
  forceDiscovery
});
await system.refreshProviders();

const changed=(report?.daily||[]).filter(x=>x.changed);
const candidates=system.catalog.listCandidates()
  .filter(x=>x.status==="verified_free"||x.status==="needs_manual_verification");

console.log(JSON.stringify({
  ranDaily:Boolean(report?.ranDaily),
  ranDiscovery:Boolean(report?.ranDiscovery),
  checkedProviders:(report?.daily||[]).length,
  changedProviders:changed.map(x=>({
    providerId:x.providerId,
    facts:x.facts
  })),
  discoveredThisRun:(report?.discovered||[]).map(x=>({
    id:x.id,
    name:x.name,
    status:x.status,
    pullable:Boolean(x.pullable),
    suggestedAdapter:x.suggestedAdapter||null,
    officialUrl:x.officialUrl||null
  })),
  totalCandidates:candidates.length,
  liveProviders:system.providers.map(p=>({
    id:p.id,
    modelId:p.modelId
  }))
},null,2));
