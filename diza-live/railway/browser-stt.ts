/**
 * Private Bloks browser STT via Gladia Solaria-1 (not Whisper).
 *
 * This provider is opt-in. No outbound audio or chargeable job is created
 * unless BOTH GLADIA_STT_ENABLED=1 and GLADIA_API_KEY are configured.
 * The owner must consent to sending recorded speech to Gladia.
 *
 * Receives at most 2.5 MB of audio from an already authenticated Bloks
 * session, uploads it to Gladia, polls a short-lived prerecorded job, then
 * attempts immediate deletion of the job and its attached audio.
 * Gladia's data handling remains subject to their service policy.
 */
import type { IncomingMessage } from "node:http";

const API = "https://api.gladia.io/v2";
const MAX_BYTES = 2_500_000;
const LIMIT_MS = 60_000;
const ALLOWED_AUDIO = /^(audio\/webm|audio\/mp4|audio\/ogg|audio\/wav|audio\/mpeg)(?:;.*)?$/i;
let active = false;
type Result = { status: number; body: { text?: string; error?: string } };

function result(status: number, error: string): Result {
  return { status, body: { error } };
}
function ready() {
  return process.env.GLADIA_STT_ENABLED === "1" &&
    Boolean(process.env.GLADIA_API_KEY?.trim());
}
async function apiCall(
  url: string,
  key: string,
  options: RequestInit,
  ms = 15_000,
): Promise<any> {
  // No caller-controlled host, no authenticated redirect to another origin.
  const parsed = new URL(url);
  if (parsed.origin !== "https://api.gladia.io") throw new Error("UNEXPECTED_PROVIDER_URL");
  const resp = await fetch(parsed, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(ms),
    headers: {
      "x-gladia-key": key,
      "Accept": "application/json",
      ...options.headers,
    },
  });
  if (!resp.ok) {
    // Never echo Gladia's raw response; it can include data or credentials.
    if (resp.status === 401 || resp.status === 403)
      throw new Error("GLADIA_KEY_REJECTED");
    if (resp.status === 402)
      throw new Error("GLADIA_CREDIT_EXHAUSTED");
    if (resp.status === 429)
      throw new Error("GLADIA_RATE_LIMITED");
    throw new Error("GLADIA_HTTP_" + resp.status);
  }
  return await resp.json();
}
function userError(err: unknown): string {
  const s = err instanceof Error ? err.message : String(err);
  if (s === "GLADIA_KEY_REJECTED")
    return "API key Gladia tidak valid atau aksesnya ditolak. Periksa pengaturan Railway.";
  if (s === "GLADIA_CREDIT_EXHAUSTED")
    return "Kredit gratis Gladia sudah habis. Rekaman tidak dikirim ulang.";
  if (s === "GLADIA_RATE_LIMITED")
    return "Batas Gladia tercapai. Coba lagi nanti.";
  if (s === "GLADIA_TIMED_OUT" || s.includes("TimeoutError") || s.includes("AbortError"))
    return "Gladia belum selesai memproses audio. Coba lagi nanti.";
  if (s === "GLADIA_NO_SPEECH")
    return "Tidak ada ucapan yang berhasil dikenali. Coba ulangi lebih jelas.";
  return "Layanan pengenalan suara Gladia sedang tidak tersedia. Coba lagi nanti.";
}
export async function transcribeBrowserAudio(req: IncomingMessage): Promise<Result> {
  // Check opt-in BEFORE reading the request body and BEFORE any vendor request.
  if (!ready()) {
    return result(503,
      "Whisper sudah dinonaktifkan. Hubungkan Gladia (kredit uji coba) dengan GLADIA_API_KEY dan GLADIA_STT_ENABLED=1 di Railway.");
  }
  const type = String(req.headers["content-type"] ?? "");
  if (!ALLOWED_AUDIO.test(type))
    return result(415, "Format audio browser tidak didukung.");
  const expected = Number(req.headers["content-length"] ?? 0);
  if (expected > MAX_BYTES)
    return result(413, "Audio terlalu besar. Maksimal 18 detik.");
  if (active)
    return result(429, "Pengenalan suara sedang memproses rekaman sebelumnya.");

  active = true;
  const key = process.env.GLADIA_API_KEY!.trim();
  let jobId: string | null = null;
  try {
    let bytes = 0;
    const chunks: Buffer[] = [];
    for await (const fragment of req) {
      const chunk = Buffer.isBuffer(fragment) ? fragment : Buffer.from(fragment);
      bytes += chunk.byteLength;
      if (bytes > MAX_BYTES)
        return result(413, "Rekaman melewati batas ukuran.");
      chunks.push(chunk);
    }
    if (bytes < 256)
      return result(400, "Audio terlalu pendek. Ulangi rekaman.");

    const form = new FormData();
    const mime = type.split(";")[0].toLowerCase();
    const extension = mime === "audio/mp4" ? "m4a" :
      mime === "audio/ogg" ? "ogg" : mime === "audio/wav" ? "wav" :
      mime === "audio/mpeg" ? "mp3" : "webm";
    form.append("audio",
      new Blob([Buffer.concat(chunks)], { type: mime }), "bloks-recording." + extension);
    const uploaded = await apiCall(API + "/upload", key, { method: "POST", body: form });
    if (typeof uploaded?.audio_url !== "string" ||
        !uploaded.audio_url.startsWith("https://"))
      throw new Error("GLADIA_BAD_UPLOAD");

    const started = await apiCall(API + "/pre-recorded", key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audio_url: uploaded.audio_url,
        model: "solaria-1",
        language_config: { languages: ["id"], code_switching: false },
        diarization: false,
      }),
    });
    if (typeof started?.id !== "string" ||
        !/^[a-zA-Z0-9_-]{6,128}$/.test(started.id))
      throw new Error("GLADIA_BAD_JOB");
    jobId = started.id;
    const deadline = Date.now() + LIMIT_MS;
    while (Date.now() < deadline) {
      const state = await apiCall(API + "/pre-recorded/" + jobId, key,
        { method: "GET" }, 12_000);
      if (state.status === "done") {
        const speech = state.result?.transcription?.full_transcript;
        if (typeof speech !== "string" || !speech.trim())
          throw new Error("GLADIA_NO_SPEECH");
        return { status: 200, body: { text: speech.trim().slice(0, 1800) } };
      }
      if (state.status === "error" || state.status === "failed")
        throw new Error("GLADIA_FAILED");
      await new Promise(resolve => setTimeout(resolve, 1_500));
    }
    throw new Error("GLADIA_TIMED_OUT");
  } catch (err) {
    return result(503, userError(err));
  } finally {
    if (jobId) {
      // Best effort. Provider retention/deletion is governed by Gladia.
      await apiCall(API + "/pre-recorded/" + jobId, key,
        { method: "DELETE" }, 4_000).catch(() => {});
    }
    active = false;
  }
}
