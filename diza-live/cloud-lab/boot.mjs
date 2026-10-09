/**
 * Disposable Bloks cloud pairing lab. Explicitly gated because Render Free
 * erases ~/.bloks on idle/restart/redeploy. NEVER use for lasting memory.
 */
import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

if (process.env.DIZA_LAB_ACK_EPHEMERAL !== "1") {
  console.error("Refusing boot: Bloks data cannot persist on this cloud plan.");
  console.error("Set DIZA_LAB_ACK_EPHEMERAL=1 for disposable pairing tests ONLY.");
  process.exit(78);
}
if (process.env.BLOKS_LOOPBACK_ONLY === "1") {
  throw new Error("BLOKS_LOOPBACK_ONLY=1 prevents remote Android pairing.");
}
const port = Number(process.env.PORT || 10000);
if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
  throw new Error("Invalid PORT");
}
process.env.BLOKS_PORT = String(port);
const base = join(homedir(), ".bloks");
mkdirSync(base, { recursive: true, mode: 0o700 });
const configFile = join(base, "config.json");
let config = {};
try { config = JSON.parse(readFileSync(configFile, "utf8")); } catch {}
if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Invalid config");
config.remote = { ...(config.remote || {}), enabled: true };
writeFileSync(configFile, JSON.stringify(config), { mode: 0o600 });
chmodSync(configFile, 0o600);

// Code expires after 5 minutes, with only 5 allowed guesses.
// Render private logs are used to deliver it to the owner.
const { startPairing } = await import("/opt/bloks/server/pairing.ts");
const pairing = startPairing();
console.log("DIZA_LAB_EPHEMERAL=YES");
console.log("DIZA_PAIRING_CODE=" + pairing.code);
console.log("DIZA_PAIRING_EXPIRES_IN_SEC=300");
await import("/opt/bloks/server/index.ts");
