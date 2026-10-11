// Verify actual neural Indonesian MP3, not just installed Python package.
// One harmless synthetic line, no personal/agent text and no paid API.
// No audio bytes logged, only PASS/FAIL to private Railway deployment logs.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const path="/home/node/.bloks/neural-voice-smoke.json";
const maxAge=8*60*60*1000;
let previous=null;
try {
  const p=JSON.parse(readFileSync(path,"utf8"));
  if(Date.now()-Date.parse(p.checkedAt)<maxAge)previous=p;
}catch{}
if(previous) {
  console.log("NEURAL_VOICE_TEST="+previous.status+" (cached)");
  console.log("NEURAL_VOICE_REASON="+previous.reason);
}else {
  console.log("NEURAL_VOICE_TEST=checking");
  const c=spawn("/opt/diza-live/tts-venv/bin/python",
    ["/opt/diza-live/tts-neural.py","id-ID-GadisNeural"],
    {cwd:"/home/node",stdio:["pipe","pipe","pipe"]});
  let bytes=0,head=Buffer.alloc(0),timedOut=false,done=false;
  c.stdin.on("error",()=>{});
  c.stdin.end("Halo, suara neural bahasa Indonesia telah aktif.");
  c.stdout.on("data",(d)=>{
    bytes+=d.length;
    if(head.length<10)head=Buffer.concat([head,d]).subarray(0,10);
  });
  // Never log upstream error text because it may contain private endpoints.
  c.stderr.resume();
  const finish=(code)=>{
    if(done)return;done=true;clearTimeout(timer);
    const mp3=(head.toString("ascii",0,3)==="ID3" || (head.length>=2 && head[0]===0xff && (head[1]&0xe0)===0xe0));
    const status=code===0 && bytes>=200 && mp3?"PASS":"FAILED";
    const reason=status==="PASS"?"INDONESIAN_NEURAL_MP3_GENERATED":timedOut?"TIMEOUT":"UPSTREAM_TTS_UNAVAILABLE";
    mkdirSync("/home/node/.bloks",{recursive:true});
    writeFileSync(path,JSON.stringify({status,reason,checkedAt:new Date().toISOString()}),{mode:0o600});
    console.log("NEURAL_VOICE_TEST="+status);
    console.log("NEURAL_VOICE_REASON="+reason);
  };
  const timer=setTimeout(()=>{timedOut=true;try{c.kill("SIGTERM")}catch{}finish(null)},45_000);
  timer.unref?.();
  c.on("error",()=>finish(null));
  c.on("close",finish);
}
