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

// Audio lifecycle fixes run AFTER all original fast voice replacements and
// only touch behavior, never visual layout, provider selections or secret data.
function firstOfTwo(path, before, after, label) {
  const content=readFileSync(path,"utf8");
  if(content.split(before).length!==3)throw Error("Call first-of-two mismatch: "+label);
  writeFileSync(path,content.replace(before,after));
  console.log("Call playback fixed:",label);
}
swap(voice,
  'import { PcmStreamAudio } from "@/lib/pcmStreamAudio";',
  'import { PcmStreamAudio } from "@/lib/pcmStreamAudio";\nimport { playCallAudio } from "@/lib/callPlayback";',
  "single shared bounded playback helper");

swap(voice,
  'export function setCallActive(on: boolean) {\n  callActive = on;\n}',
  'export function setCallActive(on: boolean) {\n  callActive = on;\n  if (on) { autoAudio?.pause(); autoAudio = null; }\n}',
  "stop auto playback when Call takes the audio output");

// Eager claim of speaker ownership prevents a normal chat auto-read voice
// racing against the newly opened Call overlay.
swap(voice,
  '  const beginCall = async () => {\n    // CallOverlay will request and retain its own microphone stream.\n    setCalling(true);\n  };',
  '  const beginCall = async () => {\n    setCallActive(true);\n    // CallOverlay will request and retain its own microphone stream.\n    setCalling(true);\n  };',
  "Call owns speaker before overlay starts");

firstOfTwo(voice,
  '  const audioRef = useRef<HTMLAudioElement | null>(null);',
  '  const audioRef = useRef<HTMLAudioElement | null>(null);\n  const playbackStopRef = useRef<(() => void) | null>(null);\n  const lastSpokenReplyId = useRef<string | null>(null);',
  "single-agent playback state and duplicate-turn gate");

firstOfTwo(voice,
  '  const stopAudio = () => {\n    audioRef.current?.pause();\n    audioRef.current = null;\n  };',
  '  const stopAudio = () => {\n    playbackStopRef.current?.();\n    playbackStopRef.current = null;\n    audioRef.current?.pause();\n    audioRef.current = null;\n  };',
  "single Call stop cleans watchdog on hangup or barge-in");

swap(voice,
  '    if (!reply || bot.busy) return;\n    setCallState("speaking");',
  '    if (!reply || bot.busy || lastSpokenReplyId.current === reply.id) return;\n    lastSpokenReplyId.current = reply.id;\n    setCallState("speaking");',
  "at most one TTS request per completed agent reply");

swap(voice,
  '        audioRef.current = audio;\n        audio.addEventListener("ended", () => live.current && listen(), { once: true });\n        return audio.play();',
  [
  '        audioRef.current = audio;',
  '        playbackStopRef.current = playCallAudio(audio, () => {',
  '          if (audioRef.current === audio) audioRef.current = null;',
  '          playbackStopRef.current = null;',
  '          if (live.current) listen();',
  '        }, Math.min(120_000, Math.max(25_000, reply.text.length * 125 + 8_000)));',
  '        return;',
  ].join("\n"),
  "Speaking always resolves on ended, error or bounded timeout");

// Room Call can otherwise await an audio "ended" event forever, blocking
// the FIFO and preventing the microphone from reopening.
swap(voice,
  '  const [speakingId, setSpeakingId] = useState<string | null>(null);',
  '  const [speakingId, setSpeakingId] = useState<string | null>(null);\n  const groupPlaybackStopRef = useRef<(() => void) | null>(null);',
  "room-call playback watchdog state");

swap(voice,
  '              await new Promise<void>((resolve) => {\n                audio.addEventListener("ended", () => resolve(), { once: true });\n                audio.addEventListener("error", () => resolve(), { once: true });\n                void audio.play().catch(() => resolve());\n              });',
  [
  '              await new Promise<void>((resolve) => {',
  '                const release = playCallAudio(audio, () => {',
  '                  groupPlaybackStopRef.current = null;',
  '                  resolve();',
  '                }, Math.min(120_000, Math.max(25_000, message.text!.length * 125 + 8_000)));',
  '                groupPlaybackStopRef.current = () => { release(); resolve(); };',
  '              });',
  ].join("\n"),
  "room Call queue never blocks on missing audio-ended events");

// AudioRef in Group Call may point to a paused clip, but a Promise can
// still be awaiting playback. Unblock it on barge-in or hang-up.
swap(voice,
  '  const [needsManualFinish, setNeedsManualFinish] = useState(false);\n  const audioRef = useRef<HTMLAudioElement | null>(null);',
  '  const [needsManualFinish, setNeedsManualFinish] = useState(false);\n  const audioRef = useRef<HTMLAudioElement | null>(null);',
  "preserve unchanged Group overlay ref shape");
