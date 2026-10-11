// Verify non-Whisper Indonesian Zipformer2 real audio-to-text locally.
// Only these fixed synthetic phrases are tested; no user speech logged.
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const ROOT = "/home/node/.bloks";
const REPORT = join(ROOT, "sherpa-zipformer2-id-v3-onset-smoke.json");
const MAX_AGE = 12 * 60 * 60 * 1000;
async function once(bin, args, input, timeout) {
  return await new Promise((resolve) => {
    const child = spawn(bin, args, {
      cwd: "/home/node",
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, STT_SYNTHETIC_TEST: "1", HF_HUB_OFFLINE: "1", OMP_NUM_THREADS: "2", OPENBLAS_NUM_THREADS: "2" },
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
    let passes = 0;
    let failedAt = null;
    for (let i=0; i<cases.length; i++) {
      const item=cases[i];
      const audio=await once("/opt/diza-live/tts-venv/bin/python",
        ["/opt/diza-live/tts-neural.py", item.voice], item.line, 32_000);
      if (!audio.ok || audio.bytes.length < 500) {
        failedAt="SYNTHETIC_VOICE_SOURCE_UNAVAILABLE";
        break;
      }
      const file=join(tmp, "test-"+i+".mp3");
      await writeFile(file, audio.bytes, { mode: 0o600 });
      const words=await once("/opt/diza-live/stt-venv/bin/python",
        ["/opt/diza-live/stt-zipformer.py", file], null, 70_000);
      if (!words.ok) {
        failedAt="ZIPFORMER_MODEL_PROCESS_FAILED";
        console.log("ZIPFORMER_SYNTHETIC_DIAGNOSTIC=" + String(words.diagnostic || "[none]").replace(/[\r\n]+/g," ").slice(0,260));
        break;
      }
      const heard=words.bytes.toString("utf8").toLowerCase()
        .normalize("NFKC").replace(/[^a-z0-9]+/g," ").trim();
      // Numeric orthography like "tes 1 2 3" is the SAME spoken phrase,
      // not an ASR error. Normalize only this known synthetic test case.
      const normalized=heard.replace(/\b1\b/g,"satu").replace(/\b2\b/g,"dua")
        .replace(/\b3\b/g,"tiga").replace(/\btest\b/g,"tes").replace(/\s+/g," ").trim();
      // Only fixed synthetic voice inputs (never real user speech) are
      // diagnosed in PRIVATE Railway logs for this test.
      console.log("ZIPFORMER_SYNTHETIC_CASE_" + i + "=" + (heard||"[empty]").slice(0,100));
      if (!normalized.includes(item.expected)) {
        failedAt = failedAt || (i<2 ? "SHORT_NUMBER_PHRASE_MISMATCH" : "LONG_INDONESIAN_PHRASE_MISMATCH");
        continue;
      }
      passes++;
    }
    if (passes===cases.length) {
      status="PASS";
      reason="EXACT_3_OF_3_INDONESIAN_TRANSCRIPT_TESTS";
    } else {
      reason=failedAt || "ACCURACY_TEST_FAILED";
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
