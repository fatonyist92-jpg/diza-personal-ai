/**
 * Real model staging integration, HTTP on loopback only INSIDE GitHub CI:
 * Pocket JS adapter -> Python worker -> Indonesian voice model -> PCM16 WAV.
 *
 * The production adapter retains its strict public HTTPS requirement.
 * This test swaps transport ONLY in the test process to avoid exposing
 * a disposable CI model to the public internet.
 */
import assert from 'node:assert/strict';
import { pocketCpuSelected, speakPocketCpu } from './pocket-remote-tts.mjs';

const token = process.env.POCKET_VOICE_TOKEN;
assert.ok(token?.length >= 24, 'isolated worker token required');

process.env.POCKET_CPU_TTS_ENABLED = '1';
process.env.POCKET_CPU_TTS_URL = 'https://voice.example.org/v1/tts';
process.env.POCKET_CPU_TTS_TOKEN = token;

const original = globalThis.fetch.bind(globalThis);
globalThis.fetch = (url, options) => {
  assert.equal(url, 'https://voice.example.org/v1/tts',
    'unexpected outbound URL; refusing request');
  return original('http://127.0.0.1:8765/v1/tts', options);
};

assert.equal(pocketCpuSelected('id-ID-GadisNeural'),true);
const started = performance.now();
const out = await speakPocketCpu('Halo, aku Diza. Gimana kabar kamu hari ini?',
  'id-ID-GadisNeural');
const elapsedMs = performance.now() - started;
assert.equal(out.mime, 'audio/wav');
const chunks = [];
for await (const part of out.stream) chunks.push(Buffer.from(part));
const wav = Buffer.concat(chunks);
assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
assert.ok(wav.length > 24000);
const sampleRate = wav.readUInt32LE(24);
assert.equal(sampleRate, 24000);
const duration = (wav.length-44)/(2*sampleRate);
assert.ok(duration >= .4 && duration <= 24);
console.log('REAL_BRIDGE_PASS',JSON.stringify({
  adapter:'isolated pocket-remote-tts.mjs',
  worker:'real Pocket-TTS Indonesian 6layer',
  local_test_transport:'loopback-only, production adapter still HTTPS',
  response_ms: Math.round(elapsedMs),
  audio_s: Math.round(duration*1000)/1000,
  wav_bytes: wav.length
}));
