/**
 * Browser microphone capture using real MediaRecorder and authenticated
 * server STT (Gemini opt-in, local Zipformer fallback). Never use Chrome
 * SpeechRecognition. Privacy and key handling are enforced server-side.
 *
 * Audio leaves the browser only for this same-origin, paired Bloks server.
 */
import { startNativeIndonesianSpeech } from "./browserSpeechNative";

type Hooks = {
  onFinal: (text: string) => void;
  onSilence: () => void;
  onError: (message: string) => void;
  onProcessing?: () => void;
};
export interface BrowserMicSession {
  stop(): void;
  cancel(): void;
}

const MAX_MS = 18_000;
// Don't shorten user speech to chase latency. Keep natural inter-word pauses.
const SPEECH_SILENCE_MS = 1_050;
const START_SILENCE_MS = 10_000;
// Android mics may be quieter than laptop/desktop; 0.017 filtered real
// conversation as silence, while a single transient could trigger too early.
const SPEECH_RMS_THRESHOLD = 0.009;
const MIN_SPEECH_FRAMES = 2;

/** Conservative, non-recording local VAD. This only detects WHEN to finish.
 * Speech content is never stored here or logged. */
export function createMicrophoneActivityDetector() {
  let consecutive = 0;
  let heard = false;
  let lastVoice = 0;
  return {
    update(rms: number, now: number) {
      if (Number.isFinite(rms) && rms >= SPEECH_RMS_THRESHOLD) {
        consecutive++;
        if (consecutive >= MIN_SPEECH_FRAMES) {
          heard = true;
          lastVoice = now;
        }
      } else {
        consecutive = 0;
      }
      return { heardSpeech: heard, lastLoud: lastVoice };
    },
  };
}

function description(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return "Izin mikrofon belum diberikan. Buka pengaturan situs Chrome, lalu izinkan Mikrofon untuk Bloks.";
  }
  if (name === "NotFoundError") return "Tidak ada mikrofon yang terdeteksi di perangkat.";
  if (name === "NotReadableError") return "Mikrofon sedang dipakai aplikasi lain. Tutup perekam lain lalu coba.";
  return error instanceof Error && error.message ? error.message : "Perekaman suara gagal. Coba lagi.";
}
/** Android Chrome/WebView can expose SpeechRecognition but never emit a result,
 * error, or end event. In that case no audio reaches /api/bloks-stt/transcribe.
 * Use direct microphone capture on Android; leave optional native Web Speech
 * available elsewhere without modifying UI, agent, or production secrets.
 */
export function useDirectAndroidRecorder(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}

export async function startBrowserMic(hooks: Hooks, autoStop: boolean): Promise<BrowserMicSession> {
  // Direct getUserMedia + MediaRecorder always sends actual bytes to the
  // authenticated Railway Zipformer STT endpoint, even when Chrome's own
  // speech service hangs forever. No Gemini, Google key, or Whisper involved.
  if (useDirectAndroidRecorder(typeof navigator === "undefined" ? "" : navigator.userAgent ?? "")) {
    return startRecordedBrowserMic(hooks, autoStop);
  }
  let cancelled = false;
  let recorderFallback: BrowserMicSession | null = null;
  const native = startNativeIndonesianSpeech({
    onFinal: hooks.onFinal,
    onSilence: hooks.onSilence,
    onError: hooks.onError,
    onFallback: () => {
      if (cancelled) return;
      // Chrome speech backend unavailable. Automatically use offline
      // Indonesian Zipformer, never Gemini, without changing the UI.
      void startRecordedBrowserMic(hooks, autoStop).then(session => {
        if (cancelled) session.cancel();
        else recorderFallback = session;
      }).catch(err => {
        if (!cancelled) hooks.onError(description(err));
      });
    }
  });
  if (native) {
    return {
      stop() { recorderFallback?.stop(); native.stop(); },
      cancel() { cancelled = true; recorderFallback?.cancel(); native.cancel(); },
    };
  }
  return startRecordedBrowserMic(hooks, autoStop);
}

async function startRecordedBrowserMic(hooks: Hooks, autoStop: boolean): Promise<BrowserMicSession> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("Mikrofon browser membutuhkan HTTPS dan izin situs.");
  }
  if (typeof MediaRecorder === "undefined") {
    throw new Error("Browser tidak mendukung perekaman suara MediaRecorder.");
  }

  // This call explicitly requests Chrome microphone permission.
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
  } catch (error) {
    throw new Error(description(error));
  }

  let recorder: MediaRecorder;
  let audioContext: AudioContext | null = null;
  let frameTimer: ReturnType<typeof setInterval> | null = null;
  let ceilingTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let cancelled = false;
  let completed = false;
  let heardSpeech = false;
  let lastLoud = performance.now();
  let started = performance.now();
  const blobs: BlobPart[] = [];
  const controller = new AbortController();

  const dispose = () => {
    if (frameTimer) clearInterval(frameTimer);
    if (ceilingTimer) clearTimeout(ceilingTimer);
    frameTimer = null;
    ceilingTimer = null;
    stream.getTracks().forEach((track) => track.stop());
    if (audioContext) void audioContext.close().catch(() => {});
    audioContext = null;
  };
  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    closed = true;
    controller.abort();
    try { if (recorder.state !== "inactive") recorder.stop(); } catch {}
    dispose();
  };
  const finish = () => {
    if (closed || cancelled) return;
    closed = true;
    try {
      if (recorder.state !== "inactive") recorder.stop();
      else dispose();
    } catch {
      dispose();
    }
  };

  try {
    const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]
      .find((candidate) => MediaRecorder.isTypeSupported(candidate));
    recorder = new MediaRecorder(stream, {
      ...(type ? { mimeType: type } : {}),
      audioBitsPerSecond: 64_000,
    });
    recorder.ondataavailable = (event) => {
      if (event.data.size) blobs.push(event.data);
    };
    recorder.onerror = () => {
      if (cancelled || completed) return;
      completed = true;
      closed = true;
      dispose();
      hooks.onError("Chrome tidak bisa merekam audio. Coba lagi.");
    };
    recorder.onstop = () => {
      dispose();
      if (cancelled || completed) return;
      completed = true;
      const blob = new Blob(blobs, { type: recorder.mimeType || type || "audio/webm" });
      if (blob.size < 256) {
        hooks.onSilence();
        return;
      }
      hooks.onProcessing?.();
      void (async () => {
        try {
          const r = await fetch("/api/bloks-stt/transcribe", {
            method: "POST",
            headers: { "content-type": blob.type || "audio/webm" },
            body: blob,
            credentials: "same-origin",
            signal: controller.signal,
          });
          const data = await r.json() as { text?: string; error?: string };
          if (cancelled) return;
          // Zipformer 422 means no recognizable words, not a microphone
          // permission or network failure. Keep hands-free Call listening.
          if (r.status === 422) {
            hooks.onSilence();
            return;
          }
          if (!r.ok) throw new Error(data.error || "Gagal mengubah rekaman menjadi teks.");
          const text = (data.text ?? "").trim();
          if (text) hooks.onFinal(text);
          else hooks.onSilence();
        } catch (error) {
          if (cancelled) return;
          hooks.onError(description(error));
        }
      })();
    };
    recorder.start();
    started = performance.now();
    lastLoud = started;
    // A small local voice activity detector. This decides WHEN to stop the
    // recording; the actual speech recognition always runs on Railway.
    if (autoStop) {
      try {
        audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.fftSize);
        const detector = createMicrophoneActivityDetector();
        frameTimer = setInterval(() => {
          if (closed || cancelled) return;
          analyser.getByteTimeDomainData(buf);
          let power = 0;
          for (const value of buf) {
            const sample = (value - 128) / 128;
            power += sample * sample;
          }
          const rms = Math.sqrt(power / buf.length);
          const now = performance.now();
          const activity = detector.update(rms, now);
          heardSpeech = activity.heardSpeech;
          if (activity.lastLoud) lastLoud = activity.lastLoud;
          if (heardSpeech && now - lastLoud > SPEECH_SILENCE_MS && now - started > 1_350) {
            finish();
          } else if (!heardSpeech && now - started >= START_SILENCE_MS) {
            finish();
          }
        }, 100);
      } catch {
        // Devices without AudioContext still get a bounded recording.
      }
    }
    ceilingTimer = setTimeout(finish, MAX_MS);
    return { stop: finish, cancel };
  } catch (error) {
    dispose();
    throw new Error(description(error));
  }
}
