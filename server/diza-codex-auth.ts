// Browser-friendly Codex device login for DIZA hosted mode.
//
// The official Codex CLI owns the ChatGPT authentication flow and writes
// its own credential under CODEX_HOME/~/.codex. DIZA only starts the
// process and relays the human-readable URL/code; it never reads auth.json.
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export type CodexDeviceAuthState = {
  status: "idle" | "running" | "success" | "error";
  output: string;
  url?: string;
  code?: string;
  startedAt?: number;
  finishedAt?: number;
};

let child: ChildProcessWithoutNullStreams | null = null;
let state: CodexDeviceAuthState = { status: "idle", output: "" };
let successConsumed = false;
let timeout: ReturnType<typeof setTimeout> | null = null;

const MAX_OUTPUT = 16_000;

function clean(text: string): string {
  return text
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
    .replace(/\b(sk|ck|ak|gsk|xai)[-_][A-Za-z0-9_-]{12,}/g, "[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted]");
}

function derive(current: CodexDeviceAuthState): CodexDeviceAuthState {
  const output = clean(current.output).slice(-MAX_OUTPUT);
  const urls = output.match(/https?:\/\/[^\s<>"')]+/g) ?? [];
  const url = urls.find((candidate) => {
    try {
      const parsed = new URL(candidate);
      const host = parsed.hostname.toLowerCase();
      const trusted =
        host === "openai.com" ||
        host.endsWith(".openai.com") ||
        host === "chatgpt.com" ||
        host.endsWith(".chatgpt.com");
      return trusted && /device|auth/i.test(parsed.pathname + parsed.search);
    } catch {
      return false;
    }
  });
  const code = output.match(/\b[A-Z0-9]{4}(?:-[A-Z0-9]{4}){1,3}\b/)?.[0];
  return { ...current, output, ...(url ? { url } : {}), ...(code ? { code } : {}) };
}

function append(chunk: Buffer | string) {
  state = derive({ ...state, output: state.output + String(chunk) });
}

export function codexDeviceAuthStatus(): CodexDeviceAuthState {
  return derive({ ...state });
}

export function startCodexDeviceAuth(): CodexDeviceAuthState {
  if (child && state.status === "running") return codexDeviceAuthStatus();

  successConsumed = false;
  state = { status: "running", output: "", startedAt: Date.now() };
  const env = { ...process.env };
  // A shell API key must never silently turn this ChatGPT-plan login into
  // pay-as-you-go API authentication.
  delete env.OPENAI_API_KEY;

  child = spawn("codex", ["login", "--device-auth"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  child.on("error", (error) => {
    append(error.message);
    state = derive({ ...state, status: "error", finishedAt: Date.now() });
    child = null;
  });
  child.on("close", (code) => {
    if (state.status !== "running") return;
    state = derive({
      ...state,
      status: code === 0 ? "success" : "error",
      finishedAt: Date.now(),
    });
    child = null;
    if (timeout) clearTimeout(timeout);
    timeout = null;
  });

  if (timeout) clearTimeout(timeout);
  timeout = setTimeout(() => {
    if (!child || state.status !== "running") return;
    child.kill("SIGTERM");
    append("\nDevice login timed out. Start it again.");
    state = derive({ ...state, status: "error", finishedAt: Date.now() });
    child = null;
  }, 10 * 60_000);
  timeout.unref?.();

  return codexDeviceAuthStatus();
}

export function cancelCodexDeviceAuth(): CodexDeviceAuthState {
  if (child) child.kill("SIGTERM");
  child = null;
  if (timeout) clearTimeout(timeout);
  timeout = null;
  if (state.status === "running") {
    state = derive({ ...state, status: "error", output: state.output + "\nLogin cancelled.", finishedAt: Date.now() });
  }
  return codexDeviceAuthStatus();
}

/** True once after a successful login, so the provider registry refreshes. */
export function consumeCodexDeviceAuthSuccess(): boolean {
  if (state.status !== "success" || successConsumed) return false;
  successConsumed = true;
  return true;
}
