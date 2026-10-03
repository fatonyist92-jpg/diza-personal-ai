type DizaNativeEnvelope = {
  status: number;
  body?: string;
  base64?: string;
  contentType?: string;
  headers?: Record<string, string>;
};

type PendingNative = {
  resolve: (value: Response) => void;
  reject: (reason?: unknown) => void;
};

declare global {
  interface Window {
    DizaNative?: {
      getServer(): string;
      setServer(value: string): string;
      clearServer(): string;
      request(
        id: string,
        method: string,
        path: string,
        headersJson: string,
        bodyBase64: string,
      ): void;
      openExternal(url: string): void;
    };
    __dizaNativeResponse?: (id: string, payload: string) => void;
  }
}

const pending = new Map<string, PendingNative>();
let seq = 0;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function nativeApiPath(input: RequestInfo | URL): string | null {
  const raw =
    typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const url = new URL(raw, window.location.href);
  if (url.hostname !== "appassets.androidplatform.net" || !url.pathname.startsWith("/api/")) {
    return null;
  }
  return url.pathname + url.search;
}

async function bodyBase64(init?: RequestInit): Promise<string> {
  const explicit = init?.body;
  if (explicit == null) return "";
  if (typeof explicit === "string") return bytesToBase64(new TextEncoder().encode(explicit));
  if (explicit instanceof URLSearchParams) {
    return bytesToBase64(new TextEncoder().encode(explicit.toString()));
  }
  if (explicit instanceof Blob) return bytesToBase64(new Uint8Array(await explicit.arrayBuffer()));
  if (explicit instanceof ArrayBuffer) return bytesToBase64(new Uint8Array(explicit));
  if (ArrayBuffer.isView(explicit)) {
    return bytesToBase64(new Uint8Array(explicit.buffer, explicit.byteOffset, explicit.byteLength));
  }
  // Bloks' JSON API uses strings. Leave unsupported browser-only bodies to
  // the browser instead of silently changing them.
  throw new Error("This request body is not supported by the Android bridge.");
}

function mergedHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
  return headers;
}

export function isDizaAndroid(): boolean {
  return Boolean(window.DizaNative);
}

export function getDizaServer(): string {
  return window.DizaNative?.getServer?.() ?? "";
}

export function setDizaServer(value: string): { ok: boolean; error?: string } {
  if (!window.DizaNative) return { ok: false, error: "Android bridge tidak tersedia." };
  try {
    const env = JSON.parse(window.DizaNative.setServer(value)) as DizaNativeEnvelope;
    const body = env.body ? JSON.parse(env.body) : {};
    return env.status >= 200 && env.status < 300
      ? { ok: true }
      : { ok: false, error: body.error ?? "Server tidak valid." };
  } catch {
    return { ok: false, error: "Server tidak valid." };
  }
}

export function installDizaAndroidBridge(): void {
  if (!window.DizaNative) return;

  window.__dizaNativeResponse = (id, payload) => {
    const waiter = pending.get(id);
    if (!waiter) return;
    pending.delete(id);
    try {
      const env = JSON.parse(payload) as DizaNativeEnvelope;
      const headers = new Headers(env.headers ?? {});
      if (env.contentType && !headers.has("content-type")) headers.set("content-type", env.contentType);
      let body: BodyInit | null = null;
      if (env.status !== 204 && env.status !== 205 && env.status !== 304) {
        if (env.base64) {
          const bytes = base64ToBytes(env.base64);
          const buffer = new ArrayBuffer(bytes.byteLength);
          new Uint8Array(buffer).set(bytes);
          body = buffer;
        } else {
          body = env.body ?? "";
        }
      }
      waiter.resolve(new Response(body, { status: env.status, headers }));
    } catch (error) {
      waiter.reject(error);
    }
  };

  const browserFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = nativeApiPath(input);
    if (!path) return browserFetch(input, init);

    const requestMethod = input instanceof Request ? input.method : "GET";
    const method = (init?.method ?? requestMethod).toUpperCase();

    // GET/HEAD stay in WebView so streamed SSE, avatars and binary responses
    // keep normal browser semantics. MainActivity proxies them to the selected server.
    if (method === "GET" || method === "HEAD") return browserFetch(input, init);

    const id = `req-${Date.now()}-${++seq}`;
    const headers: Record<string, string> = {};
    mergedHeaders(input, init).forEach((value, key) => {
      headers[key] = value;
    });
    const encoded = await bodyBase64(init);

    return new Promise<Response>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      try {
        window.DizaNative!.request(id, method, path, JSON.stringify(headers), encoded);
      } catch (error) {
        pending.delete(id);
        reject(error);
      }
    });
  };
}
