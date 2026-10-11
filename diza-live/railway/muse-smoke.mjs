/**
 * One bounded, one-time, REAL smoke test of Muse Spark's no-charge model
 * through the official OpenCode CLI installed in the Bloks Railway image.
 *
 * No Meta API key, paid model or workaround for any OpenCode free-tier gate.
 * Fixed harmless prompt; no user content, credentials or CLI output in logs.
 * A cached result prevents consuming additional free quota on restarts.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const MODEL = "opencode/muse-spark-1.3-contributor-free";
const RESULT_FILE = "/home/node/.bloks/opencode/muse-spark-free-test.json";
const ONE_TEST_PER_MS = 12 * 60 * 60 * 1000;

function readLastResult() {
  try {
    const result = JSON.parse(readFileSync(RESULT_FILE, "utf8"));
    if (result.model === MODEL && Date.now() - Date.parse(result.checkedAt) < ONE_TEST_PER_MS) {
      return result;
    }
  } catch {}
  return null;
}
function diagnostic(output) {
  if (/only be used from within OpenCode|FreeTierError/i.test(output)) return "FREE_TIER_CLIENT_RESTRICTED";
  if (/not available in your country|RegionError|not available in your region/i.test(output)) return "REGION_RESTRICTED";
  if (/insufficient credits|billing|payment required|requires payment/i.test(output)) return "PAYMENT_REQUIRED";
  if (/rate.limit|quota.exceeded|too many requests|429/i.test(output)) return "RATE_LIMITED";
  if (/unauthorized|not authenticated|invalid key|auth required|login required/i.test(output)) return "LOGIN_REQUIRED";
  if (/model.not.found|unknown model|model not found/i.test(output)) return "MODEL_NOT_FOUND";
  if (/ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|network error|connect timeout/i.test(output)) return "NETWORK_FAILURE";
  return "NO_VERIFIED_REPLY";
}
function run(argv, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn("opencode", argv, {
      cwd: "/home/node",
      env: { ...process.env, CI: "1", NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const finish = (code, failure) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut, failure });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill("SIGTERM"); } catch {}
      finish(null, "TIMEOUT");
    }, timeoutMs);
    child.stdout.on("data", (buf) => { stdout = (stdout + buf.toString()).slice(-128_000); });
    child.stderr.on("data", (buf) => { stderr = (stderr + buf.toString()).slice(-16_000); });
    child.once("error", () => finish(null, "SPAWN_FAILED"));
    child.once("close", (code) => finish(code, null));
  });
}
function hasActualText(stdout) {
  for (const line of stdout.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      if (event?.type === "text" && event?.part?.type === "text" &&
          typeof event.part.text === "string" && event.part.text.trim()) return true;
    } catch {}
  }
  return false;
}
function save(result) {
  const data = { model: MODEL, checkedAt: new Date().toISOString(), ...result };
  mkdirSync(dirname(RESULT_FILE), { recursive: true, mode: 0o700 });
  writeFileSync(RESULT_FILE, JSON.stringify(data), { mode: 0o600 });
  console.log("MUSE_SPARK_FREE_TEST=" + data.status);
  console.log("MUSE_SPARK_FREE_REASON=" + data.reason);
}
const previous = readLastResult();
if (previous) {
  console.log("MUSE_SPARK_FREE_TEST=" + previous.status + " (cached)");
  console.log("MUSE_SPARK_FREE_REASON=" + previous.reason);
} else {
  console.log("MUSE_SPARK_FREE_TEST=checking");
  const models = await run(["models", "opencode"], 45_000);
  if (models.failure || models.code !== 0) {
    save({ status: "UNVERIFIED", reason: models.failure ?? diagnostic(models.stdout + "\n" + models.stderr) });
  } else if (!models.stdout.split(/\r?\n/).some((line) => line.trim() === MODEL)) {
    save({ status: "UNAVAILABLE", reason: "FREE_MODEL_NOT_IN_OPENCODE_CATALOG" });
  } else {
    console.log("MUSE_SPARK_FREE_CATALOG=FOUND");
    // Explicitly selects the FREE variant, not the paid Muse Spark API model.
    const reply = await run(["run", "--model", MODEL, "--format", "json", "Reply with the single word OK."], 135_000);
    const output = reply.stdout + "\n" + reply.stderr;
    if (!reply.failure && reply.code === 0 && hasActualText(reply.stdout)) {
      save({ status: "PASS", reason: "REAL_OPENCODE_FREE_MODEL_REPLY_RECEIVED" });
    } else {
      save({ status: "FAILED", reason: reply.failure ?? diagnostic(output) });
    }
  }
}
