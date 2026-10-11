// Integrate official Gradio ZeroGPU branch before the optional direct GPU worker.
// No frontend UI/engine settings changed; feature stays OFF until all endpoints
// and secrets have been verified on a user-owned legitimate ZeroGPU Space.
import { readFileSync, writeFileSync } from 'node:fs';
const file='/opt/bloks/server/speech.ts';
const original=readFileSync(file,'utf8');
const anchor='import { speakF5Remote, f5RemoteVoiceSelected } from "./f5-remote-tts.mjs";';
const entry='    // Authenticated F5 GPU voice takes priority only when explicitly enabled.';
if(original.split(anchor).length!==2||original.split(entry).length!==2)
  throw Error('ZeroGPU patch refused: speech.ts differs from tested pinned integration');
const withImport=original.replace(anchor,
  anchor+'\nimport { speakF5ZeroGpu, f5ZeroGpuSelected } from "./f5-hf-zerogpu-tts.mjs";');
const result=withImport.replace(entry,[
  '    // Official Gradio ZeroGPU API uses the existing authenticated /speak route.',
  '    if (f5ZeroGpuSelected(voice.id)) {',
  '      const gpu = await speakF5ZeroGpu(clipped, voice.id);',
  '      if (gpu) return gpu;',
  '      throw new Error("F5 ZeroGPU belum tersedia. Tidak memakai suara robot.");',
  '    }',
  entry,
].join('\n'));
writeFileSync(file,result);
console.info('ZeroGPU patch: authenticated voice backend ready, disabled until configured');
