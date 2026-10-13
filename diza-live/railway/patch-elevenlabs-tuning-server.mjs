// Runs after all existing voice patches. Preserve ElevenLabs login/model/ID.
import {readFileSync,writeFileSync} from "node:fs";
const s="/opt/bloks/server/speech.ts", db="/opt/bloks/server/store.ts", ui="/opt/bloks/src/state/reducer.ts";
function put(f,a,z,label){const v=readFileSync(f,"utf8");if(v.split(a).length!==2)throw Error("voice tuning anchor: "+label);writeFileSync(f,v.replace(a,z));console.log("voice tuning:",label);}
put(s,'import { generateGeminiNaturalVoice } from "./gemini-natural-tts.mjs";',
'import { generateGeminiNaturalVoice } from "./gemini-natural-tts.mjs";\nimport { normalizeVoiceTuning, elevenLabsTtsPayload } from "./elevenlabs-voice-tuning.mjs";',"import tuning");
put(s,
'export interface BotVoice {\n  provider: "elevenlabs" | "openai" | "system" | "neural";\n  id: string;\n  name?: string;\n}',
'export interface BotVoice {\n  provider: "elevenlabs" | "openai" | "system" | "neural";\n  id: string;\n  name?: string;\n  settings?: { stability: number; similarity_boost: number; style: number; speed: number };\n}',"server type");
put(s,
'        body: JSON.stringify({\n          text: clipped,\n          // the turbo model is the latency choice: a call that answers in\n          // two seconds feels like a call, five feels like voicemail\n          model_id: "eleven_turbo_v2_5",\n        }),',
'        body: JSON.stringify(elevenLabsTtsPayload(clipped, voice.settings)),' ,"request payload");
put(s,'  if (typeof v.id !== "string" || !v.id || v.id.length > 120) return undefined;\n  return {',
'  if (typeof v.id !== "string" || !v.id || v.id.length > 120) return undefined;\n  const tuning = v.settings === undefined ? undefined : normalizeVoiceTuning(v.settings);\n  if (v.settings !== undefined && (v.provider !== "elevenlabs" || !tuning)) return undefined;\n  return {',"reject invalid tuning");
put(s,'    ...(typeof v.name === "string" ? { name: v.name.slice(0, 80) } : {}),\n  };',
'    ...(typeof v.name === "string" ? { name: v.name.slice(0, 80) } : {}),\n    ...(tuning ? { settings: tuning } : {}),\n  };',"persist settings");
for(const f of [db,ui]){
const a='voice?: { provider: "elevenlabs" | "openai" | "system" | "neural"; id: string; name?: string } | null;';
const z='voice?: { provider: "elevenlabs" | "openai" | "system" | "neural"; id: string; name?: string; settings?: { stability: number; similarity_boost: number; style: number; speed: number } } | null;';
put(f,a,z,"agent model type "+f);
}
