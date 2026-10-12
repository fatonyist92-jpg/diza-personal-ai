// Regression checks for Bloks Android's first Call utterance.
// Test the actual VAD function extracted from the shipped browserMic.ts,
// not a copied fake. Runs inside the production Docker build.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const micSrc = readFileSync(new URL("./browserMic.ts", import.meta.url), "utf8");
const voiceSrc = readFileSync(new URL("../components/Voice.tsx", import.meta.url), "utf8");
const constants = ["SPEECH_RMS_THRESHOLD", "MIN_SPEECH_FRAMES",
  "STARTUP_TRANSIENT_MS", "STARTUP_MIN_SPEECH_FRAMES"];
const declarations = constants.map(name => {
  const line = micSrc.match(new RegExp("^const " + name + " = [^\\n]+;", "m"))?.[0];
  assert.ok(line, "shipped microphone missing constant " + name);
  return line;
}).join("\n");
const detectorCode = micSrc.match(
  /export function createMicrophoneActivityDetector\(\) \{[\s\S]*?\n\}\n(?=\nfunction description)/
)?.[0];
assert.ok(detectorCode, "cannot find shipped microphone detector");
const factory = runInNewContext(declarations + "\n" +
  detectorCode.replace(/^export /, "").replace(/: number/g, "") +
  "\ncreateMicrophoneActivityDetector");

test("initial two-frame Android startup click must not count as user speech", () => {
  const d = factory();
  assert.equal(d.update(0.03, 100, 100).heardSpeech, false);
  assert.equal(d.update(0.03, 200, 200).heardSpeech, false);
  assert.equal(d.update(0, 300, 300).heardSpeech, false);
});
test("actual early sustained voice is retained even during warmup", () => {
  const d = factory();
  let value;
  for (let t = 100; t <= 600; t += 100) value = d.update(0.03, t, t);
  assert.equal(value.heardSpeech, true);
  assert.equal(value.lastLoud, 600);
});
test("normal voice is recognized after three frames beyond startup", () => {
  const d = factory();
  assert.equal(d.update(0.02, 700, 700).heardSpeech, false);
  assert.equal(d.update(0.02, 800, 800).heardSpeech, false);
  assert.equal(d.update(0.02, 900, 900).heardSpeech, true);
});
test("short transient after normal start is not enough to stop recording", () => {
  const d = factory();
  d.update(0.05, 900, 900);
  d.update(0.05, 1000, 1000);
  const result = d.update(0, 1100, 1100);
  assert.equal(result.heardSpeech, false);
});
test("Call displays mic preparation until recording physically starts", () => {
  assert.ok(micSrc.includes("recorder.onstart = () =>"));
  assert.ok(micSrc.includes("hooks.onReady?.()"));
  assert.ok(voiceSrc.includes('setCallState(window.bloks ? "listening" : "arming")'));
  assert.equal((voiceSrc.match(/onReady: \(\) =>/g) ?? []).length, 2);
  assert.equal((voiceSrc.match(/Menyiapkan mikrofon…/g) ?? []).length, 2);
});
test("captured first audio stays in recorder and is sent through private STT", () => {
  assert.ok(micSrc.includes("recorder.start();"));
  assert.ok(micSrc.includes('fetch("/api/bloks-stt/transcribe", {'));
  assert.ok(micSrc.includes('credentials: "same-origin"'));
  assert.ok(micSrc.includes('audioContext.resume().catch(() => {})'));
});
