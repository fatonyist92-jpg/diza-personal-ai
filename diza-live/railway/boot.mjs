/**
 * Official pinned Bloks Core on persistent Railway volume.
 * Pairing code is generated only when server starts, expires in 5min,
 * and appears only in the private server deployment logs.
 */
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const dataDir = join(homedir(), ".bloks");
if (dataDir !== "/home/node/.bloks" ||
    process.env.RAILWAY_VOLUME_MOUNT_PATH !== dataDir) {
  throw new Error("Persistent Railway volume at /home/node/.bloks is mandatory.");
}
const port = Number(process.env.PORT || 10000);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw new Error("Invalid PORT");
}
process.env.BLOKS_PORT = String(port);
let config = {};
const path = join(dataDir, "config.json");
try { config = JSON.parse(readFileSync(path, "utf8")); } catch {}
if (!config || typeof config !== "object" || Array.isArray(config)) {
  throw new Error("Invalid Bloks config");
}
config.remote = { ...(config.remote || {}), enabled: true };
writeFileSync(path, JSON.stringify(config), { mode: 0o600 });
chmodSync(path, 0o600);
const { startPairing } = await import("/opt/bloks/server/pairing.ts");
const pairing = startPairing();
console.log("DIZA_PERSISTENT_VOLUME=YES");
console.log("DIZA_PAIRING_CODE=" + pairing.code);
console.log("DIZA_PAIRING_EXPIRES_IN_SEC=300");
await import("/opt/bloks/server/index.ts");
// Non-sensitive runtime choice only. Never print Google credentials.
console.log("GEMINI_STT_STATUS=" +
  (process.env.GEMINI_STT_ENABLED === "1"
    ? (process.env.GEMINI_API_KEY?.trim() ? "ENABLED" : "ENABLED_MISSING_KEY")
    : "OFF_LOCAL_ZIPFORMER_ACTIVE"));

// Optional zero-user-data synthetic smoke test for the new expressive voice.
// Runs only after the explicit TTS feature flag is enabled.
if (process.env.GEMINI_TTS_ENABLED === "1") {
  void import("/opt/bloks/server/gemini-natural-tts.mjs")
    .then(({ generateGeminiNaturalVoice }) =>
      generateGeminiNaturalVoice("Halo, ini uji suara percakapan bahasa Indonesia.", "id-ID-GadisNeural"))
    .then((clip) => console.log("GEMINI_TTS_SMOKE=" + (clip ? "PASS" : "FALLBACK")))
    .catch(() => console.log("GEMINI_TTS_SMOKE=ERROR"));
} else {
  console.log("GEMINI_TTS_SMOKE=OFF");
}

// Streaming smoke uses a fixed synthetic line, never a customer transcript.
// Performance telemetry contains only timing, output bytes and status.
if (process.env.GEMINI_TTS_STREAM_ENABLED === "1") {
  void import("/opt/bloks/server/gemini-fast-stream.mjs")
    .then(async ({ streamGeminiNaturalVoice }) => {
      const began = Date.now();
      const result = await streamGeminiNaturalVoice(
        "Halo! Sekarang suara Diza bisa mulai bicara lebih cepat.",
        "id-ID-GadisNeural");
      if (!result) { console.log("GEMINI_TTS_STREAM_SMOKE=FALLBACK"); return; }
      let bytes = 0;
      let firstMs = -1;
      for await (const pcm of result.stream) {
        if (firstMs < 0) firstMs = Date.now() - began;
        bytes += pcm.length;
      }
      console.log("GEMINI_TTS_STREAM_SMOKE=" + (bytes >= 1000 ? "PASS" : "FAIL"));
      console.log("GEMINI_TTS_STREAM_FIRST_PCM_MS=" + firstMs);
      console.log("GEMINI_TTS_STREAM_TOTAL_MS=" + (Date.now() - began));
    }).catch(() => console.log("GEMINI_TTS_STREAM_SMOKE=ERROR"));
} else {
  console.log("GEMINI_TTS_STREAM_SMOKE=OFF");
}

// Opt-in, synthetic-only local Indonesian voice acceptance test.
// All generation is offline; no user text, Google API call or tokens used.
console.log("SUPERTONIC3_TTS_STATUS=" +
  (process.env.SUPERTONIC3_TTS_ENABLED === "1" ? "ENABLED_NO_API_QUOTA" : "OFF"));
if (process.env.SUPERTONIC3_TTS_SMOKE_ON_BOOT === "1" &&
    process.env.SUPERTONIC3_TTS_ENABLED === "1") {
  void import("/opt/bloks/server/supertonic3-local-tts.mjs")
    .then(async ({ speakOfflineIndonesian }) => {
      const started = Date.now();
      const result = await speakOfflineIndonesian(
        "Halo, ini suara lokal Diza dalam bahasa Indonesia.",
        "id-ID-GadisNeural");
      if (!result) throw Error("no offline wav");
      let bytes = 0;
      for await (const chunk of result.stream) bytes += chunk.length;
      console.log("SUPERTONIC3_TTS_SMOKE=" + (bytes > 1_000 ? "PASS" : "FAIL"));
      console.log("SUPERTONIC3_TTS_SMOKE_MS=" + (Date.now() - started));
    }).catch(() => console.log("SUPERTONIC3_TTS_SMOKE=FAIL"));
}

// Check live neural audio in background; never block UI/chat startup.
void import("/opt/diza-live/neural-smoke.mjs").catch(() => {
  console.log("NEURAL_VOICE_TEST=FAILED_TO_START");
});
// Test Indonesian Zipformer2 speech recognition; no Whisper involved.
// Synthetic-only audio, local inference, no user recordings or paid API.
void import("/opt/diza-live/stt-smoke.mjs").catch(() => {
  console.log("LOCAL_ZIPFORMER_STT_TEST=FAILED_TO_START");
});
// One bounded smoke test, non-blocking: Bloks remains online even if
// OpenCode/Zen is unreachable or rejects third-party ACP clients.
void import("/opt/diza-live/muse-smoke.mjs")
  .then(() => import("/opt/diza-live/muse-acp-smoke.mjs"))
  .catch(() => {
    console.log("MUSE_SPARK_ACP_TEST=FAILED_TO_START");
  });
