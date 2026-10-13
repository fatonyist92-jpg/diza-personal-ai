// Per-agent ElevenLabs settings. No global voice edits and no extra TTS calls.
import {useEffect,useState} from "react";
import {api,type Bot} from "@/state/store";
import {Button} from "@/components/ui/button";

type Tuning={stability:number;similarity_boost:number;style:number;speed:number};
const preset:Tuning={stability:0.65,similarity_boost:0.80,style:0,speed:0.95};
const sliders:Array<{key:keyof Tuning;label:string;min:number;max:number}>= [
  {key:"stability",label:"Stability",min:0,max:1},
  {key:"similarity_boost",label:"Similarity",min:0,max:1},
  {key:"style",label:"Style Exaggeration",min:0,max:1},
  {key:"speed",label:"Speed",min:0.7,max:1.2},
];

export function ElevenLabsVoiceTuning({bot}:{bot:Bot}){
  const [draft,setDraft]=useState<Tuning>({...preset,...(bot.voice?.settings??{})});
  const [dirty,setDirty]=useState(false);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState("");
  useEffect(()=>{
    setDraft({...preset,...(bot.voice?.settings??{})});
    setDirty(false);
    setMessage("");
  },[bot.id,bot.voice?.id,bot.voice?.settings]);

  if(bot.voice?.provider!=="elevenlabs")return null;
  const save=async()=>{
    if(saving || !bot.voice || bot.voice.provider!=="elevenlabs")return;
    setSaving(true);setMessage("");
    try{
      await api("/api/bots/"+bot.id,{method:"PATCH",body:JSON.stringify({voice:{...bot.voice,settings:draft}})});
      setDirty(false);
      setMessage("Tersimpan. Tekan Preview untuk mendengar.");
    }catch(e){
      setMessage(e instanceof Error?e.message:"Gagal menyimpan tuning.");
    }finally{setSaving(false);}
  };
  return (
    <div className="mt-3 rounded-xl border bg-muted/30 p-3">
      <div className="text-[13px] font-semibold text-foreground">ElevenLabs · Voice Tuning</div>
      <p className="mt-1 text-[11.5px] text-muted-foreground">
        Khusus agent ini. Geser, simpan, lalu tekan Preview di atas.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        {sliders.map(item=>(
          <label key={item.key} className="block">
            <span className="flex justify-between text-[12px] text-foreground">
              <span>{item.label}</span>
              <span className="font-medium tabular-nums">
                {item.key==="speed"?draft.speed.toFixed(2)+"×":Math.round(draft[item.key]*100)+"%"}
              </span>
            </span>
            <input type="range" aria-label={item.label+" ElevenLabs"}
              min={item.min} max={item.max} step={0.01} disabled={saving}
              value={draft[item.key]}
              onChange={e=>{
                setDraft(old=>({...old,[item.key]:Number(e.target.value)}));
                setDirty(true);setMessage("");
              }}
              className="mt-1.5 w-full accent-(--brand)" />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={!dirty || saving} onClick={()=>void save()}>
          {saving?"Menyimpan…":"Simpan tuning"}
        </Button>
        <Button size="sm" variant="ghost" disabled={saving}
          onClick={()=>{setDraft({...preset});setDirty(true);setMessage("");}}>
          Preset awal
        </Button>
      </div>
      {message && <p className="mt-2 text-[11.5px] text-muted-foreground" role="status">{message}</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Slider tidak memakai kredit. Preview dan Call memakai pengaturan tersimpan dan kuota ElevenLabs.
      </p>
    </div>
  );
}
