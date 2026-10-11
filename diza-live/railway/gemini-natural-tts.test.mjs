import { strict as assert } from 'node:assert';
import { generateGeminiNaturalVoice } from './gemini-natural-tts.mjs';

const previousFetch = globalThis.fetch;
const previousKey = process.env.GEMINI_API_KEY;
const previousFlag = process.env.GEMINI_TTS_ENABLED;
const headers = new Headers({ 'content-type': 'application/json' });
const wav = Buffer.alloc(64);
wav.write('RIFF', 0, 'ascii');
wav.write('WAVE', 8, 'ascii');
try {
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('should not reach Google while off'); };
  process.env.GEMINI_TTS_ENABLED = '0';
  process.env.GEMINI_API_KEY = 'test-private-key';
  assert.equal(await generateGeminiNaturalVoice('Tes satu dua tiga', 'id-ID-GadisNeural'), null);
  assert.equal(calls, 0);
  process.env.GEMINI_TTS_ENABLED = '1';
  assert.equal(await generateGeminiNaturalVoice('Tes satu dua tiga', 'id-ID-ArdiNeural'), null);
  assert.equal(calls, 0);
  const mockResponse = {steps: [{type:'model_output',content:[{type:'audio',data:wav.toString('base64')}]}]};
  globalThis.fetch = async (url, req) => {
    calls++;
    assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(req.headers['x-goog-api-key'],'test-private-key');
    const body = JSON.parse(req.body);
    assert.equal(body.model, 'gemini-3.8-flash-tts');
    assert.equal(body.input[0].content[0].text, 'Tes satu dua tiga');
    assert.equal(body.generation_config.speech_config[0].voice, 'Aoede');
    return new Response(JSON.stringify(mockResponse), {status:200,headers});
  };
  const result = await generateGeminiNaturalVoice('Tes satu dua tiga','id-ID-GadisNeural');
  assert.equal(result.mime,'audio/wav');
  assert.deepEqual(result.audio,wav);
  globalThis.fetch = async () => new Response('{}',{status:429,headers});
  assert.equal(await generateGeminiNaturalVoice('Tes satu dua tiga','id-ID-GadisNeural'),null);
  globalThis.fetch = async () => new Response(JSON.stringify({steps:[{type:'model_output',content:[{type:'audio',data:Buffer.from('garbage').toString('base64')}]}]}),{status:200,headers});
  assert.equal(await generateGeminiNaturalVoice('Tes satu dua tiga','id-ID-GadisNeural'),null);
  console.log('PASS feature flag, voice scope, API format, valid WAV, quota fallback, invalid WAV');
} finally {
  globalThis.fetch = previousFetch;
  if (previousKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = previousKey;
  if (previousFlag === undefined) delete process.env.GEMINI_TTS_ENABLED;
  else process.env.GEMINI_TTS_ENABLED = previousFlag;
}
