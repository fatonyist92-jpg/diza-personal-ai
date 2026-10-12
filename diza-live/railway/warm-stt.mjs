/**
 * Private warm Zipformer transcriber. Reuses one local Python/ONNX process
 * between turns so each request doesn't import numpy/sherpa and reload ONNX.
 * Never runs an HTTP listener, persists audio, uses vendor keys or logs text.
 * Existing one-shot Python remains the safe fallback if this worker is down.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

let worker = null;
let ready = null;
let resolveReady = null;
let rejectReady = null;
let current = null;
let timer = null;
let sequence = 0;

function reset(reason) {
  clearTimeout(timer);
  if (current) {
    current.reject(new Error(reason));
    current = null;
  }
  if (rejectReady) {
    rejectReady(new Error(reason));
    rejectReady = null;
    resolveReady = null;
  }
  if (worker) {
    const old = worker;
    worker = null;
    try { old.kill(); } catch {}
  }
  ready = null;
}

function launch() {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const child = spawn(
    "/opt/diza-live/stt-venv/bin/python",
    ["/opt/diza-live/warm-zipformer.py"],
    {
      cwd: "/home/node",
      stdio: ["pipe", "pipe", "ignore"],
      env: {
        ...process.env,
        HF_HUB_OFFLINE: "1",
        HF_HUB_DISABLE_TELEMETRY: "1",
        OMP_NUM_THREADS: "2",
        OPENBLAS_NUM_THREADS: "2",
      },
    },
  );
  worker = child;
  const bootTimeout = setTimeout(() => reset("warm STT startup timeout"), 25_000);
  createInterface({ input: child.stdout }).on("line", (line) => {
    let data;
    try { data = JSON.parse(line); } catch { reset("invalid warm STT reply"); return; }
    if (data.ready === true && resolveReady) {
      clearTimeout(bootTimeout);
      const ok = resolveReady;
      resolveReady = null; rejectReady = null;
      ok();
      return;
    }
    if (!current || data.id !== current.id) return;
    clearTimeout(timer);
    const pending = current; current = null;
    if (typeof data.text === "string") pending.resolve(data.text.trim());
    else pending.reject(new Error("warm STT inference failed"));
  });
  child.once("error", () => {
    clearTimeout(bootTimeout);
    reset("warm STT process unavailable");
  });
  child.once("exit", () => {
    clearTimeout(bootTimeout);
    if (worker === child) reset("warm STT exited");
  });
  return ready;
}

export async function warmUpZipformer() {
  return launch();
}

export async function transcribeWarmZipformer(file) {
  await launch();
  if (!worker || !worker.stdin.writable) throw new Error("warm STT offline");
  if (current) throw new Error("warm STT busy");
  const id = ++sequence;
  return await new Promise((resolve,reject) => {
    current = { id, resolve, reject };
    timer = setTimeout(() => reset("warm STT request timeout"), 25_000);
    worker.stdin.write(JSON.stringify({ id, path: file }) + "\n", (err) => {
      if (err && current?.id === id) reset("warm STT pipe failed");
    });
  });
}
