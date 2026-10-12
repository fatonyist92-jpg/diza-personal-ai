// Real staging HTTP integration: native ONNX C++ server through tokenized
// gateway to existing Bloks-compatible PCM16 WAV contract.
import assert from 'node:assert/strict';

const base='http://127.0.0.1:8765';
const token=process.env.POCKET_NATIVE_TOKEN;
assert.ok(token?.length >= 24,'native local test token required');
const deadline=Date.now()+30000;
let ready=false;
while(Date.now()<deadline){
  try {
    const x=await fetch(base+'/health',{signal:AbortSignal.timeout(1000)});
    if(x.ok && (await x.json()).ready){ready=true;break;}
  }catch{}
  await new Promise(r=>setTimeout(r,300));
}
assert.ok(ready,'gateway did not become ready');

const body={
  text:'Halo, aku Diza. Gimana kabar kamu hari ini?',
  language:'id',voice:'female',
};
const unauth=await fetch(base+'/v1/tts',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)
});
assert.equal(unauth.status,401,'must reject unauthenticated calls');

const started=performance.now();
const response=await fetch(base+'/v1/tts',{
  method:'POST',
  headers:{
    'authorization':'Bearer '+token,
    'content-type':'application/json'
  },
  body:JSON.stringify(body),
  signal:AbortSignal.timeout(20000),
});
const elapsed=(performance.now()-started)/1000;
assert.equal(response.status,200,'native proxy must produce wav');
assert.equal(response.headers.get('content-type'),'audio/wav');
const pcm=Buffer.from(await response.arrayBuffer());
assert.equal(pcm.toString('ascii',0,4),'RIFF');
assert.equal(pcm.readUInt16LE(20),1,'PCM WAV format tag');
assert.equal(pcm.readUInt16LE(34),16,'PCM 16-bit');
const sampleRate=pcm.readUInt32LE(24);
assert.equal(sampleRate,24000);
const duration=(pcm.length-44)/(sampleRate*2);
assert.ok(duration>.5&&duration<24);
console.log('NATIVE_REAL_HTTP_BRIDGE_PASS',JSON.stringify({
  language:'id', voice:'approved female public reporter reference',
  secs_to_wav:Math.round(elapsed*1000)/1000,
  audio_s:Math.round(duration*1000)/1000,
  wav_bytes:pcm.length, pcm_bits:16
}));
