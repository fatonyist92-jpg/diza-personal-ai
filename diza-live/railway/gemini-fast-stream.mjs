/**
 * Experimental server-only Gemini 3.8 Flash TTS streaming.
 * The browser receives PCM through the existing authenticated /speak route.
 * Raw text, tokens and Google responses are never logged or retained.
 */
import { geminiTtsAvailable, reserveGeminiTtsRequest } from './gemini-natural-tts.mjs';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MAX_AUDIO_BYTES = 11_000_000;
const MAX_EVENT_CHARS = 5_000_000;

export function geminiFastStreamEnabled(voiceId) {
  return process.env.GEMINI_TTS_STREAM_ENABLED === '1' && geminiTtsAvailable(voiceId);
}
export async function streamGeminiNaturalVoice(text, voiceId) {
  if (!geminiFastStreamEnabled(voiceId)) return null;
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const release = reserveGeminiTtsRequest();
  if (!release) return null;
  const abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 38_000);
  let released = false;
  const cleanup = () => {
    if (released) return;
    released = true;
    clearTimeout(timeout);
    release();
  };
  let reader;
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST', redirect: 'error', cache: 'no-store',
      signal: abort.signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        model: 'gemini-3.8-flash-tts',
        input: [{ type: 'user_input', content: [{
          type: 'text', text,
          annotations: [{ type: 'speech_metadata', style: 'casual, warm, natural Indonesian conversation' }],
        }] }],
        response_format: { type: 'audio', mime_type: 'audio/l16', sample_rate: 24000 },
        generation_config: { speech_config: [{ voice: 'Aoede' }] },
        stream: true,
      }),
    });
    if (!response.ok || !response.body) {
      console.warn('GEMINI_TTS_STREAM=FALLBACK_HTTP_' + response.status);
      cleanup();
      return null;
    }
    reader = response.body.getReader();
    let raw = '';
    let audioBytes = 0;
    let gotAudio = false;
    let done = false;
    const decoder = new TextDecoder();
    function takeAudio() {
      const end = raw.indexOf('\n\n');
      if (end < 0) return null;
      const event = raw.slice(0, end);
      raw = raw.slice(end + 2);
      const data = event.split('\n')
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trimStart()).join('\n');
      if (!data || data === '[DONE]') return Buffer.alloc(0);
      let json;
      try { json = JSON.parse(data); } catch { return Buffer.alloc(0); }
      const item = json.event_type === 'step.delta' && json.delta?.type === 'audio'
        ? json.delta
        : null;
      if (!item || typeof item.data !== 'string') return Buffer.alloc(0);
      const pcm = Buffer.from(item.data, 'base64');
      if (pcm.length % 2 !== 0) throw Error('invalid PCM alignment');
      audioBytes += pcm.length;
      if (audioBytes > MAX_AUDIO_BYTES) throw Error('PCM size exceeded');
      gotAudio ||= pcm.length > 0;
      return pcm;
    }
    const audio = new ReadableStream({
      async pull(controller) {
        if (done) { controller.close(); return; }
        try {
          while (true) {
            const chunk = takeAudio();
            if (chunk !== null) {
              if (chunk.length) { controller.enqueue(chunk); return; }
              continue;
            }
            if (raw.length > MAX_EVENT_CHARS) throw Error('oversized streaming event');
            const next = await reader.read();
            if (next.done) {
              done = true; cleanup();
              if (!gotAudio) throw Error('provider returned no audio');
              controller.close();
              return;
            }
            raw += decoder.decode(next.value, { stream: true }).replace(/\r\n/g, '\n');
          }
        } catch {
          done = true; abort.abort(); cleanup();
          controller.error(new Error('Neural streaming audio interrupted'));
        }
      },
      cancel() { done = true; abort.abort(); void reader.cancel().catch(() => {}); cleanup(); },
    });
    return { stream: audio, mime: 'audio/l16;rate=24000;channels=1' };
  } catch {
    cleanup();
    console.warn('GEMINI_TTS_STREAM=FALLBACK_CONNECTION');
    return null;
  }
}
