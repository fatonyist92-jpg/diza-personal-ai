// Verify non-Whisper Indonesian Zipformer2 real audio-to-text locally.
// Only these fixed synthetic phrases are tested; no user speech logged.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const ROOT = "/home/node/.bloks";
const REPORT = join(ROOT, "zipformer-id-greedy-beam-ab-v1.json");
const MAX_AGE = 12 * 60 * 60 * 1000;
async function once(bin, args, input, timeout, extraEnv = {}) {
  return await new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: "/home/node",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, STT_SYNTHETIC_TEST: "1", HF_HUB_OFFLINE: "1", OMP_NUM_THREADS: "2", OPENBLAS_NUM_THREADS: "2", ...extraEnv },
    });
    let chunks = [];
    let diagnostic = "";
    let size = 0;
    let failed = false;
    let done = false;
    const finish = (exit) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok: exit === 0 && !failed, bytes: Buffer.concat(chunks), diagnostic });
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
    child.stderr.on("data", (buf) => { diagnostic = (diagnostic + buf.toString()).slice(-1024); });
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
  console.log("LOCAL_ZIPFORMER_STT_TEST=" + recent.status + " (cached)");
  console.log("LOCAL_ZIPFORMER_STT_REASON=" + recent.reason);
} else {
  console.log("LOCAL_ZIPFORMER_STT_TEST=checking");
  const tmp = await mkdtemp(join(tmpdir(), "bloks-stt-check-"));
  let status = "FAILED", reason = "LOCAL_STT_UNAVAILABLE";
  try {
    const cases = [
      { voice: "id-ID-GadisNeural", line: "Tes satu dua tiga.", expected: "tes satu dua tiga" },
      { voice: "id-ID-ArdiNeural", line: "Tes satu dua tiga.", expected: "tes satu dua tiga" },
      { voice: "id-ID-GadisNeural", line: "Halo Diza, saya sedang mencoba mikrofon.", expected: "halo diza saya sedang mencoba mikrofon" },
    ];
    const outcomes = {};
    for (const mode of ["greedy", "beam"]) {
      let passes = 0;
      const heardText = [];
      let failedAt = "";
      for (let i=0; i<cases.length; i++) {
        const item = cases[i];
        const audio = await once("/opt/diza-live/tts-venv/bin/python",
          ["/opt/diza-live/tts-neural.py", item.voice], item.line, 32_000);
        if (!audio.ok || audio.bytes.length < 500) {
          failedAt = "SYNTHETIC_VOICE_SOURCE_UNAVAILABLE";
          break;
        }
        const file = join(tmp, mode + "-test-" + i + ".mp3");
        await writeFile(file, audio.bytes, { mode: 0o600 });
        const words = await once("/opt/diza-live/stt-venv/bin/python",
          ["/opt/diza-live/stt-zipformer.py", file], null, 70_000,
          { ZIPFORMER_BEAM_TEST: mode === "beam" ? "1" : "0" });
        if (!words.ok) {
          failedAt = "ZIPFORMER_PROCESS_FAILED";
          break;
        }
        const heard = words.bytes.toString("utf8").toLowerCase()
          .normalize("NFKC").replace(/[^a-z0-9]+/g," ").trim();
        const normalized = heard.replace(/\b1\b/g,"satu").replace(/\b2\b/g,"dua")
          .replace(/\b3\b/g,"tiga").replace(/\btest\b/g,"tes")
          .replace(/\s+/g," ").trim();
        const pass = normalized.includes(item.expected);
        // Only fixed synthetic examples: no private speech/transcripts recorded.
        console.log("ZIPFORMER_AB_" + mode.toUpperCase() + "_CASE_" + i + "=" +
          (pass ? "PASS" : "FAIL") + " [" + heard.slice(0,95) + "]");
        heardText.push(heard);
        if (pass) passes++;
      }
      outcomes[mode] = { passes, failure: failedAt };
    }
    if (outcomes.beam.passes > outcomes.greedy.passes) {
      status = "PASS";
      reason = "BEAM_WINS_" + outcomes.beam.passes + "_VS_" + outcomes.greedy.passes;
    } else if (outcomes.beam.passes === outcomes.greedy.passes) {
      status = "UNDECIDED";
      reason = "TIE_" + outcomes.beam.passes + "_OF_3";
    } else {
      status = "PASS";
      reason = "GREEDY_WINS_" + outcomes.greedy.passes + "_VS_" + outcomes.beam.passes;
    }
  } catch {
    reason = "LOCAL_STT_SMOKE_ERROR";
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    await mkdir(ROOT, { recursive: true });
    await writeFile(REPORT, JSON.stringify({ status, reason, checkedAt: new Date().toISOString() }), { mode: 0o600 });
    console.log("LOCAL_ZIPFORMER_STT_TEST=" + status);
    console.log("LOCAL_ZIPFORMER_STT_REASON=" + reason);
  }
}
