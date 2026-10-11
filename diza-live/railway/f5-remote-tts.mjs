/**
 * Optional GPU F5-TTS remote voice for the EXISTING Gadis Neural selection.
 * Never sends credentials to the browser and never silently switches to robot speech.
 * This interface works only when a legitimate externally reachable GPU inference
 * endpoint has been configured; Kaggle notebooks do not expose such an endpoint.
 */
import { Readable } from 'node:stream';

const TARGET_VOICE = 'id-ID-GadisNeural';
const MAX_WAV_BYTES = 9_000_000;
const MAX_SPEECH_CHARS = 2400;
let active = false;

export function f5RemoteVoiceSelected(voiceId) {
  return process.env.F5_REMOTE_TTS_ENABLED === '1' && voiceId === TARGET_VOICE;
}

function remoteConfig() {
  const raw = process.env.F5_REMOTE_TTS_URL?.trim();
  const token = process.env.F5_REMOTE_TTS_TOKEN?.trim();
  if (!raw || !token || token.length < 24) {
    throw new Error('Mesin suara F5 belum dikonfigurasi. Tidak diganti ke suara robot.');
  }
  let url;
  try { url = new URL(raw); } catch { throw new Error('Alamat server F5 tidak valid.'); }
  if (url.protocol !== 'https:' || url.username || url.password ||
      url.search || url.hash || url.pathname !== '/v1/tts') {
    throw new Error('Endpoint F5 wajib HTTPS /v1/tts tanpa kredensial di URL.');
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') ||
      host.endsWith('.local') || host === '127.0.0.1' ||
      host === '::1' || host === '[::1]' || host === '0.0.0.0' ||
      host.startsWith('10.') || host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^169\.254\./.test(host)) {
    throw new Error('Endpoint F5 harus alamat HTTPS publik yang sah.');
  }
  return { url: url.href, token };
}

/**
 * @returns {Promise<{stream: ReadableStream, mime: 'audio/wav'} | null>}
 */
export async function speakF5Remote(text, voiceId) {
  if (!f5RemoteVoiceSelected(voiceId)) return null;
  if (active) throw new Error('Mesin suara F5 sedang digunakan. Coba lagi.');
  const config = remoteConfig();
  const spoken = String(text ?? '').trim();
  if (!spoken || spoken.length > MAX_SPEECH_CHARS) {
    throw new Error('Jawaban terlalu panjang untuk satu permintaan suara F5.');
  }
  active = true;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 48_000);
  try {
    const response = await fetch(config.url, {
      method: 'POST',
      redirect: 'error',
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        authorization: 'Bearer ' + config.token,
        'content-type': 'application/json',
        accept: 'audio/wav',
      },
      body: JSON.stringify({ text: spoken, language: 'id', voice: 'female' }),
    });
    if (!response.ok || !response.body) {
      console.warn('F5_REMOTE_TTS=UPSTREAM_UNAVAILABLE_' + response.status);
      throw new Error('Server GPU F5 belum siap. Suara robot tidak diaktifkan.');
    }
    const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const declared = Number(response.headers.get('content-length') || 0);
    if (mime !== 'audio/wav' && mime !== 'audio/x-wav' && mime !== 'audio/wave') {
      throw new Error('Server F5 tidak mengirim audio WAV.');
    }
    if (!Number.isFinite(declared) || declared > MAX_WAV_BYTES) {
      throw new Error('Audio F5 melebihi batas.');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.byteLength;
        if (total > MAX_WAV_BYTES) throw new Error('Audio F5 melebihi batas.');
        chunks.push(Buffer.from(next.value));
      }
    } finally {
      reader.releaseLock();
    }
    const wav = Buffer.concat(chunks, total);
    if (wav.length < 1024 || wav.toString('ascii', 0, 4) !== 'RIFF' ||
        wav.toString('ascii', 8, 12) !== 'WAVE') {
      throw new Error('Audio F5 tidak valid.');
    }
    console.info('F5_REMOTE_TTS=WAV_OK');
    return {
      stream: Readable.toWeb(Readable.from([wav])),
      mime: 'audio/wav',
    };
  } catch (err) {
    console.warn('F5_REMOTE_TTS=NOT_READY_NO_ROBOT_FALLBACK');
    if (err?.name === 'AbortError') {
      throw new Error('GPU F5 belum menjawab dalam 48 detik.');
    }
    throw err;
  } finally {
    clearTimeout(deadline);
    controller.abort();
    active = false;
  }
}
