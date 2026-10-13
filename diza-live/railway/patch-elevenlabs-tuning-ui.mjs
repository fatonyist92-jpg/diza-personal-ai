// Mount tuning controls only inside existing Voice picker. No primary UI change.
import {readFileSync,writeFileSync} from "node:fs";
const p="/opt/bloks/src/components/Voice.tsx";
let s=readFileSync(p,"utf8");
function put(a,z,why){if(s.split(a).length!==2)throw Error("voice controls: "+why);s=s.replace(a,z);}
put('import { thisComputer } from "@/lib/thisComputer";',
'import { thisComputer } from "@/lib/thisComputer";\nimport { ElevenLabsVoiceTuning } from "./ElevenLabsVoiceTuning";',
"import controls");
put('          {error && <div className="mt-2 text-[12px] text-destructive">{error}</div>}\n        </div>\n      )}',
'          <ElevenLabsVoiceTuning bot={bot} />\n          {error && <div className="mt-2 text-[12px] text-destructive">{error}</div>}\n        </div>\n      )}',
"mount per-agent sliders");
writeFileSync(p,s);console.log("voice controls: mounted");
