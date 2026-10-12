/**
 * Browser-only bounded, exactly-once playback ownership for Bloks Call.
 * A missed HTMLAudioElement 'ended' event must not leave Call "Speaking"
 * forever. Stop/interrupt never invokes completion or restarts the mic.
 * Does not inspect or log voice contents, providers, or credentials.
 */
export interface PlayableCallAudio {
  addEventListener(event: string, cb: () => void): void;
  removeEventListener(event: string, cb: () => void): void;
  play(): Promise<void>;
  pause(): void;
}
export function playCallAudio(
  audio: PlayableCallAudio,
  onFinished: () => void,
  maxDurationMs = 45_000,
): () => void {
  let settled = false;
  let timer: ReturnType<typeof setTimeout>;
  const clean = () => {
    clearTimeout(timer);
    audio.removeEventListener("ended", complete);
    audio.removeEventListener("error", complete);
  };
  const complete = () => {
    if (settled) return;
    settled = true;
    clean();
    onFinished();
  };
  audio.addEventListener("ended", complete);
  audio.addEventListener("error", complete);
  timer = setTimeout(() => {
    if (settled) return;
    try { audio.pause(); } catch {}
    complete();
  }, Math.min(120_000, Math.max(12_000, maxDurationMs)));
  try {
    void Promise.resolve(audio.play()).catch(complete);
  } catch {
    complete();
  }
  // Explicit hang-up / barge-in must release the listener and suppress onFinished.
  return () => {
    if (settled) return;
    settled = true;
    clean();
    try { audio.pause(); } catch {}
  };
}
