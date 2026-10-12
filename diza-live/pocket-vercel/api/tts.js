import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

const execFileAsync = promisify(execFile);
const ROOT = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(ROOT, 'voice-assets');
const MAX_TEXT = 480;
const MAX_BYTES = 3_000_000;
const MAX_AUDIO_SEC = 24;

function authorized(header, token) {
  if (typeof header !== 'string' || !token || token.length < 24) return false;
  const a = Buffer.from(header);
  const b = Buffer.from('Bearer ' + token);
  return a.length === b.length && timingSafeEqual(a,b);
}
export function pcm16Wav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 ||
      buffer.toString('ascii',0,4)!=='RIFF' || buffer.toString('ascii',8,12)!=='WAVE')
    throw new Error('Invalid WAV');
  let fmt, audio; let offset=12;
  while (offset+8<=buffer.length) {
    const tag=buffer.toString('ascii',offset,offset+4);
    const size=buffer.readUInt32LE(offset+4);
    const start=offset+8;
    if (start+size>buffer.length) throw new Error('Truncated WAV');
    if(tag==='fmt ') fmt=buffer.subarray(start,start+size);
    if(tag==='data') audio=buffer.subarray(start,start+size);
    offset=start+size+(size%2);
  }
  if(!fmt || fmt.length<16 || !audio) throw new Error('Missing WAV chunks');
  const format=fmt.readUInt16LE(0),channels=fmt.readUInt16LE(2),
        rate=fmt.readUInt32LE(4),bits=fmt.readUInt16LE(14);
  if(channels!==1 || rate!==24000) throw new Error('Invalid channels/rate');
  if(format===1 && bits===16) {
    if(audio.length>MAX_BYTES) throw new Error('Audio too large');
    return buffer;
  }
  if(format!==3 || bits!==32 || audio.length%4!==0) throw new Error('Invalid WAV encoding');
  const n=audio.length/4;
  if(n < 12000 || n > rate*MAX_AUDIO_SEC) throw new Error('Bad audio length');
  const len=n*2, out=Buffer.alloc(44+len);
  out.write('RIFF',0); out.writeUInt32LE(36+len,4);out.write('WAVE',8);
  out.write('fmt ',12);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);
  out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);
  out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);
  out.write('data',36);out.writeUInt32LE(len,40);
  for(let i=0;i<n;i++){
    const f=audio.readFloatLE(i*4);
    if(!Number.isFinite(f))throw new Error('Invalid float sample');
    const s=Math.max(-1,Math.min(1,f));
    out.writeInt16LE(s < 0 ? Math.round(s*32768) : Math.round(s*32767), 44+i*2);
  }
  return out;
}

export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if (req.method !== 'POST') return res.status(405).end();
  if (!authorized(req.headers.authorization, process.env.POCKET_CPU_TTS_TOKEN))
    return res.status(401).end();
  let body=req.body;
  if(typeof body==='string') {
    if(Buffer.byteLength(body)>4000)return res.status(413).end();
    try{body=JSON.parse(body)}catch{return res.status(400).end()}
  }
  if(!body || typeof body!=='object' || typeof body.text!=='string' ||
    !body.text.trim() || body.text.length>MAX_TEXT ||
    body.language!=='id'||body.voice!=='female')
    return res.status(422).end();
  const directory=await mkdtemp(join(tmpdir(),'pocket-call-'));
  try{
    const binary=join(ASSETS,'pocket-tts');
    const voice=join(ASSETS,'voices','ref_reporter.mp3');
    const out=join(directory,'reply.wav');
    await execFileAsync(binary,[
      '--models-dir',join(ASSETS,'models'),
      '--voices-dir',join(ASSETS,'voices'),
      '--tokenizer',join(ASSETS,'models','tokenizer.model'),
      '--threads','1','--eos-threshold','-6.0',
      body.text.trim(),voice,out
    ],{
      timeout:22000,
      maxBuffer: 32_000,
      env:{...process.env,LD_LIBRARY_PATH:ASSETS,OMP_NUM_THREADS:'1',OPENBLAS_NUM_THREADS:'1'}
    });
    const raw=await readFile(out);
    if(raw.length>MAX_BYTES*2) throw new Error('Oversize');
    const pcm=pcm16Wav(raw);
    if(pcm.length>MAX_BYTES) throw new Error('Too long');
    res.setHeader('Content-Type','audio/wav');
    res.setHeader('Content-Length',String(pcm.length));
    return res.status(200).end(pcm);
  }catch(e){
    console.warn('POCKET_CPU_VOICE_UNAVAILABLE', e?.code ?? 'ERROR');
    return res.status(503).end('Indonesian CPU voice unavailable');
  }finally{
    await rm(directory,{recursive:true,force:true}).catch(()=>{});
  }
}
