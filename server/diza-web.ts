// DIZA single-user web access.
//
// Bloks is local-first. This optional boundary lets the same server be
// published behind HTTPS without turning its local-only API into an open
// internet endpoint. It is disabled unless DIZA_WEB_MODE=1 and a strong
// password is supplied in DIZA_WEB_PASSWORD.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const COOKIE = "__Host-diza_session";
const CONTEXT = "diza-web-session-v1";
const requested = process.env.DIZA_WEB_MODE === "1";
const password = process.env.DIZA_WEB_PASSWORD ?? "";

const digest = (value: string) => createHash("sha256").update(value).digest();

function same(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin || origin === "null") return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function cookies(req: IncomingMessage): Record<string, string> {
  const raw = req.headers.cookie ?? "";
  const out: Record<string, string> = {};
  for (const item of raw.split(";")) {
    const cut = item.indexOf("=");
    if (cut <= 0) continue;
    const key = item.slice(0, cut).trim();
    const value = item.slice(cut + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function sessionValue(): string {
  return createHmac("sha256", password).update(CONTEXT).digest("base64url");
}

export function webModeRequested(): boolean {
  return requested;
}

export function webModeEnabled(): boolean {
  return requested && Buffer.byteLength(password, "utf8") >= 16;
}

export function assertWebModeConfigured(): void {
  if (!requested) return;
  if (!webModeEnabled()) {
    throw new Error("DIZA_WEB_MODE=1 requires DIZA_WEB_PASSWORD with at least 16 bytes");
  }
}

export function isWebOwner(req: IncomingMessage): boolean {
  if (!webModeEnabled() || !sameOrigin(req)) return false;
  const offered = cookies(req)[COOKIE];
  return typeof offered === "string" && offered.length > 0 && same(offered, sessionValue());
}

export function webPasswordMatches(offered: unknown): boolean {
  return webModeEnabled() && typeof offered === "string" && same(offered, password);
}

export function setWebSession(res: ServerResponse): void {
  const maxAge = 30 * 24 * 60 * 60;
  res.setHeader(
    "set-cookie",
    `${COOKIE}=${sessionValue()}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`,
  );
}

export function clearWebSession(res: ServerResponse): void {
  res.setHeader("set-cookie", `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`);
}
