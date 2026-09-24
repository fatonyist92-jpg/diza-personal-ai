import path from "node:path";
import { ProviderCatalog } from "./catalog.mjs";
import { ProviderIntelMonitor, DefaultTextFetcher } from "./intel-monitor.mjs";
import { MaintenanceScheduler } from "./maintenance-scheduler.mjs";
import { JsonFileStateStore, PersistentTaskStore, PersistentIdempotencyStore, PersistentQuotaLedger } from "./persistence.mjs";
import { buildProvidersFromCatalog } from "./provider-factory.mjs";
import { syncLedgerFromCatalog } from "./quota-policy.mjs";
import { MeshRouter } from "./mesh-router.mjs";
import { BackgroundTaskEngine } from "./task-engine.mjs";
import { DizaCoreRuntime } from "./runtime.mjs";

export async function createDizaSystem({
  stateDir=".diza-state",
  env=process.env,
  fetcher=new DefaultTextFetcher(),
  now=()=>Date.now(),
  contextBuilder=async({task,step,previous})=>({
    input:[
      "USER TASK:",
      task.instruction,
      "",
      "ASSIGNED STEP:",
      step.instruction,
      "",
      "PREVIOUS RESULTS:",
      previous.map((x)=>x.output).join("\n\n")||"None"
    ].join("\n"),
    estimatedTokens:1000
  }),
  taskPollMs=5000,
  onError=console.error
}={}){
  const catalog=new ProviderCatalog();

  const maintenanceState=new JsonFileStateStore(
    path.join(stateDir,"maintenance.json"),
    {lastDailyCheckAt:null,lastDiscoveryAt:null,catalogSnapshot:null}
  );
  const savedMaintenance=await maintenanceState.load();
  if(savedMaintenance.catalogSnapshot)catalog.import(savedMaintenance.catalogSnapshot);

  const monitor=new ProviderIntelMonitor({catalog,fetcher,now});
  const maintenanceScheduler=new MaintenanceScheduler({
    monitor,
    stateStore:maintenanceState,
    catalog,
    now
  });

  const ledger=new PersistentQuotaLedger(
    path.join(stateDir,"quota.json"),
    {now,reserveRatio:0.10,freeOnly:true}
  );
  const idempotency=new PersistentIdempotencyStore(
    path.join(stateDir,"idempotency.json")
  );

  let providers=buildProvidersFromCatalog(catalog,{env});
  syncLedgerFromCatalog(catalog,ledger,{now,providers});

  const router=new MeshRouter({
    providers,
    ledger,
    idempotency,
    now
  });

  const taskStore=new PersistentTaskStore(
    path.join(stateDir,"tasks.json")
  );
  const taskEngine=new BackgroundTaskEngine({
    store:taskStore,
    router,
    contextBuilder,
    now
  });

  const refreshProviders=async()=>{
    providers=buildProvidersFromCatalog(catalog,{env});
    router.setProviders(providers);
    syncLedgerFromCatalog(catalog,ledger,{now,providers});
    return providers;
  };

  const runtime=new DizaCoreRuntime({
    taskEngine,
    maintenanceScheduler,
    taskPollMs,
    now,
    onError,
    onMaintenance:refreshProviders
  });

  return {
    catalog,
    monitor,
    maintenanceScheduler,
    ledger,
    router,
    taskStore,
    taskEngine,
    runtime,
    refreshProviders,
    get providers(){return router.listProviders();}
  };
}
