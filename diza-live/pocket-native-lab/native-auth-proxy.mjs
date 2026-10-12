/**
 * Staging-only CPU native ONNX gateway.
 * Converts the C++ PocketTTS OpenAI-style API to the existing Bloks
 * /v1/tts JSON+PCM16 WAV API, without touching Railway or Bloks UI.
 * HTTPS MUST be terminated by a trusted outer reverse proxy.
 *
 * Native server MUST be accessible only through 127.0.0.1 or private network.
 * Never publish its unauthenticated port to the Internet.
 */
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export const MAX_BYTES = 9_000_000;
const MAX_TEXT = 1200;
let busy = false;

export function wavFloatToPcm16(wav) {
  if (!Buffer.isBuffer(wav) || wav.length < 44 ||
    wav.toString('ascii',0,4) !== 'RIFF' ||
    wav.toString('ascii',8,12) !== 'WAVE') throw new Error('WAV header invalid');
  let fmt, data;
  let offset = 12;
  while (offset + 8 <= wav.length) {
    const tag = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > wav.length) throw new Error('WAV chunk truncated');
    if (tag === 'fmt ') fmt = wav.subarray(start,start + size);
    if (tag === 'data') data = wav.subarray(start,start + size);
    offset = start + size + (size % 2);
  }
  if (!fmt || fmt.length < 16 || !data) throw new Error('WAV chunks missing');
  const format = fmt.readUInt16LE(0);
  const channels = fmt.readUInt16LE(2);
  const rate = fmt.readUInt32LE(4);
  const bits = fmt.readUInt16LE(14);
  if (channels !== 1 || rate !== 24000) throw new Error('Unsupported audio format');
  if (format === 1 && bits === 16) return wav;
  if (format !== 3 || bits !== 32 || data.length % 4 !== 0)
    throw new Error('Unsupported WAV encoding');
  const numSamples = data.length / 4;
  if (numSamples < 9600 || numSamples > rate * 24)
    throw new Error('Unsupported audio duration');
  const byteCount = numSamples * 2;
  const out = Buffer.allocUnsafe(44 + byteCount);
  out.write('RIFF',0,'ascii');out.writeUInt32LE(36+byteCount,4);
  out.write('WAVE',8,'ascii');out.write('fmt ',12,'ascii');
  out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);
  out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);
  out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);
  out.writeUInt16LE(16,34);out.write('data',36,'ascii');
  out.writeUInt32LE(byteCount,40);
  for (let i=0;i<numSamples;i++) {
    let sample = data.readFloatLE(i*4);
    if (!Number.isFinite(sample)) throw new Error('Non-finite samples');
    sample=Math.max(-1,Math.min(1,sample));
    out.writeInt16LE(sample < 0 ? Math.round(sample*32768):Math.round(sample*32767),44+i*2);
  }
  return out;
}

export function validToken(header, secret) {
  if (typeof header !== 'string' || secret.length < 24) return false;
  const expected = Buffer.from('Bearer '+secret,'utf8');
  const actual = Buffer.from(header,'utf8');
  return expected.length === actual.length && timingSafeEqual(expected,actual);
}

export function makeProxy({
  token, host='127.0.0.1', port=8765, nativeUrl='http://127.0.0.1:8080',
  nativeFetch=fetch, expose=false,
}) {
  if (typeof token !== 'string' || token.length < 24)
    throw new Error('POCKET_NATIVE_TOKEN missing or too short');
  if (expose && host !== '0.0.0.0')
    throw new Error('Public gateway should use 0.0.0.0 with external TLS termination');
  const upstream = new URL(nativeUrl);
  if (upstream.hostname !== '127.0.0.1' || upstream.protocol !== 'http:')
    throw new Error('Native C++ endpoint must stay on localhost.');
  return http.createServer(async (req,res)=>{
    res.setHeader('cache-control','no-store');
    res.setHeader('x-content-type-options','nosniff');
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200,{'content-type':'application/json'});
      res.end(JSON.stringify({ready:true,busy}));return;
    }
    if(req.method !== 'POST' || req.url !== '/v1/tts') {
      res.writeHead(404);res.end();return;
    }
    if (!validToken(req.headers.authorization,token)) {
      res.writeHead(401);res.end();return;
    }
    if(busy){res.writeHead(503);res.end();return;}
    if ((Number(req.headers['content-length']||0)>10000)){
      res.writeHead(413);res.end();return;
    }
    busy=true;
    const ctrl=new AbortController();
    const deadline=setTimeout(()=>ctrl.abort(),18000);
    try {
      let payload='';
      for await (const chunk of req) {
        payload+=chunk.toString();
        if(Buffer.byteLength(payload)>10000)throw new Error('Request too large');
      }
      const obj=JSON.parse(payload);
      if (typeof obj.text !== 'string' || !obj.text.trim() || obj.text.length>MAX_TEXT ||
          obj.language !== 'id' || obj.voice !== 'female')
        throw new Error('Unsupported speech request');
      const response=await nativeFetch(upstream.origin+'/v1/audio/speech',{
        method:'POST',redirect:'error',signal:ctrl.signal,
        headers:{'content-type':'application/json'},
        body:JSON.stringify({
          model:'pocket-id-6l',input:obj.text.trim(),
          voice:'ref_reporter.mp3',response_format:'wav',
        })
      });
      if(!response.ok)throw new Error('Native server unavailable');
      const parts=[];let count=0;
      for await (const chunk of response.body) {
        count+=chunk.byteLength;
        if(count>MAX_BYTES)throw new Error('Native audio oversized');
        parts.push(Buffer.from(chunk));
      }
      const pcm=wavFloatToPcm16(Buffer.concat(parts,count));
      res.writeHead(200,{'content-type':'audio/wav','content-length':pcm.length});
      res.end(pcm);
    } catch {
      res.writeHead(503,{'content-type':'text/plain'});
      res.end('Indonesian voice unavailable');
    } finally {busy=false;clearTimeout(deadline);}
  });
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const token=process.env.POCKET_NATIVE_TOKEN||'';
  const host=process.env.POCKET_NATIVE_BIND||'127.0.0.1';
  const port=Number(process.env.PORT||8765);
  const app=makeProxy({token,host,port});
  app.listen(port,host,()=>console.log('NATIVE_POCKET_PROXY_READY port='+port));
}
