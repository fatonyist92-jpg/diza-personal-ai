// Local, authenticated speech-to-text handler. User audio is never stored
// persistently or shared with an external transcription provider.
import type { IncomingMessage } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { transcribeWarmZipformer } from "./warm-stt.mjs";


/**
 * The optional Gemini STT path uses Google's dedicated gemini-3.5-transcribe
 * Interactions API with inline audio (<20 MB). No permanent Google Files
 * uploads and no credentials ever reach the browser.
 *
 * This path is deliberately opt-in: until GEMINI_STT_ENABLED=1 and
 * GEMINI_API_KEY are both present, existing local Zipformer stays active.
 * Audio leaves Railway and enters Google's API only after opt-in.
 */
function geminiSelected(): boolean {
  return process.env.GEMINI_STT_ENABLED === "1";
}
function geminiError(status: number): { status: number; body: { error: string } } {
  if (status === 401 || status === 403)
    return { status: 503, body: { error: "API key Gemini tidak valid atau akses model ditolak. Periksa Gemini API key di Railway." } };
  if (status === 429 || status === 402)
    return { status: 429, body: { error: "Kuota Gemini API habis atau sedang dibatasi. Periksa Google AI Studio." } };
  if (status === 404)
    return { status: 503, body: { error: "Model Gemini 3.5 Transcribe belum tersedia untuk API key ini." } };
  if (status === 400 || status === 415)
    return { status: 502, body: { error: "Gemini tidak dapat memproses format rekaman ini." } };
  return { status: 502, body: { error: "Gemini API sedang gagal. Coba lagi sebentar." } };
}

async function transcribeWithGemini(
  audio: Buffer,
  contentType: string,
): Promise<{ status: number; body: { text?: string; error?: string } }> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return { status: 503, body: {
    error: "Gemini STT dipilih, tetapi GEMINI_API_KEY belum terpasang di Railway. Jangan masukkan key di chat.",
  } };
  const mime = contentType.split(";")[0].toLowerCase();
  // Google Interactions supports WebM and MPEG/OGG/WAV input. The browser
  // normally emits audio/webm; codecs are deliberately removed from MIME.
  const audioMime = mime === "audio/mp4" ? "audio/m4a" :
    mime === "audio/mpeg" ? "audio/mpeg" : mime;
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(35_000),
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        model: "gemini-3.5-transcribe",
        input: [{
          type: "audio",
          data: audio.toString("base64"),
          mime_type: audioMime,
        }],
        generation_config: {
          transcription_config: {
            language_codes: ["id-ID"],
            custom_vocabulary: ["DIZA", "Bloks"],
            mode: { type: "verbatim" },
          },
        },
      }),
    });
    if (!response.ok) return geminiError(response.status);
    const data = await response.json() as {
      output_text?: unknown;
      steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: unknown }> }>;
      status?: string;
    };
    // REST returns steps, unlike SDK's convenient .output_text property.
    const blocks = Array.isArray(data.steps)
      ? data.steps.filter(step => step.type === "model_output")
        .flatMap(step => Array.isArray(step.content)
          ? step.content.filter(item => item.type === "text" && typeof item.text === "string")
            .map(item => String(item.text)) : [])
      : [];
    const transcript = (blocks.join(" ").trim()
      || (typeof data.output_text === "string" ? data.output_text.trim() : "")).slice(0, 1800);
    if (!transcript) return { status: 422, body: {
      error: "Gemini belum menghasilkan teks dari rekaman ini. Coba ulang dengan ucapan lebih jelas.",
    } };
    return { status: 200, body: { text: transcript } };
  } catch {
    // No raw Google responses, recordings, prompts, or API keys in logs.
    return { status: 503, body: { error: "Koneksi Gemini terputus atau terlalu lama. Coba lagi." } };
  }
}

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
    // Keep working local STT until user explicitly connects the Google API.
    if (geminiSelected()) {
      return await transcribeWithGemini(Buffer.concat(chunks), String(req.headers["content-type"] ?? ""));
    }
    temp = await mkdtemp(join(tmpdir(), "bloks-voice-"));
    const file = join(temp, "speech.webm");
    await writeFile(file, Buffer.concat(chunks), { mode: 0o600 });
    // Warm model stays in RAM between Call turns (~1.3s saved per fixed
    // synthetic benchmark). If unavailable, preserve the old verified
    // one-shot transcriber without changing the endpoint or user audio.
    const output = await transcribeWarmZipformer(file).catch(() =>
      new Promise<string>((resolve, reject) => {
        execFile(
          "/opt/diza-live/stt-venv/bin/python",
          ["/opt/diza-live/stt-zipformer.py", file],
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
      }),
    );
    if (!output) return { status: 422, body: { error: "Belum terdengar kata-kata. Coba bicara lebih dekat ke mikrofon." } };
    return { status: 200, body: { text: output.slice(0, 1800) } };
  } catch {
    return { status: 503, body: { error: "Transkripsi lokal belum tersedia. Coba lagi sebentar." } };
  } finally {
    if (temp) await rm(temp, { recursive: true, force: true }).catch(() => {});
    transcribing = false;
  }
}
