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
// Check live neural audio in background; never block UI/chat startup.
void import("/opt/diza-live/neural-smoke.mjs").catch(() => {
  console.log("NEURAL_VOICE_TEST=FAILED_TO_START");
});
// Prove local Whisper transcribes actual Indonesian speech, not just MP3 generation.
// Never log the recording or transcript. Nonblocking and cached 12h.
void import("/opt/diza-live/stt-smoke.mjs").catch(() => {
  console.log("LOCAL_WHISPER_STT_TEST=FAILED_TO_START");
});
// One bounded smoke test, non-blocking: Bloks remains online even if
// OpenCode/Zen is unreachable or rejects third-party ACP clients.
void import("/opt/diza-live/muse-smoke.mjs")
  .then(() => import("/opt/diza-live/muse-acp-smoke.mjs"))
  .catch(() => {
    console.log("MUSE_SPARK_ACP_TEST=FAILED_TO_START");
  });
