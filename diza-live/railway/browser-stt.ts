// Local, authenticated speech-to-text handler. User audio is never stored
// persistently or shared with an external transcription provider.
import type { IncomingMessage } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MAX_BYTES = 2_500_000;
let transcribing = false;
const accepted = /^(audio\/webm|audio\/mp4|audio\/ogg|audio\/wav|audio\/mpeg)(?:;.*)?$/i;
export async function transcribeBrowserAudio(req: IncomingMessage): Promise<{
  status: number; body: { text?: string; error?: string };
}> {
  if (!accepted.test(String(req.headers["content-type"] ?? ""))) {
    return { status: 415, body: { error: "Format rekaman tidak didukung browser." } };
  }
  if (transcribing) {
    return { status: 429, body: { error: "Pengenalan suara sedang dipakai. Coba lagi beberapa detik." } };
  }
  const promisedSize = Number(req.headers["content-length"] || 0);
  if (promisedSize > MAX_BYTES) {
    return { status: 413, body: { error: "Rekaman terlalu panjang. Maksimal 20 detik." } };
  }
  transcribing = true;
  let temp: string | null = null;
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_BYTES) return { status: 413, body: { error: "Audio terlalu besar." } };
      chunks.push(bytes);
    }
    if (size < 256) return { status: 400, body: { error: "Belum ada audio yang dapat diproses." } };
    temp = await mkdtemp(join(tmpdir(), "bloks-voice-"));
    const file = join(temp, "speech.webm");
    await writeFile(file, Buffer.concat(chunks), { mode: 0o600 });
    const output = await new Promise<string>((resolve, reject) => {
      execFile(
        "/opt/diza-live/stt-venv/bin/python",
        ["/opt/diza-live/stt-whisper.py", file],
        {
          cwd: "/home/node",
          timeout: 45_000,
          maxBuffer: 16_384,
          env: {
            ...process.env,
            HF_HUB_OFFLINE: "1",
            HF_HUB_DISABLE_TELEMETRY: "1",
            OMP_NUM_THREADS: "2",
            OPENBLAS_NUM_THREADS: "2",
          },
        },
        (err, stdout) => err ? reject(err) : resolve(String(stdout ?? "").trim()),
      );
    });
    if (!output) return { status: 422, body: { error: "Belum terdengar kata-kata. Coba bicara lebih dekat ke mikrofon." } };
    return { status: 200, body: { text: output.slice(0, 1800) } };
  } catch {
    return { status: 503, body: { error: "Transkripsi lokal belum tersedia. Coba lagi sebentar." } };
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true }).catch(() => {});
    transcribing = false;
  }
}
