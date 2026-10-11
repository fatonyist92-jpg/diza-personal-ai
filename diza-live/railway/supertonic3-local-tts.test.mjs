import { strict as assert } from 'node:assert';
import { offlineNaturalVoiceSelected, speakOfflineIndonesian } from './supertonic3-local-tts.mjs';
const original = process.env.SUPERTONIC3_TTS_ENABLED;
try {
  process.env.SUPERTONIC3_TTS_ENABLED = '0';
  assert.equal(offlineNaturalVoiceSelected('id-ID-GadisNeural'), false);
  assert.equal(await speakOfflineIndonesian('Tes satu dua tiga','id-ID-GadisNeural'), null);
  process.env.SUPERTONIC3_TTS_ENABLED = '1';
  assert.equal(offlineNaturalVoiceSelected('id-ID-GadisNeural'), true);
  assert.equal(offlineNaturalVoiceSelected('id-ID-ArdiNeural'), false);
  assert.equal(await speakOfflineIndonesian('Tes satu dua tiga','id-ID-ArdiNeural'), null);
  console.log('SUPERTONIC3_ROUTING_TEST=PASS');
} finally {
  if(original === undefined) delete process.env.SUPERTONIC3_TTS_ENABLED;
  else process.env.SUPERTONIC3_TTS_ENABLED=original;
}