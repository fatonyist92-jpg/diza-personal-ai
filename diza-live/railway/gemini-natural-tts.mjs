/**
 * Optional high-fidelity Indonesian voice for the existing Gadis Neural slot.
 * No text, audio or API key is logged/stored; all Google traffic stays server-side.
 * Returns null on a bounded failure so the existing Edge Neural path still works.
 */
const TTS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TTS_MODEL = 'gemini-3.8-flash-tts';
const TARGET_VOICE = 'id-ID-GadisNeural';
const MAX_AUDIO_BYTES = 11_000_000;
const DAILY_LIMIT = 80;
const dateUTC = () => new Date().toISOString().slice(0, 10);
let countDate = dateUTC();
let attemptsToday = 0;
let inFlight = 0;

function isWav(buffer) {
  return buffer.length >= 44 && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WAVE';
}

export function geminiTtsAvailable(voiceId) {
  return process.env.GEMINI_TTS_ENABLED === '1' && voiceId === TARGET_VOICE;
}

/** Shared conservative quota and concurrency ceiling for streaming and unary TTS. */
export function reserveGeminiTtsRequest() {
  if (dateUTC() !== countDate) { countDate = dateUTC(); attemptsToday = 0; }
  if (attemptsToday >= DAILY_LIMIT || inFlight >= 2) {
    console.warn('GEMINI_TTS=FALLBACK_LOCAL_LIMIT');
    return null;
  }
  attemptsToday++;
  inFlight++;
  let released = false;
  return () => {
    if (!released) { released = true; inFlight = Math.max(0, inFlight - 1); }
  };
}

/** @returns {Promise<{audio: Buffer, mime: 'audio/wav'} | null>} */
export async function generateGeminiNaturalVoice(text, voiceId) {
  if (!geminiTtsAvailable(voiceId)) return null;
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    console.warn('GEMINI_TTS=FALLBACK_MISSING_KEY');
    return null;
  }
  const release = reserveGeminiTtsRequest();
  if (!release) return null;
  try {
    const response = await fetch(TTS_ENDPOINT, {
      method: 'POST', redirect: 'error', cache: 'no-store',
      signal: AbortSignal.timeout(24_000),
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        model: TTS_MODEL,
        input: [{ type: 'user_input', content: [{
          type: 'text',
          text,
          annotations: [{ type: 'speech_metadata', style: 'casual, warm, natural Indonesian conversation' }],
        }] }],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice: 'Aoede' }] },
      }),
    });
    if (!response.ok) {
      console.warn('GEMINI_TTS=FALLBACK_HTTP_' + response.status);
      return null;
    }
    // Do not accept a multi-megabyte JSON response larger than the voice budget.
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > 16_000_000) throw Error('response_too_large');
    const raw = await response.text();
    if (raw.length > 16_000_000) throw Error('response_too_large');
    const parsed = JSON.parse(raw);
    const blocks = Array.isArray(parsed.steps)
      ? parsed.steps.filter(step => step?.type === 'model_output')
        .flatMap(step => Array.isArray(step.content) ? step.content : []) : [];
    const encoded = [...blocks].reverse().find(block =>
      block?.type === 'audio' && typeof block.data === 'string')?.data;
    if (!encoded || encoded.length > 16_000_000) throw Error('audio_missing');
    const audio = Buffer.from(encoded, 'base64');
    if (audio.length > MAX_AUDIO_BYTES || !isWav(audio)) throw Error('invalid_wav');
    console.info('GEMINI_TTS=GENERATED_WAV');
    return { audio, mime: 'audio/wav' };
  } catch {
    console.warn('GEMINI_TTS=FALLBACK_UPSTREAM_ERROR');
    return null;
  } finally {
    release();
  }
}
