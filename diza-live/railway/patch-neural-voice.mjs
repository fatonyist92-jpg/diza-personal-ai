// Extend pinned Bloks voice stack with natural Indonesian neural voices.
// DO NOT use device/Android TTS. Keep OpenAI/ElevenLabs/system routes intact.
// Explicitly opt-in by selecting a voice in an agent; no paid API required.
import { readFileSync, writeFileSync } from "node:fs";
function swap(file, oldText, next, label) {
  const s = readFileSync(file, "utf8");
  const i = s.indexOf(oldText);
  if (i < 0 || s.indexOf(oldText, i + oldText.length) !== -1) {
    throw Error("Natural voice patch anchor: " + label);
  }
  writeFileSync(file, s.slice(0, i) + next + s.slice(i + oldText.length));
  console.log("Neural voice patch:", label);
}
const server = "/opt/bloks/server/speech.ts";
const ui = "/opt/bloks/src/components/Voice.tsx";
const db = "/opt/bloks/server/store.ts";
const reducer = "/opt/bloks/src/state/reducer.ts";

// Only patch the existing neural TTS branch; preserve all other providers and UI.
swap(server,
  'import { Readable } from "node:stream";',
  'import { Readable } from "node:stream";\nimport { generateGeminiNaturalVoice } from "./gemini-natural-tts.mjs";',
  "server-only optional Gemini voice import");

// Both Voice and BotVoice must accept a neural selection, but only through
// the existing private /api/bots/:id voice setter (no public endpoints).
swap(server,
  'export interface Voice {\n  provider: "elevenlabs" | "openai" | "system";',
  'export interface Voice {\n  provider: "elevenlabs" | "openai" | "system" | "neural";',
  "list voice type");
swap(server,
  'export interface BotVoice {\n  provider: "elevenlabs" | "openai" | "system";',
  'export interface BotVoice {\n  provider: "elevenlabs" | "openai" | "system" | "neural";',
  "bot voice type");

swap(server,
  'export const SPEAK_MAX_CHARS = 2_500;',
  [
    'export const SPEAK_MAX_CHARS = 2_500;',
    '',
    '// Remote neural voice, free to access through the Edge read-aloud service.',
    '// This is an unofficial integration: an upstream service restriction will',
    '// produce an error instead of silently billing or switching providers.',
    'const NEURAL_VOICES: Voice[] = [',
    '  { provider: "neural", id: "id-ID-GadisNeural", name: "Gadis · Neural Indonesia (Perempuan)" },',
    '  { provider: "neural", id: "id-ID-ArdiNeural", name: "Ardi · Neural Indonesia (Laki-laki)" },',
    '  { provider: "neural", id: "en-US-JennyNeural", name: "Jenny · Neural English (Perempuan)" },',
    '  { provider: "neural", id: "en-US-GuyNeural", name: "Guy · Neural English (Laki-laki)" },',
    '];',
  ].join("\n"),
  "free neural voices catalog");

swap(server,
  'export async function listVoices(cfg: AppConfig): Promise<Voice[]> {\n  const voices: Voice[] = [];',
  'export async function listVoices(cfg: AppConfig): Promise<Voice[]> {\n  const voices: Voice[] = [...NEURAL_VOICES];',
  "always list key-free neural voices");

swap(server,
  '  const clipped = text.slice(0, SPEAK_MAX_CHARS);\n  if (voice.provider === "system") {',
  [
    '  const clipped = text.slice(0, SPEAK_MAX_CHARS);',
    '  if (voice.provider === "neural") {',
    '    if (!NEURAL_VOICES.some((v) => v.id === voice.id)) throw new Error("invalid neural voice");',
    '    const realistic = await generateGeminiNaturalVoice(clipped, voice.id);',
    '    if (realistic) return { stream: Readable.toWeb(Readable.from([realistic.audio])) as ReadableStream<Uint8Array>, mime: realistic.mime };',
    '    const mp3 = await new Promise<Buffer>((resolve, reject) => {',
    '      const child = execFile(',
    '        "/opt/diza-live/tts-venv/bin/python",',
    '        ["/opt/diza-live/tts-neural.py", voice.id],',
    '        { encoding: "buffer", timeout: 38_000, maxBuffer: 3_000_000 },',
    '        (error, stdout) => {',
    '          if (error || !stdout || stdout.length < 200) {',
    '            reject(new Error("Neural voice temporarily unavailable. Please try again."));',
    '            return;',
    '          }',
    '          resolve(Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout));',
    '        },',
    '      );',
    '      child.stdin?.on("error", () => {});',
    '      child.stdin?.end(clipped);',
    '    });',
    '    return { stream: Readable.toWeb(Readable.from([mp3])) as ReadableStream<Uint8Array>, mime: "audio/mpeg" };',
    '  }',
    '  if (voice.provider === "system") {',
  ].join("\n"),
  "natural neural MP3 from limited subprocess");

swap(server,
  '  if (v.provider !== "elevenlabs" && v.provider !== "openai" && v.provider !== "system") return undefined;',
  '  if (v.provider !== "elevenlabs" && v.provider !== "openai" && v.provider !== "system" && v.provider !== "neural") return undefined;',
  "validate neural bot voice");

swap(db,
  'voice?: { provider: "elevenlabs" | "openai"; id: string; name?: string } | null;',
  'voice?: { provider: "elevenlabs" | "openai" | "system" | "neural"; id: string; name?: string } | null;',
  "persist neural selection");

swap(reducer,
  'voice?: { provider: "elevenlabs" | "openai" | "system"; id: string; name?: string } | null;',
  'voice?: { provider: "elevenlabs" | "openai" | "system" | "neural"; id: string; name?: string } | null;',
  "client state neural selection");

swap(ui,
  '  provider: "elevenlabs" | "openai" | "system";',
  '  provider: "elevenlabs" | "openai" | "system" | "neural";',
  "voice picker type");

swap(ui,
  'export function VoiceCard({ bot }: { bot: Bot }) {\n  const { state } = useStore();',
  'export function VoiceCard({ bot }: { bot: Bot }) {',
  "voice card no longer depends on paid settings");
swap(ui,
  '  const configured = state.config?.speech?.elevenlabs || state.config?.speech?.openai || state.config?.speech?.system;',
  '  const configured = true; // Two Indonesian neural voices need no API key.',
  "natural voice always available");

swap(ui,
  '{voice.provider === "elevenlabs" ? "11L" : voice.provider === "openai" ? "OpenAI" : "Mac"}',
  '{voice.provider === "elevenlabs" ? "11L" : voice.provider === "openai" ? "OpenAI" : voice.provider === "neural" ? "Neural · Gratis" : "Mac"}',
  "natural neural voice badge");
