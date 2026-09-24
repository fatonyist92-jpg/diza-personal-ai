export const DISCOVERY_FEEDS = [
  {
    id: "awesome-freellm-apis",
    url: "https://raw.githubusercontent.com/freellms/awesome-freellm-apis/main/README.md",
    trust: 0.72,
  },
  {
    id: "freellmapi-public",
    url: "https://raw.githubusercontent.com/tashfeenahmed/freellmapi/main/README.md",
    trust: 0.72,
  },
];

export const BUILTIN_PROVIDERS = [
  {
    id:"groq", name:"Groq", aliases:["groq cloud"],
    adapter:"openai-compatible", baseUrl:"https://api.groq.com/openai/v1",
    keyEnv:"GROQ_API_KEY", modelEnv:"GROQ_MODEL", defaultModel:"llama-3.1-8b-instant",
    capabilities:["text","coding"], contextWindow:131072,
    officialDocs:["https://console.groq.com/docs/rate-limits"],
    autoEligible:true,
  },
  {
    id:"gemini", name:"Google Gemini", aliases:["gemini","google ai"],
    adapter:"gemini", keyEnv:"GEMINI_API_KEY", modelEnv:"GEMINI_MODEL", defaultModel:"gemini-2.5-flash",
    capabilities:["text","coding","long_context"], contextWindow:1000000,
    officialDocs:["https://ai.google.dev/gemini-api/docs/rate-limits"],
    autoEligible:true,
  },
  {
    id:"cerebras", name:"Cerebras", aliases:["cerebras inference"],
    adapter:"openai-compatible", baseUrl:"https://api.cerebras.ai/v1",
    keyEnv:"CEREBRAS_API_KEY", modelEnv:"CEREBRAS_MODEL", defaultModel:"gpt-oss-120b",
    capabilities:["text","coding"], contextWindow:131072,
    officialDocs:["https://inference-docs.cerebras.ai/support/rate-limits"],
    autoEligible:true,
  },
  {
    id:"openrouter", name:"OpenRouter", aliases:["open router"],
    adapter:"openai-compatible", baseUrl:"https://openrouter.ai/api/v1",
    keyEnv:"OPENROUTER_API_KEY", modelEnv:"OPENROUTER_MODEL", defaultModel:"openrouter/free",
    capabilities:["text","coding"], contextWindow:200000,
    officialDocs:["https://openrouter.ai/pricing"],
    autoEligible:true,
  },
  {
    id:"mistral", name:"Mistral", aliases:["mistral ai"],
    adapter:"openai-compatible", baseUrl:"https://api.mistral.ai/v1",
    keyEnv:"MISTRAL_API_KEY", modelEnv:"MISTRAL_MODEL", defaultModel:"mistral-small-latest",
    capabilities:["text","coding"], contextWindow:128000,
    officialDocs:[
      "https://docs.mistral.ai/admin/billing-usage/usage-limits",
      "https://docs.mistral.ai/getting-started/quickstarts/developer/first-api-request"
    ],
    autoEligible:true,
  },
  {
    id:"nvidia", name:"NVIDIA NIM", aliases:["nvidia api catalog","nvidia nim"],
    adapter:"openai-compatible", baseUrl:"https://integrate.api.nvidia.com/v1",
    keyEnv:"NVIDIA_API_KEY", modelEnv:"NVIDIA_MODEL", defaultModel:"openai/gpt-oss-20b",
    capabilities:["text","coding"], contextWindow:131072,
    officialDocs:["https://docs.api.nvidia.com/nim/docs/product"],
    autoEligible:true,
  },
  {
    id:"cloudflare", name:"Cloudflare Workers AI", aliases:["workers ai","cloudflare ai"],
    adapter:"cloudflare",
    keyEnv:"CLOUDFLARE_API_TOKEN", modelEnv:"CLOUDFLARE_MODEL",
    capabilities:["text","coding"], contextWindow:131072,
    officialDocs:["https://developers.cloudflare.com/workers-ai/platform/pricing/"],
    autoEligible:false,
  },
  {
    id:"cohere", name:"Cohere", aliases:["cohere trial"],
    adapter:"cohere",
    keyEnv:"COHERE_API_KEY", modelEnv:"COHERE_MODEL",
    capabilities:["text"], contextWindow:128000,
    officialDocs:["https://docs.cohere.com/v1/docs/rate-limits"],
    autoEligible:false,
  },
  {
    id:"huggingface", name:"Hugging Face", aliases:["huggingface inference","hf inference"],
    adapter:"custom",
    keyEnv:"HF_TOKEN",
    capabilities:["text"],
    officialDocs:["https://huggingface.co/docs/inference-providers/pricing"],
    autoEligible:false,
  },
  {
    id:"awan", name:"Awan LLM", aliases:["awanllm"],
    adapter:"custom",
    keyEnv:"AWAN_API_KEY",
    capabilities:["text"],
    officialDocs:["https://www.awanllm.com/pricing"],
    autoEligible:false,
  },
  {
    id:"kilo", name:"Kilo Gateway", aliases:["kilo auto free","kilo"],
    adapter:"custom",
    keyEnv:"KILO_API_KEY",
    capabilities:["text","coding"],
    officialDocs:["https://kilo.ai/docs/getting-started/rate-limits-and-costs"],
    autoEligible:false,
  },
  {
    id:"alibaba-model-studio", name:"Alibaba Model Studio", aliases:["model studio","dashscope"],
    adapter:"custom",
    keyEnv:"DASHSCOPE_API_KEY",
    capabilities:["text","coding"],
    officialDocs:["https://www.alibabacloud.com/help/en/model-studio/new-free-quota"],
    autoEligible:false,
  },
];

function clone(x){ return JSON.parse(JSON.stringify(x)); }
function norm(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }

export class ProviderCatalog {
  constructor(seed=BUILTIN_PROVIDERS){
    this.providers=new Map(seed.map(p=>[p.id,{...clone(p),intel:p.intel||null,enabled:p.enabled!==false}]));
    this.candidates=new Map();
    this.events=[];
  }

  list(){ return [...this.providers.values()].map(clone); }
  get(id){ const p=this.providers.get(id); return p?clone(p):null; }

  findByName(name){
    const n=norm(name);
    for(const p of this.providers.values()){
      const names=[p.name,p.id,...(p.aliases||[])].map(norm);
      if(names.includes(n)) return clone(p);
    }
    return null;
  }

  upsertProvider(provider){
    const prev=this.providers.get(provider.id)||{};
    const next={...prev,...clone(provider)};
    this.providers.set(next.id,next);
    return clone(next);
  }

  applyIntel(providerId,intel,{sourceUrl,fingerprint,checkedAt=Date.now()}={}){
    const p=this.providers.get(providerId);
    if(!p) return null;
    p.intel={...clone(intel),sourceUrl,fingerprint,checkedAt};
    if(intel.freeStatus==="not_free" || (intel.requiresCard===true && intel.freeStatus!=="recurring")){
      p.autoEligible=false;
      p.disabledReason="free-tier-safety";
    }
    if(intel.freeStatus==="recurring" && intel.requiresCard!==true && p.disabledReason==="free-tier-safety"){
      delete p.disabledReason;
    }
    this.providers.set(providerId,p);
    return clone(p);
  }

  addEvent(event){
    const e={id:"evt_"+(this.events.length+1),at:Date.now(),...clone(event)};
    this.events.push(e);
    if(this.events.length>1000)this.events.splice(0,this.events.length-1000);
    return clone(e);
  }

  upsertCandidate(candidate){
    const key=norm(candidate.name);
    const prev=this.candidates.get(key)||{
      id:"candidate:"+key.replace(/\s+/g,"-"),
      name:candidate.name,
      firstSeenAt:Date.now(),
      observedSources:[],
      links:[],
      status:"candidate",
      confidence:0,
    };
    prev.lastSeenAt=Date.now();
    prev.observedSources=[...new Set([...prev.observedSources,...(candidate.observedSources||[])])];
    prev.links=[...new Set([...prev.links,...(candidate.links||[])])];
    prev.confidence=Math.min(0.98,Math.max(prev.confidence,candidate.confidence||0)+(prev.observedSources.length>1?0.15:0));
    this.candidates.set(key,prev);
    return clone(prev);
  }

  listCandidates(){return [...this.candidates.values()].map(clone);}
  snapshot(){return {providers:[...this.providers.entries()],candidates:[...this.candidates.entries()],events:clone(this.events)};}
  import(snapshot){
    if(!snapshot)return;
    if(snapshot.providers)this.providers=new Map(snapshot.providers);
    if(snapshot.candidates)this.candidates=new Map(snapshot.candidates);
    if(snapshot.events)this.events=clone(snapshot.events);
  }
}
