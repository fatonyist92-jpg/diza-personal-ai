import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { streamGeminiNaturalVoice } from './gemini-fast-stream.mjs';
import { generateGeminiNaturalVoice, geminiTtsState } from './gemini-natural-tts.mjs';

const old = { fetch: globalThis.fetch, key: process.env.GEMINI_API_KEY, enabled: process.env.GEMINI_TTS_ENABLED, stream: process.env.GEMINI_TTS_STREAM_ENABLED };
try {
  process.env.GEMINI_API_KEY = 'mock-testing-only';
  process.env.GEMINI_TTS_ENABLED = '1';
  process.env.GEMINI_TTS_STREAM_ENABLED = '1';
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response('{}', { status: 429, headers: { 'retry-after': '60' } }); };
  assert.equal(await streamGeminiNaturalVoice('Synthetic test', 'id-ID-GadisNeural'), null);
  assert.equal(geminiTtsState(), 'GOOGLE_429');
  assert.equal(await generateGeminiNaturalVoice('Synthetic test', 'id-ID-GadisNeural'), null);
  assert.equal(await streamGeminiNaturalVoice('Synthetic test', 'id-ID-GadisNeural'), null);
  assert.equal(calls, 1, '429 must not trigger duplicate Google requests or an immediate second retry');
  const speech = readFileSync('/opt/bloks/server/speech.ts', 'utf8');
  const call = readFileSync('/opt/bloks/src/components/Voice.tsx', 'utf8');
  assert.match(speech, /if \(geminiTtsAvailable\(voice\.id\)\) \{/);
  assert.match(speech, /throw new Error\(message\)/);
  assert.match(call, /if \(live\.current\) setCallState\("idle"\)/);
  console.log('NATURAL_VOICE_429_SAFETY_TEST=PASS');
} finally {
  globalThis.fetch = old.fetch;
  for (const [key, value] of [['GEMINI_API_KEY', old.key], ['GEMINI_TTS_ENABLED', old.enabled], ['GEMINI_TTS_STREAM_ENABLED', old.stream]]) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}
