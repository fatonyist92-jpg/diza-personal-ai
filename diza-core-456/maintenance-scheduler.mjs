const WIB_MS=7*60*60*1000;
const DAY_MS=24*60*60*1000;
const TWO_DAYS_MS=2*DAY_MS;

export function jakartaDayKey(ms){
  const d=new Date(ms+WIB_MS);
  return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0")+"-"+String(d.getUTCDate()).padStart(2,"0");
}
export function latestJakartaMidnight(ms){
  const d=new Date(ms+WIB_MS);
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),0,0,0,0)-WIB_MS;
}
export function nextJakartaMidnight(ms){
  return latestJakartaMidnight(ms)+DAY_MS;
}
export function msUntilNextJakartaMidnight(ms){
  return Math.max(1000,nextJakartaMidnight(ms)-ms);
}

export class MemoryMaintenanceState {
  constructor(snapshot={}){
    this.state={lastDailyCheckAt:null,lastDiscoveryAt:null,...snapshot};
  }
  async load(){return {...this.state};}
  async save(next){this.state={...next};}
}

export class MaintenanceScheduler {
  constructor({monitor,stateStore=new MemoryMaintenanceState(),catalog,now=()=>Date.now()}={}){
    this.monitor=monitor;
    this.stateStore=stateStore;
    this.catalog=catalog;
    this.now=now;
  }

  async runDue({forceDaily=false,forceDiscovery=false}={}){
    const state=await this.stateStore.load();
    const now=this.now();
    const latestMidnight=latestJakartaMidnight(now);
    const dailyDue=forceDaily||!state.lastDailyCheckAt||Number(state.lastDailyCheckAt)<latestMidnight;
    const discoveryDue=forceDiscovery||!state.lastDiscoveryAt||(now-Number(state.lastDiscoveryAt)>=TWO_DAYS_MS);
    const report={ranDaily:false,ranDiscovery:false,daily:[],discovered:[]};

    if(dailyDue){
      report.daily=await this.monitor.dailyCheck();
      state.lastDailyCheckAt=now;
      report.ranDaily=true;
    }
    if(discoveryDue){
      report.discovered=await this.monitor.discover();
      state.lastDiscoveryAt=now;
      report.ranDiscovery=true;
    }
    await this.stateStore.save(state);
    return report;
  }

  nextWakeAt(){
    return nextJakartaMidnight(this.now());
  }
}
