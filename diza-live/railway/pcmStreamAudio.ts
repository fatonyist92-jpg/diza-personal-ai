/**
 * Streams signed 16-bit little-endian 24kHz mono PCM from the authenticated
 * Bloks speech endpoint straight into Web Audio. No UI changes, no Android TTS.
 * Has the minimal HTMLAudioElement contract used by the existing Voice.tsx.
 */
type Listener = { fn: EventListenerOrEventListenerObject; once: boolean };
export class PcmStreamAudio {
  private context: AudioContext | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private listeners = new Map<string, Listener[]>();
  private started = false;
  private stopped = false;
  private ended = false;
  private nextAt = 0;
  private lastSource: AudioBufferSourceNode | null = null;

  constructor(private readonly bytes: ReadableStream<Uint8Array>) {}

  addEventListener(type: string, fn: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
    const once = typeof options === "object" && Boolean(options.once);
    const existing = this.listeners.get(type) ?? [];
    existing.push({ fn, once });
    this.listeners.set(type, existing);
  }

  private fire(type: string): void {
    const event = new Event(type);
    const existing = this.listeners.get(type) ?? [];
    this.listeners.set(type, existing.filter(l => !l.once));
    for (const listener of existing) {
      try {
        if (typeof listener.fn === "function") listener.fn(event);
        else listener.fn.handleEvent(event);
      } catch { /* user listener error must not interrupt playback */ }
    }
  }

  private finish(): void {
    if (this.ended || this.stopped) return;
    this.ended = true;
    this.fire("ended");
    void this.context?.close().catch(() => {});
    this.context = null;
  }

  async play(): Promise<void> {
    if (this.started || this.stopped) return;
    this.started = true;
    try {
      if (typeof AudioContext === "undefined") throw Error("Web Audio is unavailable");
      this.context = new AudioContext({ sampleRate: 24_000 });
      await this.context.resume();
      if (this.stopped) return;
      this.reader = this.bytes.getReader();
      // Begin delivering immediately. Do not await the entire reply before
      // resolving play(), unlike a fetch + res.blob() / new Audio() round-trip.
      void this.consume().catch(() => {
        if (!this.stopped) {
          this.fire("error");
          this.finish(); // continue the Call loop rather than hanging it
        }
      });
    } catch (error) {
      this.pause();
      throw error;
    }
  }

  private async consume(): Promise<void> {
    const ctx = this.context!;
    let received = false;
    let carry: number | null = null;
    while (!this.stopped) {
      const { done, value } = await this.reader!.read();
      if (done) break;
      if (!value?.length) continue;
      let data: Uint8Array = value;
      if (carry !== null) {
        const joined = new Uint8Array(value.length + 1);
        joined[0] = carry;
        joined.set(value, 1);
        data = joined;
        carry = null;
      }
      if (data.length % 2) {
        carry = data[data.length - 1];
        data = data.subarray(0, -1);
      }
      const samples = data.length / 2;
      if (!samples) continue;
      received = true;
      const buffer = ctx.createBuffer(1, samples, 24_000);
      const audio = buffer.getChannelData(0);
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      for (let i = 0; i < samples; i++) audio[i] = view.getInt16(i * 2, true) / 32768;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => this.sources.delete(source);
      this.sources.add(source);
      // A tiny startup cushion prevents crackling without waiting for the
      // complete TTS response. Subsequent PCM chunks play contiguously.
      const start = Math.max(ctx.currentTime + 0.06, this.nextAt);
      source.start(start);
      this.nextAt = start + buffer.duration;
      this.lastSource = source;
    }
    if (this.stopped) return;
    if (!received || carry !== null) throw Error("Incomplete streaming PCM");
    if (!this.lastSource || ctx.currentTime >= this.nextAt) this.finish();
    else this.lastSource.onended = () => {
      this.sources.delete(this.lastSource!);
      this.finish();
    };
  }

  pause(): void {
    if (this.stopped) return;
    this.stopped = true;
    void this.reader?.cancel().catch(() => {});
    if (!this.reader) void this.bytes.cancel().catch(() => {});
    for (const source of this.sources) {
      try { source.stop(); } catch {}
    }
    this.sources.clear();
    void this.context?.close().catch(() => {});
    this.context = null;
  }
}
