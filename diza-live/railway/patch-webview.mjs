// Version-pinned WebView adaptation for the official Bloks server.
// Abort build rather than weakening authentication if upstream changes.
import { readFileSync, writeFileSync } from "node:fs";
function replaceOnce(file, oldText, newText, title) {
  const source = readFileSync(file, "utf8");
  const at = source.indexOf(oldText);
  if (at < 0 || source.indexOf(oldText, at + 1) !== -1) {
    throw Error("WebView patch anchor missing or duplicate: " + title);
  }
  writeFileSync(file, source.slice(0, at) + newText + source.slice(at + oldText.length));
  console.log("patched:", title);
}
const file = "/opt/bloks/server/index.ts";
const guard = "/opt/bloks/server/http-guard.ts";
const lines = (...v) => v.join("\n");
replaceOnce(guard,
  lines("  const header = req.headers.authorization;", "  if (!header) return null;"),
  lines(
    "  const header = req.headers.authorization;",
    "  if (!header) {",
    "    // Paired browser cookie; native Bearer Authorization stays supported.",
    '    const entry = (req.headers.cookie ?? "").split(";")',
    '      .map((x) => x.trim()).find((x) => x.startsWith("__Host-bloks_session="));',
    '    const token = entry?.slice("__Host-bloks_session=".length) ?? "";',
    "    return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;",
    "  }"),
  "http-guard secure cookie fallback");
replaceOnce(file,
  lines('    const open =',
    '      (method === "GET" && path === "/api/health") ||',
    '      (method === "POST" && path === "/api/pair/claim");'),
  lines('    const open =',
    '      (method === "GET" && path === "/api/health") ||',
    '      (method === "POST" && path === "/api/pair/claim") ||',
    '      // Only static UI files are public; every private /api route stays paired.',
    '      (method === "GET" && Boolean(STATIC_DIR) &&',
    '        !path.startsWith("/api/") && !path.startsWith("/hook/"));'),
  "permit unauthenticated static assets only");
replaceOnce(file,
  lines('      broadcast({ kind: "pairing", ...pairingStatus() });',
    '      return json(res, 200, claimed);',
    '    }',
    '    if (method === "DELETE" && path === "/api/pair/devices") {'),
  lines('      broadcast({ kind: "pairing", ...pairingStatus() });',
    '      if (req.headers["x-bloks-webview"] === "1") {',
    '        // Raw bearer token is never returned to JavaScript on WebView.',
    '        res.setHeader("set-cookie",',
    '          "__Host-bloks_session=" + claimed.token +',
    '          "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000");',
    '        return json(res, 200, { ok: true, device: claimed.device });',
    '      }',
    '      return json(res, 200, claimed);',
    '    }',
    '    if (method === "DELETE" && path === "/api/pair/devices") {'),
  "set HttpOnly secure cookie after WebView pairing");
replaceOnce(file,
  lines('    if (method === "GET" && !path.startsWith("/api/") && STATIC_DIR) {',
    '      // resolve, then require the result to stay inside STATIC_DIR,'),
  lines('    if (method === "GET" && !path.startsWith("/api/") && STATIC_DIR) {',
    '      if ((path === "/" || path === "/index.html") &&',
    '          !deviceForToken(bearerToken(req))) {',
    '        res.writeHead(302, { location: "/pair.html", ...SECURITY_HEADERS });',
    '        return res.end();',
    '      }',
    '      // resolve, then require the result to stay inside STATIC_DIR,'),
  "redirect unpaired browser to pairing page");
