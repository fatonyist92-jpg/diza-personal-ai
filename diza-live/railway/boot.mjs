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
