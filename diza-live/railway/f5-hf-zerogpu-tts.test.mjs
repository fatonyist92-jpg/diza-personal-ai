import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { f5ZeroGpuSelected, speakF5ZeroGpu } from './f5-hf-zerogpu-tts.mjs';
const FETCH=globalThis.fetch;
const keys=['F5_ZEROGPU_ENABLED','F5_ZEROGPU_ORIGIN','F5_ZEROGPU_HF_TOKEN','F5_ZEROGPU_BRIDGE_SECRET'];
const ORIGIN='https://fatonyist-bloks-f5-indonesian.hf.space';
const WAV=Buffer.alloc(2048);
WAV.write('RIFF',0,'ascii');WAV.write('WAVE',8,'ascii');
function setup(){
  process.env.F5_ZEROGPU_ENABLED='1';
  process.env.F5_ZEROGPU_ORIGIN=ORIGIN+'/';
  process.env.F5_ZEROGPU_HF_TOKEN='hf_0123456789abcdefghijklmnopqrstuvwxyz';
  process.env.F5_ZEROGPU_BRIDGE_SECRET='private-test-secret-1234567890123456';
}
afterEach(()=>{globalThis.fetch=FETCH;for (const key of keys)delete process.env[key];});
test('ZeroGPU is disabled until explicitly enabled, previous voice stays unchanged',async()=>{
  assert.equal(f5ZeroGpuSelected('id-ID-GadisNeural'),false);
  assert.equal(await speakF5ZeroGpu('Halo','id-ID-GadisNeural'),null);
  setup();
  assert.equal(f5ZeroGpuSelected('id-ID-ArdiNeural'),false);
  assert.equal(await speakF5ZeroGpu('Halo','id-ID-ArdiNeural'),null);
});
test('requires real HF token, private secret and same-origin HTTPS',async()=>{
  setup();delete process.env.F5_ZEROGPU_HF_TOKEN;
  await assert.rejects(speakF5ZeroGpu('Halo','id-ID-GadisNeural'),/belum terhubung/);
  setup();process.env.F5_ZEROGPU_ORIGIN='http://example.com/';
  await assert.rejects(speakF5ZeroGpu('Halo','id-ID-GadisNeural'),/HTTPS/);
  setup();process.env.F5_ZEROGPU_ORIGIN='https://127.0.0.1/';
  await assert.rejects(speakF5ZeroGpu('Halo','id-ID-GadisNeural'),/HTTPS/);
  setup();process.env.F5_ZEROGPU_ORIGIN=ORIGIN+'/admin';
  await assert.rejects(speakF5ZeroGpu('Halo','id-ID-GadisNeural'),/HTTPS/);
});
test('official Gradio queue API: secure POST, SSE complete, same-origin WAV',async()=>{
  setup();
  const calls=[];
  globalThis.fetch=async (url,opts)=>{
    calls.push({url,opts});
    assert.equal(opts.headers.Authorization,'Bearer '+process.env.F5_ZEROGPU_HF_TOKEN);
    assert.equal(opts.redirect,'error');
    if(url.endsWith('/gradio_api/call/synthesize')){
      assert.deepEqual(JSON.parse(opts.body).data,['Halo, Diza!','private-test-secret-1234567890123456']);
      return new Response(JSON.stringify({event_id:'event_123'}),{
        headers:{'content-type':'application/json'}
      });
    }
    if(url.endsWith('/gradio_api/call/synthesize/event_123')){
      return new Response(
        'event: generating\ndata: []\n\nevent: complete\ndata: [{"url":"'+ORIGIN+'/gradio_api/file=/tmp/speech.wav"}]\n\n',
        {headers:{'content-type':'text/event-stream'}}
      );
    }
    if(url.endsWith('/gradio_api/file=/tmp/speech.wav')){
      return new Response(WAV,{headers:{'content-type':'audio/wav'}});
    }
    throw new Error('Unexpected URL '+url);
  };
  const result=await speakF5ZeroGpu(' Halo, Diza! ','id-ID-GadisNeural');
  assert.equal(result.mime,'audio/wav');
  const reader=result.stream.getReader();
  const block=await reader.read();
  assert.equal(Buffer.from(block.value).toString('ascii',0,4),'RIFF');
  await reader.cancel();
  assert.equal(calls.length,3);
});
test('rejects external download URLs without leaking Hugging Face token',async()=>{
  setup();
  const malicious='https://attacker.example/collect';
  globalThis.fetch=async (url)=>{
    if(url.endsWith('/gradio_api/call/synthesize'))
      return new Response(JSON.stringify({event_id:'ok'}));
    if(url.endsWith('/gradio_api/call/synthesize/ok'))
      return new Response('event: complete\ndata: [{"url":"'+malicious+'"}]\n\n');
    throw new Error('Illegal URL was fetched: '+url);
  };
  await assert.rejects(speakF5ZeroGpu('Halo','id-ID-GadisNeural'),/F5 GPU sedang antre/);
});
test('rejects invalid event IDs and too-long model text',async()=>{
  setup();
  globalThis.fetch=async()=>new Response(JSON.stringify({event_id:'../etc/passwd'}));
  await assert.rejects(speakF5ZeroGpu('Halo','id-ID-GadisNeural'),/F5 GPU sedang antre/);
  await assert.rejects(speakF5ZeroGpu('A'.repeat(351),'id-ID-GadisNeural'),/350 karakter/);
});
test('single-flight guard blocks second request while first is pending',async()=>{
  setup();
  let unblock,entered;
  const start=new Promise(r=>{entered=r;});
  const pending=new Promise(r=>{unblock=r;});
  globalThis.fetch=async(url)=>{
    if(url.endsWith('/synthesize')){entered();await pending;return new Response(JSON.stringify({event_id:'ok'}));}
    if(url.endsWith('/synthesize/ok'))
      return new Response('event: complete\ndata: [{"url":"'+ORIGIN+'/gradio_api/file=/tmp/a.wav"}]\n\n');
    return new Response(WAV,{headers:{'content-type':'audio/wav'}});
  };
  const first=speakF5ZeroGpu('Halo','id-ID-GadisNeural');
  await start;
  await assert.rejects(speakF5ZeroGpu('Halo kedua','id-ID-GadisNeural'),/sebelumnya/);
  unblock();
  assert.equal((await first).mime,'audio/wav');
});
