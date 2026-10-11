// Strict pinned-source Codex device-auth extension for Bloks on Railway.
// No unauthenticated API or local shell/terminal endpoint is opened.
import { readFileSync, writeFileSync } from "node:fs";
function once(path, oldText, nextText, label) {
  const s = readFileSync(path, "utf8");
  const at = s.indexOf(oldText);
  if (at < 0 || s.indexOf(oldText, at + oldText.length) !== -1)
    throw Error("Codex patch anchor invalid: " + label);
  writeFileSync(path, s.slice(0, at) + nextText + s.slice(at + oldText.length));
  console.log("codex extension:", label);
}
const upstream = "/opt/bloks/server/index.ts";
once(upstream,
  'import * as speech from "./speech.ts";',
  'import * as speech from "./speech.ts";\nimport { codexLoginStart, codexLoginStatus } from "./codex-login.ts";',
  "backend import");
once(upstream,
  "  try {\n    // ── events stream ──",
  [
    "  try {",
    "    // Owner-paired browser only: guests, remote relays, and agents cannot",
    "    // initiate account sign-in. The Bloks remote token guard ran above.",
    '    if ((method === "GET" && path === "/api/bloks-codex/status") ||',
    '        (method === "POST" && path === "/api/bloks-codex/start")) {',
    '      if (!caller || caller.personId || viaRelay || asAgent) {',
    '        return json(res, 403, { error: "owner pairing required" });',
    "      }",
    '      const result = path === "/api/bloks-codex/start"',
    "        ? await codexLoginStart() : await codexLoginStatus();",
    "      res.setHeader('cache-control', 'no-store');",
    "      return json(res, 200, result);",
    "    }",
    "    // ── events stream ──",
  ].join("\n"),
  "owner-only Codex status and device auth routes");
const panel="/opt/bloks/src/components/EnginesPanel.tsx";
once(panel,
  '      {provider.auth === "cli" && provider.connected && (',
  [
    '      {provider.kind === "codex" && (',
    '        <div className="mt-2 pl-10">',
    '          <a href="/codex.html" className="text-[12px] font-medium text-primary underline underline-offset-2">',
    '            Hubungkan / periksa Codex lewat ChatGPT',
    '          </a>',
    '        </div>',
    '      )}',
    '      {provider.auth === "cli" && provider.connected && (',
  ].join("\n"),
  "original Bloks engine settings link");
