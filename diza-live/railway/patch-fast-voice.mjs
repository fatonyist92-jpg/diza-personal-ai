// Low-latency voice transport only. Pinned Bloks UI and engine routes unchanged.
// Runs AFTER patch-neural-voice, patch-browser-speech and patch-local-stt.
import { readFileSync, writeFileSync } from "node:fs";
function swap(path, before, after, label) {
  const source=readFileSync(path,"utf8");
  if(source.split(before).length!==2)throw Error("Fast voice patch anchor mismatch: "+label);
  writeFileSync(path,source.replace(before,after));
  console.log("Fast voice patch:",label);
}
const speech="/opt/bloks/server/speech.ts";
const voice="/opt/bloks/src/components/Voice.tsx";
swap(speech,
  'import { generateGeminiNaturalVoice } from "./gemini-natural-tts.mjs";',
  'import { generateGeminiNaturalVoice } from "./gemini-natural-tts.mjs";\nimport { streamGeminiNaturalVoice } from "./gemini-fast-stream.mjs";',
  "server-only Google PCM streaming import");
swap(speech,
  'import { streamGeminiNaturalVoice } from "./gemini-fast-stream.mjs";',
  'import { streamGeminiNaturalVoice } from "./gemini-fast-stream.mjs";\nimport { speakOfflineIndonesian, offlineNaturalVoiceSelected } from "./supertonic3-local-tts.mjs";',
  "isolated self-hosted no-quota TTS import");
swap(speech,
  '    const realistic = await generateGeminiNaturalVoice(clipped, voice.id);',
  [
  '    const fast = await streamGeminiNaturalVoice(clipped, voice.id);',
  
  '    if (fast) return fast;',
  '    const realistic = await generateGeminiNaturalVoice(clipped, voice.id);',
  ].join("\n"),
  "stream Gemini ahead of existing verified WAV and Edge fallback");
swap(speech,
  '    const fast = await streamGeminiNaturalVoice(clipped, voice.id);',
  [
    '    // Local Supertonic preempts all Gemini/Edge TTS for this selected voice.',
    '    // No daily API request quota, never silently switch to robotic Edge.',
    '    if (offlineNaturalVoiceSelected(voice.id)) {',
    '      const localVoice = await speakOfflineIndonesian(clipped, voice.id);',
    '      if (localVoice) return localVoice;',
    '      throw new Error("Suara natural lokal belum tersedia. Tidak diganti ke suara robot.");',
    '    }',
    '    const fast = await streamGeminiNaturalVoice(clipped, voice.id);',
  ].join("\n"),
  "select offline voice ahead of every network TTS");
swap(voice,
  'import { startBrowserMic, type BrowserMicSession } from "@/lib/browserMic";',
  'import { startBrowserMic, type BrowserMicSession } from "@/lib/browserMic";\nimport { PcmStreamAudio } from "@/lib/pcmStreamAudio";',
  "browser audio-only helper import");
swap(voice,
  '  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "speech failed");\n  const url = URL.createObjectURL(await res.blob());',
  [
    '  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "speech failed");',
    '  // Gemini stream plays its first PCM frames as soon as they arrive.',
    '  // Other providers and Edge retain the original trusted blob playback.',
    '  if (res.body && (res.headers.get("content-type") ?? "").startsWith("audio/l16")) {',
    '    return new PcmStreamAudio(res.body) as unknown as HTMLAudioElement;',
    '  }',
    '  const url = URL.createObjectURL(await res.blob());',
  ].join("\n"),
  "play streamed frames without waiting for full audio");
swap(voice,
  '      if (callActive) return;\n      autoAudio = audio;',
  '      if (callActive) { audio.pause(); return; }\n      autoAudio = audio;',
  "discard unplayed autovoice streams when a call takes over");
swap(voice,
  '        if (!live.current) return;\n        audioRef.current = audio;',
  '        if (!live.current) { audio.pause(); return; }\n        audioRef.current = audio;',
  "abort streamed Call audio after hang-up");
