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

// Google TTS is metered. Do NOT spend scarce per-day voice requests on startup.
// Run synthetic real-provider checks only with a separately enabled test flag.
console.log("GEMINI_TTS_STATUS=" + (process.env.GEMINI_TTS_ENABLED === "1" ? "ENABLED" : "OFF"));
if (process.env.GEMINI_TTS_SMOKE_ON_BOOT === "1" && process.env.GEMINI_TTS_ENABLED === "1") {
  void import("/opt/bloks/server/gemini-natural-tts.mjs")
    .then(({ generateGeminiNaturalVoice }) =>
      generateGeminiNaturalVoice("Halo, ini uji suara percakapan bahasa Indonesia.", "id-ID-GadisNeural"))
    .then((clip) => console.log("GEMINI_TTS_SMOKE=" + (clip ? "PASS" : "FALLBACK")))
    .catch(() => console.log("GEMINI_TTS_SMOKE=ERROR"));
} else {
  console.log("GEMINI_TTS_SMOKE=OFF");
}

// Optional real-provider benchmark. Off by default to preserve quota.
// Offline mock verification remains mandatory during every Docker build.
console.log("GEMINI_TTS_STREAM_STATUS=" + (process.env.GEMINI_TTS_STREAM_ENABLED === "1" ? "ENABLED" : "OFF"));
if (process.env.GEMINI_TTS_STREAM_SMOKE_ON_BOOT === "1" && process.env.GEMINI_TTS_STREAM_ENABLED === "1") {
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
