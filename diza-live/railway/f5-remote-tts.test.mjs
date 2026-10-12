import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { f5RemoteVoiceSelected, speakF5Remote } from './f5-remote-tts.mjs';

const ORIGINAL_FETCH = globalThis.fetch;
const KEYS = ['F5_REMOTE_TTS_ENABLED','F5_REMOTE_TTS_URL','F5_REMOTE_TTS_TOKEN'];
const wav = Buffer.alloc(2400);
wav.write('RIFF',0,'ascii');
wav.write('WAVE',8,'ascii');
const mockWavResponse = (buf=wav, headers={}) => new Response(buf, {
  status:200,headers:{'content-type':'audio/wav', ...headers}
});
function enable() {
  process.env.F5_REMOTE_TTS_ENABLED='1';
  process.env.F5_REMOTE_TTS_URL='https://voice.example.com/v1/tts';
  process.env.F5_REMOTE_TTS_TOKEN='demo-test-token-12345678901234567890';
}
afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  for(const k of KEYS) delete process.env[k];
});

test('disabled by default; no synthetic speech sent externally',async()=>{
  assert.equal(f5RemoteVoiceSelected('id-ID-GadisNeural'),false);
  assert.equal(await speakF5Remote('Halo','id-ID-GadisNeural'),null);
});

test('only existing Indonesian female voice slot is eligible',async()=>{
  enable();
  assert.equal(f5RemoteVoiceSelected('id-ID-GadisNeural'),true);
  assert.equal(f5RemoteVoiceSelected('id-ID-ArdiNeural'),false);
  assert.equal(await speakF5Remote('Halo','id-ID-ArdiNeural'),null);
});

test('requires token and https route before any outgoing call',async()=>{
  enable();delete process.env.F5_REMOTE_TTS_TOKEN;
  await assert.rejects(speakF5Remote('Halo','id-ID-GadisNeural'),/belum dikonfigurasi/);
  enable();process.env.F5_REMOTE_TTS_URL='http://voice.example.com/v1/tts';
  await assert.rejects(speakF5Remote('Halo','id-ID-GadisNeural'),/HTTPS/);
  enable();process.env.F5_REMOTE_TTS_URL='https://127.0.0.1/v1/tts';
  await assert.rejects(speakF5Remote('Halo','id-ID-GadisNeural'),/publik/);
});

test('returns only authenticated valid WAV and never leaks token to query',async()=>{
  enable();
  let hits=0;
  globalThis.fetch=async (url,opts)=>{
    hits++;
    assert.equal(url,'https://voice.example.com/v1/tts');
    assert.equal(opts.method,'POST');
    assert.equal(opts.redirect,'error');
    assert.equal(opts.headers.authorization,'Bearer '+process.env.F5_REMOTE_TTS_TOKEN);
    assert.deepEqual(JSON.parse(opts.body),{text:'Halo, selamat pagi!',language:'id',voice:'female'});
    return mockWavResponse();
  };
  const result=await speakF5Remote('  Halo, selamat pagi!  ','id-ID-GadisNeural');
  assert.equal(result.mime,'audio/wav');
  const reader=result.stream.getReader();
  const item=await reader.read();
  assert.equal(Buffer.from(item.value).toString('ascii',0,4),'RIFF');
  await reader.cancel();
  assert.equal(hits,1);
});

test('rejects non-WAV, upstream error, overlong text, and malicious over-limit audio',async()=>{
  enable();
  globalThis.fetch=async()=>new Response('bad gateway',{status:502});
  await assert.rejects(speakF5Remote('Halo','id-ID-GadisNeural'),/GPU F5 belum siap/);
  globalThis.fetch=async()=>new Response('not wav',{status:200,headers:{'content-type':'text/html'}});
  await assert.rejects(speakF5Remote('Halo','id-ID-GadisNeural'),/tidak mengirim audio WAV/);
  await assert.rejects(speakF5Remote('a'.repeat(2401),'id-ID-GadisNeural'),/terlalu panjang/);
  globalThis.fetch=async()=>mockWavResponse(Buffer.alloc(9_000_001));
  await assert.rejects(speakF5Remote('Halo','id-ID-GadisNeural'),/melebihi batas/);
});

test('single-flight concurrency rejects a second request while first is pending',async()=>{
  enable();
  let unblock;
  let entered;
  const reached=new Promise(r=>{entered=r;});
  const hold=new Promise(r=>{unblock=r;});
  globalThis.fetch=async()=>{entered();await hold;return mockWavResponse();};
  const first=speakF5Remote('Halo','id-ID-GadisNeural');
  await reached;
  await assert.rejects(speakF5Remote('Halo lagi','id-ID-GadisNeural'),/sedang digunakan/);
  unblock();
  assert.equal((await first).mime,'audio/wav');
});
