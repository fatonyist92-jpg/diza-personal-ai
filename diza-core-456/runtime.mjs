import { msUntilNextJakartaMidnight } from "./maintenance-scheduler.mjs";

export class DizaCoreRuntime {
  constructor({
    taskEngine,
    maintenanceScheduler,
    taskPollMs=5000,
    onMaintenance=null,
    onError=console.error,
    now=()=>Date.now()
  }={}){
    this.taskEngine=taskEngine;
    this.maintenanceScheduler=maintenanceScheduler;
    this.taskPollMs=taskPollMs;
    this.onMaintenance=onMaintenance;
    this.onError=onError;
    this.now=now;
    this.taskTimer=null;
    this.maintenanceTimer=null;
    this.started=false;
  }

  async runMaintenance(options={}){
    if(!this.maintenanceScheduler)return null;
    const report=await this.maintenanceScheduler.runDue(options);
    if(this.onMaintenance)await this.onMaintenance(report);
    return report;
  }

  async tick(){
    const out={maintenance:null,task:null};
    if(this.maintenanceScheduler){
      try{
        out.maintenance=await this.runMaintenance();
      }catch(e){
        this.onError(e);
      }
    }
    if(this.taskEngine){
      try{
        out.task=await this.taskEngine.runNext();
      }catch(e){
        this.onError(e);
      }
    }
    return out;
  }

  async runMaintenanceNow(options={}){
    if(!this.maintenanceScheduler)return null;
    return this.runMaintenance(options);
  }

  scheduleNextMaintenance(){
    if(!this.started||!this.maintenanceScheduler)return;
    clearTimeout(this.maintenanceTimer);
    const wait=msUntilNextJakartaMidnight(this.now())+1000;
    this.maintenanceTimer=setTimeout(async()=>{
      try{
        await this.runMaintenance();
      }catch(e){
        this.onError(e);
      }
      this.scheduleNextMaintenance();
    },wait);
  }

  async start(){
    if(this.started)return;
    this.started=true;

    if(this.maintenanceScheduler){
      try{
        await this.runMaintenance();
      }catch(e){
        this.onError(e);
      }
      this.scheduleNextMaintenance();
    }

    if(this.taskEngine){
      this.taskTimer=setInterval(()=>{
        this.taskEngine.runNext().catch(this.onError);
      },this.taskPollMs);
    }
  }

  stop(){
    this.started=false;
    clearInterval(this.taskTimer);
    clearTimeout(this.maintenanceTimer);
    this.taskTimer=null;
    this.maintenanceTimer=null;
  }
}
