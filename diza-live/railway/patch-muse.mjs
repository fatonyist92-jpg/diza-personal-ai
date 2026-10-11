// Add official Meta Model API support as a FIRST-CLASS, opt-in Bloks engine.
// Muse Spark is a hosted model, NOT a local install. No auto-login,
// fake free quota, API key, or background inference is enabled here.
// This patch is anchored to the version-pinned upstream Bloks source.
import { readFileSync, writeFileSync } from "node:fs";
const file = "/opt/bloks/server/providers.ts";
const before = readFileSync(file, "utf8");
function replaceOnce(text, anchor, replacement, label) {
  const pos = text.indexOf(anchor);
  if (pos < 0 || text.indexOf(anchor, pos + anchor.length) >= 0) {
    throw Error("Muse Spark patch: missing/ambiguous anchor " + label);
  }
  return text.slice(0, pos) + replacement + text.slice(pos + anchor.length);
}
let content = before;
content = replaceOnce(
  content,
  "const GEMINI: ProviderSpec = {",
  [
    "// Muse Spark models are hosted by Meta's paid Model API, not local CLIs.",
    "// No outbound requests happen until the owner adds a Meta API key.",
    "const META_MUSE: ProviderSpec = {",
    '  kind: "metaMuse",',
    '  name: "Muse Spark · Meta",',
    '  url: "https://api.meta.ai/v1",',
    '  auth: "key",',
    '  tools: true,',
    '  keyHint: "Meta Model API key required; Meta charges per token. No free API is assumed.",',
    '  docsUrl: "https://dev.meta.ai/docs/quickstart",',
    "  models: {",
    '    default: "muse-spark-1.3",',
    "    options: [",
    '      { id: "muse-spark-1.3", label: "Muse Spark 1.3" },',
    '      { id: "muse-spark-1.2", label: "Muse Spark 1.2" },',
    '      { id: "muse-spark-1.1", label: "Muse Spark 1.1" },',
    "    ],",
    "  },",
    "  prefer: [/^muse-spark-/],",
    "  limit: 6,",
    '  small: "muse-spark-1.3",',
    "};",
    "",
    "const GEMINI: ProviderSpec = {",
  ].join("\n"),
  "provider definition",
);
content = replaceOnce(
  content,
  "  OPENROUTER,\n  GEMINI,\n  XAI,",
  "  OPENROUTER,\n  GEMINI,\n  META_MUSE,\n  XAI,",
  "provider registry",
);
writeFileSync(file, content);
console.log("Muse Spark Meta Model API provider registered without credentials.");
