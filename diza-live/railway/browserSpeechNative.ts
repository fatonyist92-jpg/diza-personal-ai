/**
 * Browser-native Indonesian speech recognition (Web Speech API).
 *
 * Zero Gemini API calls, quota or keys. Availability and accuracy depend on
 * Chrome's underlying speech service; Chrome may process audio remotely.
 * All existing private Railway Zipformer/MediaRecorder code remains intact.
 *
 * End each session exactly once; avoid the Android "aborted" event on
 * successful results / intended hangup. No transcripts are logged.
 */
export type NativeSpeechCallbacks = {
  onFinal: (text: string) => void;
  onSilence: () => void;
  onError: (message: string) => void;
  onFallback: () => void;
};
export type NativeSpeechSession = { stop(): void; cancel(): void };

type Result = { isFinal: boolean; [index: number]: { transcript: string } };
type ResultEvent = { results: ArrayLike<Result> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: null | ((event: ResultEvent) => void);
  onerror: null | ((event: { error?: string }) => void);
  onend: null | (() => void);
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => Recognition;

export function startNativeIndonesianSpeech(
  handlers: NativeSpeechCallbacks,
  host: any = typeof window !== 'undefined' ? window : undefined,
): NativeSpeechSession | null {
  const Recognizer: RecognitionCtor | undefined =
    host?.SpeechRecognition ?? host?.webkitSpeechRecognition;
  if (!Recognizer) return null;

  let recognition: Recognition;
  try { recognition = new Recognizer(); } catch { return null; }

  recognition.lang = 'id-ID';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 2;

  let disposed = false;
  let complete = false;
  let reportedWords = '';
  let pendingError: string | null = null;
  let fallback = false;
  let intentionalStop = false;

  const end = () => {
    if (disposed || complete) return;
    complete = true;
    if (fallback) {
      handlers.onFallback();
      return;
    }
    if (reportedWords) handlers.onFinal(reportedWords);
    else if (pendingError) handlers.onError(pendingError);
    else handlers.onSilence();
  };

  recognition.onresult = (event) => {
    if (disposed || complete) return;
    const phrases: string[] = [];
    let hasFinal = false;
    for (let i = 0; i < event.results.length; i++) {
      const result = event.results[i];
      const candidate = String(result?.[0]?.transcript ?? '').trim();
      if (candidate) phrases.push(candidate);
      if (result?.isFinal) hasFinal = true;
    }
    const words = phrases.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1800);
    if (words) reportedWords = words;
    if (hasFinal && reportedWords) {
      complete = true;
      handlers.onFinal(reportedWords);
      intentionalStop = true;
      try { recognition.stop(); } catch {}
    }
  };
  recognition.onerror = (event) => {
    if (disposed || complete || intentionalStop) return;
    const code = String(event?.error ?? 'unknown');
    if (code === 'network' || code === 'service-not-allowed' ||
        code === 'language-not-supported' || code === 'aborted') {
      fallback = true;
      try { recognition.abort(); } catch {}
      return;
    }
    if (code === 'not-allowed') {
      pendingError = 'Izin mikrofon diblokir. Izinkan mikrofon untuk Bloks di Chrome.';
    } else if (code === 'no-speech') {
      pendingError = null;
    } else {
      fallback = true;
      try { recognition.abort(); } catch {}
    }
  };
  recognition.onend = end;

  try {
    // Must be called synchronously from the user gesture (Call/record tap).
    recognition.start();
  } catch {
    try { recognition.abort(); } catch {}
    return null; // fallback to existing MediaRecorder and Zipformer
  }

  return {
    stop() {
      if (disposed || complete) return;
      intentionalStop = true;
      try { recognition.stop(); } catch { end(); }
      // onend delivers any useful partial words.
    },
    cancel() {
      if (disposed) return;
      disposed = true;
      complete = true;
      intentionalStop = true;
      try { recognition.abort(); } catch {}
    },
  };
}
