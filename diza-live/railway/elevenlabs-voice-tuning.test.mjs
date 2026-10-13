import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeVoiceTuning,elevenLabsTtsPayload} from "./elevenlabs-voice-tuning.mjs";
const good={stability:0.65,similarity_boost:0.80,style:0,speed:0.95};
test("keeps existing unsaved ElevenLabs behavior and Turbo v2.5",()=>{
 assert.deepEqual(elevenLabsTtsPayload("Halo",undefined),{text:"Halo",model_id:"eleven_turbo_v2_5"});
});
test("sends four saved tuning settings, never global account settings",()=>{
 assert.deepEqual(elevenLabsTtsPayload("Tes",good),{
  text:"Tes",model_id:"eleven_turbo_v2_5",voice_settings:good,
 });
});
test("accepts documented slider limits",()=>{
 assert.deepEqual(normalizeVoiceTuning({stability:0,similarity_boost:1,style:0,speed:0.7}),
 {stability:0,similarity_boost:1,style:0,speed:0.7});
 assert.deepEqual(normalizeVoiceTuning({stability:1,similarity_boost:0,style:1,speed:1.2}),
 {stability:1,similarity_boost:0,style:1,speed:1.2});
});
test("rejects nonnumbers, speed over-limit and incomplete objects",()=>{
 for(const bad of [
  {...good,speed:1.21},{...good,speed:0.69},
  {...good,stability:-0.01},{...good,style:1.01},
  {...good,similarity_boost:"0.8"},
  {stability:0.5},{...good,extra:"secret"},
  null,[],{...good,speed:NaN},
 ])assert.equal(normalizeVoiceTuning(bad),null);
});
test("invalid settings are never forwarded to ElevenLabs",()=>{
 const p=elevenLabsTtsPayload("Hello",{...good,speed:2});
 assert.equal(Object.hasOwn(p,"voice_settings"),false);
});
test("backend accepts and persists settings only for ElevenLabs voices",()=>{
 const source=readFileSync(new URL("./speech.ts",import.meta.url),"utf8");
 assert.ok(source.includes('v.provider !== "elevenlabs" || !tuning'));
 assert.ok(source.includes('...(tuning ? { settings: tuning } : {})'));
 assert.ok(source.includes("elevenLabsTtsPayload(clipped, voice.settings)"));
});
test("UI mounts four sliders in the selected agent's existing Voice picker",()=>{
 const voice=readFileSync(new URL("../src/components/Voice.tsx",import.meta.url),"utf8");
 const sliders=readFileSync(new URL("../src/components/ElevenLabsVoiceTuning.tsx",import.meta.url),"utf8");
 assert.ok(voice.includes("<ElevenLabsVoiceTuning bot={bot} />"));
 assert.ok(sliders.includes('bot.voice?.provider!=="elevenlabs"'));
 for(const field of ["stability","similarity_boost","style","speed"])assert.ok(sliders.includes('key:"'+field+'"'));
 assert.ok(sliders.includes('method:"PATCH"'));
 assert.ok(sliders.includes("Simpan tuning"));
});
test("preserves bot settings in both persisted and client types",()=>{
 for(const file of ["../server/store.ts","../src/state/reducer.ts"]){
  const source=readFileSync(new URL(file,import.meta.url),"utf8");
  assert.ok(source.includes("settings?: { stability: number; similarity_boost: number; style: number; speed: number }"));
 }
});
