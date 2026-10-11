// One privacy-safe REAL local Indonesian speech-to-text test:
// produce a fixed synthetic Gadis Neural MP3, transcribe it entirely on
// Railway with Whisper tiny, and log only outcome codes, never audio/text.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const ROOT = "/home/node/.bloks";
const REPORT = join(ROOT, "local-whisper-stt-smoke.json");
const MAX_AGE = 12 * 60 * 60 * 1000;
async function once(bin, args, input, timeout) {
  return await new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: "/home/node",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, HF_HUB_OFFLINE: "1", OMP_NUM_THREADS: "2", OPENBLAS_NUM_THREADS: "2" },
    });
    let chunks = [];
    let size = 0;
    let failed = false;
    let done = false;
    const finish = (exit) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: exit === 0 && !failed, bytes: Buffer.concat(chunks) });
    };
    const timer = setTimeout(() => {
      failed = true;
      try { child.kill("SIGKILL"); } catch {}
      finish(null);
    }, timeout);
    timer.unref?.();
    child.stdout.on("data", (data) => {
      size += data.length;
      if (size > 2_500_000) {
        failed = true;
        try { child.kill("SIGKILL"); } catch {}
        return;
      }
      chunks.push(data);
    });
    child.stderr.resume();
    child.on("error", () => finish(null));
    child.on("close", finish);
    child.stdin.on("error", () => {});
    child.stdin.end(input || undefined);
  });
}
let recent;
try {
  const saved = JSON.parse(await readFile(REPORT, "utf8"));
  if (Date.now() - Date.parse(saved.checkedAt) < MAX_AGE) recent = saved;
} catch {}
if (recent) {
  console.log("LOCAL_WHISPER_STT_TEST=" + recent.status + " (cached)");
  console.log("LOCAL_WHISPER_STT_REASON=" + recent.reason);
} else {
  console.log("LOCAL_WHISPER_STT_TEST=checking");
  const tmp = await mkdtemp(join(tmpdir(), "bloks-stt-check-"));
  let status = "FAILED", reason = "LOCAL_STT_UNAVAILABLE";
  try {
    const audio = await once("/opt/diza-live/tts-venv/bin/python",
      ["/opt/diza-live/tts-neural.py", "id-ID-GadisNeural"],
      "Halo Diza, coba dengarkan ucapan bahasa Indonesia ini.", 32_000);
    if (!audio.ok || audio.bytes.length < 500) {
      reason = "SYNTHETIC_VOICE_SOURCE_UNAVAILABLE";
    } else {
      const path = join(tmp, "test.mp3");
      await writeFile(path, audio.bytes, { mode: 0o600 });
      const words = await once("/opt/diza-live/stt-venv/bin/python",
        ["/opt/diza-live/stt-whisper.py", path], null, 70_000);
      if (!words.ok) reason = "LOCAL_WHISPER_PROCESS_FAILED";
      else if (/\b(halo|diza|coba|dengarkan)\b/i.test(words.bytes.toString("utf8"))) {
        status = "PASS";
        reason = "REAL_LOCAL_INDONESIAN_AUDIO_TRANSCRIBED";
      } else reason = "NO_RECOGNIZABLE_INDONESIAN_TRANSCRIPT";
    }
  } catch {
    reason = "LOCAL_STT_SMOKE_ERROR";
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    await mkdir(ROOT, { recursive: true });
    await writeFile(REPORT, JSON.stringify({ status, reason, checkedAt: new Date().toISOString() }), { mode: 0o600 });
    console.log("LOCAL_WHISPER_STT_TEST=" + status);
    console.log("LOCAL_WHISPER_STT_REASON=" + reason);
  }
}
