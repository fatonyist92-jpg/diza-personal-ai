/**
 * One real ACP protocol test of the explicitly FREE Muse Spark model through
 * the same JSON-RPC library and calls as Bloks' OpenCode driver.
 *
 * No account secrets, customer content or billing. Never bypass an
 * official free-tier client/region restriction; report it clearly.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { attachRpc } from "/opt/bloks/server/harness/jsonrpc-stdio.ts";

const MODEL = "opencode/muse-spark-1.3-contributor-free";
const REPORT = "/home/node/.bloks/opencode/muse-free-acp-test.json";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const TIMEOUT_MS = 120_000;
function cached() {
  try {
    const r = JSON.parse(readFileSync(REPORT, "utf8"));
    if (r.model === MODEL && Date.now() - Date.parse(r.checkedAt) < MAX_AGE_MS) return r;
  } catch {}
  return null;
}
function result(status, reason) {
  mkdirSync(dirname(REPORT), { recursive: true, mode: 0o700 });
  writeFileSync(REPORT,
    JSON.stringify({ model: MODEL, status, reason, checkedAt: new Date().toISOString() }),
    { mode: 0o600 });
  console.log("MUSE_SPARK_ACP_TEST=" + status);
  console.log("MUSE_SPARK_ACP_REASON=" + reason);
}
function reasonFor(err) {
  const s = String(err?.message ?? err);
  if (/FreeTierError|only be used from within OpenCode/i.test(s)) return "FREE_TIER_CLIENT_RESTRICTED";
  if (/RegionError|not available in your country/i.test(s)) return "REGION_RESTRICTED";
  if (/payment|billing|credit/i.test(s)) return "PAYMENT_REQUIRED";
  if (/not authorized|unauthorized|authentication|401/i.test(s)) return "LOGIN_REQUIRED";
  if (/rate limit|429|quota/i.test(s)) return "RATE_LIMITED";
  if (/model.*not found|unknown model/i.test(s)) return "MODEL_NOT_FOUND";
  if (/time(d)? out/i.test(s)) return "TIMEOUT";
  return "ACP_PROTOCOL_OR_PROVIDER_ERROR";
}
function flatten(option) {
  const out = [];
  for (const item of option?.options ?? []) {
    for (const val of Array.isArray(item?.options) ? item.options : [item]) {
      if (val?.value !== undefined) out.push(String(val.value));
    }
  }
  return out;
}
const previous = cached();
if (previous) {
  console.log("MUSE_SPARK_ACP_TEST=" + previous.status + " (cached)");
  console.log("MUSE_SPARK_ACP_REASON=" + previous.reason);
} else {
  console.log("MUSE_SPARK_ACP_TEST=checking");
  const child = spawn("opencode", ["acp"], {
    cwd: "/home/node",
    env: { ...process.env, CI: "1", NO_COLOR: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  child.stderr?.resume();
  let replyText = "";
  let providerError = "";
  let rpc;
  rpc = attachRpc({
    stdin: child.stdin, stdout: child.stdout,
    onRequest: (msg) => rpc.replyError(msg.id, -32601, "not supported by test client"),
    onNotify: (msg) => {
      if (msg.method !== "session/update") return;
      const u = msg.params?.update ?? {};
      if (u.sessionUpdate === "agent_message_chunk" && u.content?.type === "text" &&
          typeof u.content.text === "string") {
        replyText = (replyText + u.content.text).slice(-4000);
      }
      if (u.sessionUpdate === "tool_call" && u.kind === "terminal") {
        // Do not approve commands during a harmless reply-only diagnostic.
        providerError = "UNEXPECTED_TOOL_REQUEST";
      }
    },
  });
  child.once("error", () => rpc.failPending(new Error("ACP_SPAWN_ERROR")));
  child.once("close", () => rpc.failPending(new Error("ACP_PROCESS_EXIT")));
  const timeout = setTimeout(() => {
    try { child.kill("SIGTERM"); } catch {}
    rpc.failPending(new Error("ACP_TIMEOUT"));
  }, TIMEOUT_MS);
  timeout.unref?.();
  try {
    // Identical protocol version and capability boundaries to Bloks' ACP.
    await rpc.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      clientInfo: { name: "bloks", version: "1" },
    });
    const session = await rpc.request("session/new", {
      cwd: "/home/node",
      mcpServers: [],
    });
    if (!session?.sessionId) throw new Error("ACP_SESSION_MISSING");
    const option = (session.configOptions ?? []).find((o) =>
      o?.type === "select" && (o.category === "model" || o.id === "model"));
    const options = flatten(option);
    const legacy = (session.models?.availableModels ?? []).map((m) => String(m.modelId));
    const catalog = options.length ? options : legacy;
    if (!catalog.includes(MODEL)) {
      result("UNAVAILABLE", "FREE_MODEL_NOT_IN_ACP_CATALOG");
    } else {
      const current = option ? String(option.currentValue ?? "") : String(session.models?.currentModelId ?? "");
      if (current !== MODEL) {
        if (option) {
          await rpc.request("session/set_config_option", {
            sessionId: session.sessionId,
            configId: String(option.id),
            value: MODEL,
          });
        } else {
          await rpc.request("session/set_model", {
            sessionId: session.sessionId, modelId: MODEL,
          });
        }
      }
      const outcome = await rpc.request("session/prompt", {
        sessionId: session.sessionId,
        prompt: [{ type: "text", text: "Reply with the single word OK." }],
      });
      if (providerError) result("FAILED", providerError);
      else if (/FreeTierError|only be used from within OpenCode|RegionError|^error:/i.test(replyText.trim())) {
        result("FAILED", reasonFor(replyText));
      } else if (replyText.trim() && outcome?.stopReason !== "cancelled") {
        result("PASS", "REAL_ACP_FREE_MODEL_REPLY_RECEIVED");
      } else {
        result("FAILED", "NO_ACP_REPLY");
      }
    }
  } catch (err) {
    result("FAILED", reasonFor(err));
  } finally {
    clearTimeout(timeout);
    rpc.failPending(new Error("smoke ended"));
    try { child.kill("SIGTERM"); } catch {}
  }
}
