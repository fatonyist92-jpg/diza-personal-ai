/**
 * Opt-in Pocket Indonesian CPU client, STAGING ONLY. This file is deliberately
 * separate from locked Bloks / Railway code and does not auto-enable any voice.
 * It matches the existing remote TTS output shape: {stream, mime}.
 */
import { Readable } from 'node:stream';

const VOICE_ID = 'id-ID-GadisNeural';
const MAX_TEXT_CHARS = 1200;
const MAX_WAV_BYTES = 9_000_000;
let busy = false;

export function pocketCpuSelected(voiceId) {
  return process.env.POCKET_CPU_TTS_ENABLED === '1' && voiceId === VOICE_ID;
}

function config() {
  const urlString = process.env.POCKET_CPU_TTS_URL?.trim();
  const token = process.env.POCKET_CPU_TTS_TOKEN?.trim();
  if (!urlString || !token || token.length < 24)
    throw new Error('Pocket CPU belum memiliki endpoint dan token yang sah.');
  let url;
  try { url = new URL(urlString); } catch {
    throw new Error('Alamat Pocket CPU tidak valid.');
  }
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/v1/tts' || url.port)
    throw new Error('Pocket CPU harus menggunakan HTTPS /v1/tts yang aman.');
  const h = url.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') ||
      h.endsWith('.local') || h === '::1' || h === '[::1]' ||
      h === '0.0.0.0' || h === '127.0.0.1' ||
      h.startsWith('10.') || h.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      /^169\.254\./.test(h))
    throw new Error('Pocket CPU butuh hostname HTTPS publik yang sah.');
  return { url: url.href, token };
}

/**
 * Returns a streamable WAV for the pre-existing female voice selection.
 * @param {string} text
 * @param {string} voiceId
 * @param {{signal?:AbortSignal}} options Optional signal for hangup/barge-in.
 */
export async function speakPocketCpu(text, voiceId, options = {}) {
  if (!pocketCpuSelected(voiceId)) return null;
  if (busy) throw new Error('Mesin Pocket CPU masih berbicara.');
  const { url, token } = config();
  const normalized = String(text ?? '').trim();
  if (!normalized || normalized.length > MAX_TEXT_CHARS)
    throw new Error('Teks suara Pocket CPU kosong atau terlalu panjang.');
  if (options.signal?.aborted) throw new Error('Call dibatalkan.');

  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  const deadline = setTimeout(() => controller.abort(), 18000);
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });
  busy = true;
  try {
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
        accept: 'audio/wav',
      },
      body: JSON.stringify({ text: normalized, language: 'id', voice: 'female' }),
    });
    if (!response.ok || !response.body)
      throw new Error('Pocket CPU sedang tidak tersedia.');
    const mime = (response.headers.get('content-type') || '')
      .split(';')[0].trim().toLowerCase();
    if (!['audio/wav', 'audio/x-wav', 'audio/wave'].includes(mime))
      throw new Error('Pocket CPU tidak mengirim WAV.');

    const declared = response.headers.get('content-length');
    if (declared && (!Number.isSafeInteger(Number(declared)) ||
                     Number(declared) > MAX_WAV_BYTES))
      throw new Error('Audio Pocket CPU melewati batas keamanan.');

    let total = 0;
    const buffers = [];
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_WAV_BYTES)
          throw new Error('Audio Pocket CPU terlalu besar.');
        buffers.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
    if (controller.signal.aborted)
      throw new Error('Call dibatalkan.');
    const wav = Buffer.concat(buffers, total);
    if (wav.byteLength < 1024 || wav.toString('ascii', 0, 4) !== 'RIFF' ||
        wav.toString('ascii', 8, 12) !== 'WAVE')
      throw new Error('WAV dari Pocket CPU tidak valid.');
    return { stream: Readable.toWeb(Readable.from([wav])), mime: 'audio/wav' };
  } catch (e) {
    if (controller.signal.aborted)
      throw new Error('Call dibatalkan atau endpoint melewati batas waktu.');
    throw e;
  } finally {
    busy = false;
    clearTimeout(deadline);
    options.signal?.removeEventListener('abort', onExternalAbort);
    controller.abort();
  }
}
