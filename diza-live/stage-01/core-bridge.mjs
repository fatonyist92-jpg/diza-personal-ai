/**
 * Stage 01: minimal, host-neutral Bloks REST/SSE contract.
 * No LLM transport, microphone, avatar, secrets storage, or Android UI here.
 * Pairing tokens MUST be supplied by a secure host; never embed one in an APK.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function normalizeBloksOrigin(input) {
  if (typeof input !== "string" || !input.trim()) throw new TypeError("Server URL is required");
  let url;
  try { url = new URL(input.trim()); }
  catch { throw new TypeError("Invalid server URL"); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new TypeError("Server URL must contain only an origin");
  }
  if (url.protocol !== "https:" &&
      !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    throw new TypeError("Bloks requires HTTPS except on device-local loopback");
  }
  return url.origin;
}
function requireId(id) {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw new TypeError("Invalid agent ID");
  }
  return encodeURIComponent(id);
}
export class BloksHttpError extends Error {
  constructor(status) {
    super("Bloks HTTP " + status);
    this.name = "BloksHttpError";
    this.status = status;
  }
}
export class BloksCoreBridge {
  #fetch;
  #token;
  constructor({ origin, token = null, fetchImpl = globalThis.fetch }) {
    this.origin = normalizeBloksOrigin(origin);
    if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
    this.#fetch = fetchImpl;
    this.setToken(token);
  }
  setToken(token) {
    if (token !== null && (typeof token !== "string" || !token.trim())) {
      throw new TypeError("Invalid session token");
    }
    this.#token = token;
  }
  async #request(path, { method = "GET", body, signal, stream = false } = {}) {
    const headers = { accept: stream ? "text/event-stream" : "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.#token) headers.authorization = "Bearer " + this.#token;
    const res = await this.#fetch(this.origin + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      credentials: "omit",
      redirect: "error"
    });
    if (!res.ok) throw new BloksHttpError(res.status);
    if (stream) {
      if (!res.body) throw new Error("Bloks event stream is unavailable");
      return res.body;
    }
    return res.status === 204 ? {} : res.json();
  }
  health({ signal } = {}) {
    return this.#request("/api/health", { signal });
  }
  agents({ messages = 0, signal } = {}) {
    if (!Number.isSafeInteger(messages) || messages < 0 || messages > 100) {
      throw new RangeError("messages must be an integer from 0 to 100");
    }
    return this.#request("/api/bots?messages=" + messages, { signal });
  }
  send(agentId, text, { signal, replyTo } = {}) {
    if (typeof text !== "string" || !text.trim()) throw new TypeError("Message must not be blank");
    const body = { text: text.trim() };
    if (replyTo !== undefined) body.replyTo = replyTo;
    return this.#request("/api/bots/" + requireId(agentId) + "/messages", {
      method: "POST", body, signal
    });
  }
  claimCall(agentId, { device = "DIZA Android", signal } = {}) {
    return this.#request("/api/calls/claim", {
      method: "POST", body: { targetId: requireId(agentId), device }, signal
    });
  }
  renewCall(token, { signal } = {}) {
    if (typeof token !== "string" || !token) throw new TypeError("Call token is required");
    return this.#request("/api/calls/renew", {
      method: "POST", body: { token }, signal
    });
  }
  endCall(token, { signal } = {}) {
    if (typeof token !== "string" || !token) throw new TypeError("Call token is required");
    return this.#request("/api/calls", {
      method: "DELETE", body: { token }, signal
    });
  }
  events({ since = 0, signal } = {}) {
    if (!Number.isSafeInteger(since) || since < 0) throw new RangeError("Invalid event sequence");
    return this.#request("/api/events" + (since ? "?since=" + since : ""), {
      signal, stream: true
    });
  }
}
