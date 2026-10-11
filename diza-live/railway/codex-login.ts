/**
 * Codex ChatGPT device authorization for a headless Bloks Railway container.
 *
 * Route authorization is enforced by the existing Bloks server/index.ts
 * remote pairing guard AND the owner-only check immediately before calling
 * this module. No OpenAI API key or ChatGPT password is collected.
 */
import { spawn, execFile, type ChildProcessWithoutNullStreams } from "node:child_process";

type LoginState = "idle" | "starting" | "waiting" | "connected" | "error";
let login: {
  state: LoginState;
  code: string | null;
  expiresAt: number;
  problem: string | null;
  child: ChildProcessWithoutNullStreams | null;
  output: string;
  timer: ReturnType<typeof setTimeout> | null;
  codeTimer: ReturnType<typeof setTimeout> | null;
} = { state: "idle", code: null, expiresAt: 0, problem: null, child: null, output: "", timer: null, codeTimer: null };

const DEVICE_URL = "https://auth.openai.com/codex/device";
const MAX_AGE_MS = 15 * 60_000;
// OpenAI user codes can have unequal groups (e.g. XXXX-XXXXX), not only XXXX-XXXX.
const CODE_MARKER = "Enter this one-time code";
const CODE_RE = /\b([A-Z0-9]{3,8}(?:-[A-Z0-9]{3,8}){1,3})\b/;
const CODE_RESPONSE_TIMEOUT_MS = 75_000;

/** Only scan after Codex's explicit device-code prompt; never include stdout in the API. */
export function extractDeviceCode(output: string): string | null {
  const marker = output.indexOf(CODE_MARKER);
  if (marker < 0) return null;
  const after = output.slice(marker + CODE_MARKER.length);
  const candidate = after.match(CODE_RE)?.[1] ?? null;
  return candidate;
}

function redactedProblem(output: string): string {
  if (/not enabled|not supported|device.code.*disabled|404/i.test(output))
    return "Device code login mungkin belum diaktifkan di pengaturan keamanan akun ChatGPT.";
  if (/network|dns|connection|timeout|error sending request/i.test(output))
    return "Codex gagal terhubung ke server login OpenAI. Ulangi nanti.";
  return "Login Codex gagal. Silakan ulangi dengan kode baru.";
}

function stop() {
  if (login.timer) clearTimeout(login.timer);
  if (login.codeTimer) clearTimeout(login.codeTimer);
  login.timer = null;
  login.codeTimer = null;
  try { login.child?.kill("SIGTERM"); } catch {}
  login.child = null;
}

async function signedIn(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("codex", ["login", "status"],
      { timeout: 8_000, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) return resolve(false);
        resolve(/logged in/i.test(stdout + "\n" + stderr));
      });
  });
}

export async function codexLoginStatus() {
  const authenticated = await signedIn();
  if (authenticated) {
    if (login.state !== "connected") stop();
    login.state = "connected";
    login.code = null;
    login.problem = null;
  } else if ((login.state === "starting" || login.state === "waiting") &&
             Date.now() > login.expiresAt) {
    stop();
    login.state = "error";
    login.code = null;
    login.problem = "Kode login kedaluwarsa. Buat kode baru.";
  }
  return {
    installed: true,
    authenticated,
    state: authenticated ? "connected" : login.state,
    code: authenticated ? null : login.code,
    verifyUrl: login.code ? DEVICE_URL : null,
    expiresAt: login.code ? login.expiresAt : null,
    problem: authenticated ? null : login.problem,
  };
}

export async function codexLoginStart() {
  if (await signedIn()) return codexLoginStatus();
  if (login.child && Date.now() < login.expiresAt) return codexLoginStatus();

  stop();
  login = {
    state: "starting",
    code: null,
    expiresAt: Date.now() + MAX_AGE_MS,
    problem: null,
    child: null,
    output: "",
    timer: null,
    codeTimer: null,
  };

  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn("codex", ["login", "--device-auth"], {
      cwd: process.env.HOME || "/home/node",
      env: { ...process.env, OPENAI_API_KEY: "" },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
  } catch {
    login.state = "error";
    login.problem = "Codex CLI belum dapat dijalankan di server.";
    return codexLoginStatus();
  }
  login.child = child;
  child.stdin.end();
  login.timer = setTimeout(() => {
    if (login.child !== child) return;
    stop();
    login.state = "error";
    login.code = null;
    login.problem = "Batas login 15 menit habis. Mulai lagi.";
  }, MAX_AGE_MS + 5000);
  login.timer.unref?.();
  // Waiting indefinitely for a never-issued code looks like a broken button.
  // Fail clearly after a reasonable network window; the owner may retry.
  login.codeTimer = setTimeout(() => {
    if (login.child !== child || login.code) return;
    const tail = login.output;
    stop();
    login.state = "error";
    login.code = null;
    login.problem = /device code.*(not enabled|disabled)|request failed|forbidden|status 403|status 404/i.test(tail)
      ? "Autentikasi kode perangkat Codex ditolak OpenAI. Aktifkan device code authorization di pengaturan keamanan ChatGPT, lalu ulangi."
      : /network|dns|connection|timed out|connect|certificate/i.test(tail)
        ? "Codex gagal menghubungi layanan login OpenAI. Coba lagi setelah jaringan server stabil."
        : "Kode belum diterima dari OpenAI dalam 75 detik. Tekan Buat kode autentikasi untuk mencoba lagi.";
    login.output = "";
  }, CODE_RESPONSE_TIMEOUT_MS);
  login.codeTimer.unref?.();

  const collect = (buf: Buffer) => {
    if (login.child !== child) return;
    // ANSI styling changes presentation but not the device code.
    login.output = (login.output + buf.toString("utf8"))
      .replace(/\x1b\[[0-9;]*m/g, "").slice(-3500);
    // Parse only after Codex emits the one-time-code instruction.
    const code = extractDeviceCode(login.output);
    if (code) {
      login.code = code;
      login.state = "waiting";
      if (login.codeTimer) clearTimeout(login.codeTimer);
      login.codeTimer = null;
    }
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  child.on("error", () => {
    if (login.child !== child) return;
    stop();
    login.state = "error";
    login.problem = "Codex tidak bisa dimulai.";
  });
  child.on("close", (exitCode) => {
    if (login.child !== child) return;
    const recentOutput = login.output;
    stop();
    login.code = null;
    if (exitCode === 0) {
      // A fresh status request checks the actual credential on disk.
      login.state = "connected";
      login.problem = null;
    } else {
      login.state = "error";
      login.problem = redactedProblem(recentOutput);
    }
    // Never log or return the raw CLI stdout; it may contain auth details.
    login.output = "";
  });
  return codexLoginStatus();
}
