/**
 * Real progressive MP3 playback for ElevenLabs/OpenAI Call.
 * The server already streams audio/mpeg, but historically Voice.tsx awaited
 * response.blob(), blocking playback until the entire file was downloaded.
 *
 * Android Chrome's MediaSource receives each MP3 chunk as it arrives. Native
 * HTMLAudioElement handles decoding, timing, audio focus and ended events.
 * If MediaSource MPEG isn't available, return null BEFORE reading the stream,
 * letting the existing, working complete-blob path be used unchanged.
 */
export function streamedMp3Audio(
  stream: ReadableStream<Uint8Array>,
): HTMLAudioElement | null {
  if (typeof MediaSource === "undefined" ||
      typeof MediaSource.isTypeSupported !== "function" ||
      !MediaSource.isTypeSupported("audio/mpeg") ||
      typeof Audio === "undefined") return null;

  let media: MediaSource;
  let url: string;
  let audio: HTMLAudioElement;
  try {
    media = new MediaSource();
    url = URL.createObjectURL(media);
    audio = new Audio(url);
  } catch {
    return null;
  }

  let ended = false;
  let disposed = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

  const cleanup = (abortStream: boolean) => {
    if (disposed) return;
    disposed = true;
    media.removeEventListener("sourceopen", sourceOpen);
    // Explicit pause/hang-up cancels network consumption. Natural end does
    // not force-stop the MP3 decoder until HTMLAudioElement is finished.
    if (abortStream && !ended) {
      if (reader) void reader.cancel().catch(() => {});
      else void stream.cancel().catch(() => {});
    }
    URL.revokeObjectURL(url);
  };
  const fail = () => {
    if (disposed) return;
    // Existing Call playback watcher listens for 'error' and moves back
    // to Listening. Avoid hanging in Speaking after a failed chunk.
    audio.dispatchEvent(new Event("error"));
  };
  audio.addEventListener("ended", () => cleanup(false), { once: true });
  audio.addEventListener("error", () => cleanup(true), { once: true });
  audio.addEventListener("pause", () => cleanup(true), { once: true });

  const append = (buffer: SourceBuffer, chunk: Uint8Array): Promise<void> =>
    new Promise((resolve, reject) => {
      const done = () => {
        buffer.removeEventListener("updateend", done);
        buffer.removeEventListener("error", failed);
        resolve();
      };
      const failed = () => {
        buffer.removeEventListener("updateend", done);
        buffer.removeEventListener("error", failed);
        reject(new Error("MediaSource MP3 buffer failed"));
      };
      buffer.addEventListener("updateend", done);
      buffer.addEventListener("error", failed);
      try {
        // Fresh Uint8Array is a normal ArrayBuffer-backed BufferSource.
        buffer.appendBuffer(new Uint8Array(chunk));
      } catch (e) {
        buffer.removeEventListener("updateend", done);
        buffer.removeEventListener("error", failed);
        reject(e);
      }
    });

  async function sourceOpen(): Promise<void> {
    if (disposed) return;
    try {
      const sourceBuffer = media.addSourceBuffer("audio/mpeg");
      sourceBuffer.mode = "sequence";
      reader = stream.getReader();
      let chunks = 0;
      while (!disposed) {
        const result = await reader.read();
        if (result.done) break;
        if (!result.value?.length) continue;
        await append(sourceBuffer, result.value);
        chunks++;
      }
      if (disposed) return;
      if (!chunks) throw new Error("Empty speech stream");
      ended = true;
      if (media.readyState === "open") media.endOfStream();
    } catch {
      if (!disposed) fail();
    } finally {
      try { reader?.releaseLock(); } catch {}
    }
  }
  media.addEventListener("sourceopen", sourceOpen, { once: true });
  return audio;
}
