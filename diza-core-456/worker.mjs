import { createDizaSystem } from "./system.mjs";

const stateDir=process.env.DIZA_STATE_DIR||".diza-state";
const taskPollMs=Number(process.env.DIZA_TASK_POLL_MS||5000);

const system=await createDizaSystem({
  stateDir,
  taskPollMs,
  env:process.env,
  onError:(error)=>{
    console.error("[DIZA CORE]",error?.stack||error);
  }
});

const active=system.providers.map(p=>p.id+":"+p.modelId);
console.log("[DIZA CORE] starting");
console.log("[DIZA CORE] state:",stateDir);
console.log("[DIZA CORE] live providers:",active.length?active.join(", "):"none configured");
console.log("[DIZA CORE] free-tier maintenance: first tick after 00:00 WIB daily");
console.log("[DIZA CORE] provider discovery: every 48 hours");

await system.runtime.start();

let closing=false;
async function shutdown(signal){
  if(closing)return;
  closing=true;
  console.log("[DIZA CORE] shutdown:",signal);
  system.runtime.stop();
  process.exit(0);
}

process.on("SIGINT",()=>shutdown("SIGINT"));
process.on("SIGTERM",()=>shutdown("SIGTERM"));

setInterval(()=>{},60_000);
