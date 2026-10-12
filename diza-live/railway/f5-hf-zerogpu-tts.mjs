/**
 * Bloks protected /speak -> user-owned Hugging Face ZeroGPU Gradio Space.
 * OFF by default. No provider billing. HF daily quotas and queue limits apply.
 * Uses official Gradio queue API without tunnels and validates all URLs.
 */
import { Readable } from 'node:stream';
const VOICE_ID = 'id-ID-GadisNeural';
const LIMIT_BYTES = 9_000_000;
let busy = false;

export function f5ZeroGpuSelected(voiceId) {
  return process.env.F5_ZEROGPU_ENABLED === '1' && voiceId === VOICE_ID;
}

function config() {
  const originText = process.env.F5_ZEROGPU_ORIGIN?.trim();
  const token = process.env.F5_ZEROGPU_HF_TOKEN?.trim();
  const key = process.env.F5_ZEROGPU_BRIDGE_SECRET?.trim();
  if (!originText || !token?.startsWith('hf_') || token.length < 28 ||
      !key || key.length < 24)
    throw new Error('F5 ZeroGPU belum terhubung secara aman.');
  let url;
  try { url = new URL(originText); }
  catch { throw new Error('URL F5 ZeroGPU tidak valid.'); }
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash ||
      !/^[a-z0-9][a-z0-9-]*\.hf\.space$/.test(url.hostname))
    throw new Error('F5 ZeroGPU wajib memakai alamat HTTPS *.hf.space resmi.');
  return { origin: url.origin, token, key };
}

function absoluteAudioUrl(candidate, origin) {
  if (!candidate || typeof candidate !== 'string' || candidate.length > 2400)
    throw new Error('Alamat audio F5 hilang.');
  let url;
  try { url = new URL(candidate, origin); } catch { throw new Error('Alamat audio F5 tidak valid.'); }
  if (url.origin !== origin || url.protocol !== 'https:' || url.username ||
      url.password || url.hash || !url.pathname.startsWith('/gradio_api/file='))
    throw new Error('Alamat audio F5 berada di luar host GPU.');
  return url.href;
}

function responseHeaders(token) {
  return { Authorization: 'Bearer ' + token };
}

function mustBeOkay(resp, label) {
  if (!resp.ok || !resp.body)
    throw new Error(label + ': GPU belum siap atau jatah harian habis.');
}

async function queuedResult(url, token, abort) {
  const response = await fetch(url, {
    method: 'GET', redirect: 'error', cache: 'no-store',
    signal: abort, headers: responseHeaders(token),
  });
  mustBeOkay(response, 'Antrean F5');
  let raw = '';
  let completed = false;
  let result;
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  try {
    while (true) {
      const incoming = await reader.read();
      if (incoming.done) break;
      raw += decoder.decode(incoming.value, {stream:true}).replace(/\r\n/g,'\n');
      if (raw.length > 600_000) throw new Error('Respons antrean F5 terlalu besar.');
      let boundary;
      while ((boundary = raw.indexOf('\n\n')) >= 0) {
        const block = raw.slice(0,boundary);
        raw = raw.slice(boundary+2);
        const event = block.split('\n').find(line=>line.startsWith('event:'))?.slice(6).trim();
        if (event === 'error') throw new Error('Mesin F5 gagal mengolah suara.');
        if (event !== 'complete') continue;
        const payload = block.split('\n')
          .filter(line=>line.startsWith('data:'))
          .map(line=>line.slice(5).trimStart()).join('\n');
        try { result = JSON.parse(payload); }
        catch { throw new Error('Format hasil antrean F5 tidak valid.'); }
        completed = true;
        break;
      }
      if (completed) break;
    }
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
  if (!completed || !Array.isArray(result) || typeof result[0]?.url !== 'string')
    throw new Error('ZeroGPU tidak mengirim tautan suara yang valid.');
  return result[0].url;
}

async function fetchWav(origin, token, candidate, abort) {
  const path = absoluteAudioUrl(candidate,origin);
  const response = await fetch(path, {
    method:'GET', redirect:'error', cache:'no-store',
    signal:abort, headers:responseHeaders(token),
  });
  mustBeOkay(response,'Unduhan audio F5');
  const size = Number(response.headers.get('content-length')||0);
  if (size > LIMIT_BYTES) throw new Error('Audio F5 melampaui batas.');
  const mime = (response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if (!['audio/wav','audio/wave','audio/x-wav','application/octet-stream'].includes(mime))
    throw new Error('Audio F5 bukan WAV.');
  const reader=response.body.getReader();
  let total=0; const chunks=[];
  try {
    while(true) {
      const next=await reader.read();
      if(next.done)break;
      total+=next.value.byteLength;
      if(total>LIMIT_BYTES) throw new Error('Audio F5 melampaui batas.');
      chunks.push(Buffer.from(next.value));
    }
  } finally { reader.releaseLock(); }
  const buffer=Buffer.concat(chunks,total);
  if(buffer.length<1024 || buffer.toString('ascii',0,4)!=='RIFF' ||
     buffer.toString('ascii',8,12)!=='WAVE')
    throw new Error('Audio F5 tidak valid.');
  return buffer;
}

export async function speakF5ZeroGpu(text, voiceId) {
  if(!f5ZeroGpuSelected(voiceId)) return null;
  if(busy)throw new Error('ZeroGPU masih memproses jawaban sebelumnya.');
  const cfg=config();
  const clipped=String(text??'').trim();
  if(!clipped || clipped.length>350)
    throw new Error('Untuk ZeroGPU, teks per potongan maksimal 350 karakter.');
  busy=true;
  const abort=new AbortController();
  const timer=setTimeout(()=>abort.abort(),100_000);
  try {
    const submission=await fetch(cfg.origin+'/gradio_api/call/synthesize',{
      method:'POST',redirect:'error',cache:'no-store',signal:abort.signal,
      headers:{...responseHeaders(cfg.token),'content-type':'application/json'},
      body:JSON.stringify({data:[clipped,cfg.key]}),
    });
    if(!submission.ok)throw new Error('Space F5 sedang tidur atau tidak tersedia.');
    const payload=await submission.json();
    const eventId=payload?.event_id;
    if(typeof eventId!=='string' || !/^[A-Za-z0-9_-]{1,120}$/.test(eventId))
      throw new Error('ZeroGPU belum menerima antrean suara.');
    const audioUrl=await queuedResult(
      cfg.origin+'/gradio_api/call/synthesize/'+encodeURIComponent(eventId),
      cfg.token,abort.signal
    );
    const wav=await fetchWav(cfg.origin,cfg.token,audioUrl,abort.signal);
    console.info('F5_ZEROGPU_TTS=WAV_OK');
    return {stream:Readable.toWeb(Readable.from([wav])),mime:'audio/wav'};
  } catch {
    console.warn('F5_ZEROGPU_TTS=UNAVAILABLE_NO_ROBOT_FALLBACK');
    throw new Error('F5 GPU sedang antre, tidur, atau jatah habis. Tidak diganti ke suara robot.');
  } finally {
    clearTimeout(timer);abort.abort();busy=false;
  }
}
