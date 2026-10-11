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
  'import { generateGeminiNaturalVoice, geminiTtsAvailable, geminiTtsState } from "./gemini-natural-tts.mjs";\nimport { streamGeminiNaturalVoice } from "./gemini-fast-stream.mjs";',
  "server-only Google PCM streaming import");
swap(speech,
  '    const realistic = await generateGeminiNaturalVoice(clipped, voice.id);',
  [
  '    const fast = await streamGeminiNaturalVoice(clipped, voice.id);',
  '    if (fast) return fast;',
  '    const realistic = await generateGeminiNaturalVoice(clipped, voice.id);',
  ].join("\n"),
  "stream Gemini ahead of existing verified WAV and Edge fallback");
swap(speech,
  '    if (realistic) return { stream: Readable.toWeb(Readable.from([realistic.audio])) as ReadableStream<Uint8Array>, mime: realistic.mime };',
  [
    '    if (realistic) return { stream: Readable.toWeb(Readable.from([realistic.audio])) as ReadableStream<Uint8Array>, mime: realistic.mime };',
    '    // The user selected lifelike Gemini voice: never switch it to robotic Edge.',
    '    if (geminiTtsAvailable(voice.id)) {',
    '      const state = geminiTtsState();',
    '      const message = state === "GOOGLE_429"',
    '        ? "Suara Gemini sedang dibatasi Google (429). Coba lagi sebentar."',
    '        : state === "LOCAL_DAILY_LIMIT"',
    '          ? "Batas penggunaan suara Gemini hari ini tercapai. Suara robot tidak digunakan."',
    '          : "Suara natural Gemini sementara tidak tersedia. Coba ulang beberapa saat.";',
    '      throw new Error(message);',
    '    }',
  ].join("\n"),
  "never silently downgrade natural Gadis voice to robotic Edge");
swap(voice,
  '        setError(e.message);\n        if (live.current) listen();',
  '        setError(e.message);\n        if (live.current) setCallState("idle");',
  "keep Gemini rate-limit message visible and let Call retry manually");
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
