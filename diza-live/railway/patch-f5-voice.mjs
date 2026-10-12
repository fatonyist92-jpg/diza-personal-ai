// Optional F5 GPU backend. Insert AFTER the existing pinned fast voice patch;
// it changes only speech.ts server routing, never original WhatsApp-like UI.
import { readFileSync, writeFileSync } from 'node:fs';
const path='/opt/bloks/server/speech.ts';
const source=readFileSync(path,'utf8');
const importAnchor='import { speakOfflineIndonesian, offlineNaturalVoiceSelected } from "./supertonic3-local-tts.mjs";';
const routeAnchor='    // Local Supertonic preempts all Gemini/Edge TTS for this selected voice.';
if(source.split(importAnchor).length!==2 || source.split(routeAnchor).length!==2) {
  throw new Error('F5 voice patch refused: pinned upstream anchors changed');
}
const withImport=source.replace(importAnchor,importAnchor+'\nimport { speakF5Remote, f5RemoteVoiceSelected } from "./f5-remote-tts.mjs";');
const final=withImport.replace(routeAnchor,[
  '    // Authenticated F5 GPU voice takes priority only when explicitly enabled.',
  '    // If the GPU is sleeping, fail closed rather than playing foreign/robotic TTS.',
  '    if (f5RemoteVoiceSelected(voice.id)) {',
  '      const f5voice = await speakF5Remote(clipped, voice.id);',
  '      if (f5voice) return f5voice;',
  '      throw new Error("Suara F5 belum siap. Tidak dialihkan ke suara robot.");',
  '    }',
  routeAnchor,
].join('\n'));
writeFileSync(path,final);
console.info('F5 voice patch: optional authenticated remote GPU WAV transport; original UI preserved');
