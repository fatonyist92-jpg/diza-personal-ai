import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { pocketCpuSelected, speakPocketCpu } from './pocket-remote-tts.mjs';

const nativeFetch = globalThis.fetch;
const KEYS = ['POCKET_CPU_TTS_ENABLED','POCKET_CPU_TTS_URL','POCKET_CPU_TTS_TOKEN'];
const validWav = Buffer.alloc(2400);
validWav.write('RIFF', 0, 'ascii');
validWav.write('WAVE', 8, 'ascii');
function configure() {
  process.env.POCKET_CPU_TTS_ENABLED='1';
  process.env.POCKET_CPU_TTS_URL='https://voice.example.org/v1/tts';
  process.env.POCKET_CPU_TTS_TOKEN='test-only-token-12345678901234567890';
}
const wavResponse = (bytes=validWav) =>
  new Response(bytes,{status:200,headers:{'content-type':'audio/wav'}});
afterEach(()=>{
  globalThis.fetch=nativeFetch;
  for (const key of KEYS) delete process.env[key];
});

test('disabled by default, and only intended female voice can select Pocket', async()=>{
  assert.equal(pocketCpuSelected('id-ID-GadisNeural'),false);
  assert.equal(await speakPocketCpu('Halo','id-ID-GadisNeural'),null);
  configure();
  assert.equal(pocketCpuSelected('id-ID-GadisNeural'),true);
  assert.equal(pocketCpuSelected('id-ID-ArdiNeural'),false);
  assert.equal(await speakPocketCpu('Halo','id-ID-ArdiNeural'),null);
});

test('requires HTTPS and a nontrivial token, rejects local/internal URLs',async()=>{
  configure(); delete process.env.POCKET_CPU_TTS_TOKEN;
  await assert.rejects(speakPocketCpu('Halo','id-ID-GadisNeural'),/token/);
  configure(); process.env.POCKET_CPU_TTS_URL='http://voice.example.org/v1/tts';
  await assert.rejects(speakPocketCpu('Halo','id-ID-GadisNeural'),/HTTPS/);
  configure(); process.env.POCKET_CPU_TTS_URL='https://127.0.0.1/v1/tts';
  await assert.rejects(speakPocketCpu('Halo','id-ID-GadisNeural'),/publik/);
});

test('authenticated request uses existing /v1/tts contract and returns WAV',async()=>{
  configure();
  let called=0;
  globalThis.fetch=async (url,opts)=>{
    called++;
    assert.equal(url,'https://voice.example.org/v1/tts');
    assert.equal(opts.method,'POST');
    assert.equal(opts.redirect,'error');
    assert.equal(opts.headers.authorization,'Bearer '+process.env.POCKET_CPU_TTS_TOKEN);
    assert.deepEqual(JSON.parse(opts.body),
      {text:'Halo, Diza!',language:'id',voice:'female'});
    return wavResponse();
  };
  const result=await speakPocketCpu(' Halo, Diza! ', 'id-ID-GadisNeural');
  assert.equal(result.mime,'audio/wav');
  const rd=result.stream.getReader(), chunk=await rd.read();
  assert.equal(Buffer.from(chunk.value).subarray(0,4).toString(),'RIFF');
  await rd.cancel();
  assert.equal(called,1);
});

test('rejects invalid upstream response and excessive text and WAV size',async()=>{
  configure();
  globalThis.fetch=async()=>new Response('oops',{status:503});
  await assert.rejects(speakPocketCpu('Halo','id-ID-GadisNeural'),/tidak tersedia/);
  globalThis.fetch=async()=>new Response('html',{headers:{'content-type':'text/html'}});
  await assert.rejects(speakPocketCpu('Halo','id-ID-GadisNeural'),/tidak mengirim WAV/);
  await assert.rejects(speakPocketCpu('a'.repeat(1201),'id-ID-GadisNeural'),/terlalu panjang/);
  globalThis.fetch=async()=>wavResponse(Buffer.alloc(9_000_001));
  await assert.rejects(speakPocketCpu('Halo','id-ID-GadisNeural'),/batas/);
});

test('single-flight protection and hangup cancel a pending request',async()=>{
  configure();
  let release, entered;
  const seen=new Promise(r=>entered=r);
  const hold=new Promise(r=>release=r);
  globalThis.fetch=async (_u,opt)=>{
    entered();
    await hold;
    if (opt.signal.aborted) throw new DOMException('Aborted','AbortError');
    return wavResponse();
  };
  const ctrl=new AbortController();
  const first=speakPocketCpu('Halo','id-ID-GadisNeural',{signal:ctrl.signal});
  await seen;
  await assert.rejects(speakPocketCpu('Halo 2','id-ID-GadisNeural'),/masih berbicara/);
  ctrl.abort();release();
  await assert.rejects(first,/Call dibatalkan/);
});
