/**
 * Fixed synthetic-only voice to compare cold one-shot vs warm model load
 * with the same Railway ONNX on a strictly capped 1GB Docker CPU container.
 * No real user's words, credentials, recordings or conversation in test.
 */
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transcribeWarmZipformer, warmUpZipformer } from "./warm-stt.mjs";
const prefix=await mkdtemp(join(tmpdir(),"bloks-voice-"));
const file=join(prefix,"speech.webm");
const python="/opt/diza-live/stt-venv/bin/python";
const exec = (cmd,args) => new Promise((resolve,reject)=>{
  execFile(cmd,args,{timeout:45000,env:{...process.env,OMP_NUM_THREADS:"2",OPENBLAS_NUM_THREADS:"2",HF_HUB_OFFLINE:"1"}},(err,out)=>err?reject(err):resolve(String(out).trim()));
});
try {
  await exec("ffmpeg",["-hide_banner","-loglevel","error","-f","lavfi",
    "-i","sine=frequency=440:duration=2","-c:a","libopus","-y",file]);
  const results=[];
  for(let i=0;i<2;i++){
    const t=performance.now();
    const cold=await exec(python,["/opt/diza-live/stt-zipformer.py",file]);
    results.push({mode:"cold",i,ms:Math.round(performance.now()-t),textLength:cold.length});
  }
  const warmStart=performance.now();
  await warmUpZipformer();
  results.push({mode:"model_load",ms:Math.round(performance.now()-warmStart)});
  for(let i=0;i<3;i++){
    const t=performance.now();
    const warm=await transcribeWarmZipformer(file);
    results.push({mode:"warm",i,ms:Math.round(performance.now()-t),textLength:warm.length});
  }
  console.log("WARM_STT_PRIVATE_CPU_BENCH",JSON.stringify({results,ramCapMiB:1024}));
  const coldAvg=results.filter(x=>x.mode==="cold").reduce((s,x)=>s+x.ms,0)/2;
  const warmAvg=results.filter(x=>x.mode==="warm").reduce((s,x)=>s+x.ms,0)/3;
  console.log("WARM_STT_SPEEDUP_MS",Math.round(coldAvg-warmAvg));
  if(coldAvg <= warmAvg)throw Error("Persistent STT provides no speedup. Do not deploy.");
  console.log("WARM_STT_1GB_PROTOTYPE_PASS");
}finally{
  await rm(prefix,{recursive:true,force:true});
}
