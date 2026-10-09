/**
 * Verify the actual checked-out upstream source, not any older imported fork.
 * Usage: node diza-live/stage-01/verify-upstream.mjs ./bloks-upstream
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const here = fileURLToPath(new URL(".", import.meta.url));
const lock = JSON.parse(readFileSync(join(here, "UPSTREAM.lock.json"), "utf8"));
const root = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Provide an upstream checkout path");
const sha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(sha, lock.commit, "Upstream commit changed; update lock only after a deliberate audit");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.equal(pkg.version, lock.version);
assert.ok(Number(pkg.engines.node.replace(/[^0-9]/g,"")) >= 22, "Node 22+ required");
const checks = {
  "LICENSE": ["Functional Source License", "Competing Use"],
  "docs/ARCHITECTURE.md": ["/api/events", "server/index.ts", "Memory"],
  "server/index.ts": ["/api/bots", "/api/events", "/api/calls/claim"],
  "server/features.ts": ['"calls"', '"notes"'],
  "server/speech.ts": ["export async function speak", "export async function transcribe"],
  "src/components/Voice.tsx": ["export function CallOverlay", "startRecognition", "bargeIn"],
  "src/state/store.tsx": ['/api/bots/', '/api/events']
};
for (const [file, markers] of Object.entries(checks)) {
  const value = readFileSync(join(root, file), "utf8");
  for (const marker of markers) {
    assert.ok(value.includes(marker), file + " missing " + marker);
  }
  console.log("PASS", file);
}
console.log("PASS upstream SHA", sha, "Bloks", pkg.version);
