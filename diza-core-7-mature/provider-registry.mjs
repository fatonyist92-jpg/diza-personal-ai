export const MatureCapability=Object.freeze({
  TEXT:"adult_text",
  IMAGE:"adult_image",
  I2V:"adult_i2v",
});

export const MaturePolicy=Object.freeze({
  EXPLICIT_ALLOWED:"explicit_allowed",
  SUGGESTIVE_ONLY:"suggestive_only",
  PROHIBITED:"prohibited",
  UNKNOWN:"unknown",
});

export const Deployment=Object.freeze({
  LOCAL:"local",
  HOSTED:"hosted",
});

export const PROVIDERS=[
  {
    id:"local-text",
    name:"Local Uncensored LLM",
    deployment:Deployment.LOCAL,
    capabilities:[MatureCapability.TEXT],
    adultPolicy:MaturePolicy.EXPLICIT_ALLOWED,
    enabledByDefault:true,
    requiresApiKey:false,
    priority:100,
  },
  {
    id:"local-image",
    name:"Local ComfyUI Image",
    deployment:Deployment.LOCAL,
    capabilities:[MatureCapability.IMAGE],
    adultPolicy:MaturePolicy.EXPLICIT_ALLOWED,
    enabledByDefault:true,
    requiresApiKey:false,
    priority:100,
  },
  {
    id:"local-wan-i2v",
    name:"Local Wan I2V",
    deployment:Deployment.LOCAL,
    capabilities:[MatureCapability.I2V],
    adultPolicy:MaturePolicy.EXPLICIT_ALLOWED,
    enabledByDefault:true,
    requiresApiKey:false,
    priority:100,
  },
  {
    id:"venice",
    name:"Venice AI",
    deployment:Deployment.HOSTED,
    capabilities:[
      MatureCapability.TEXT,
      MatureCapability.IMAGE,
      MatureCapability.I2V,
    ],
    adultPolicy:MaturePolicy.EXPLICIT_ALLOWED,
    enabledByDefault:false,
    requiresApiKey:true,
    priority:70,
    officialPolicyUrls:[
      "https://learn.venice.ai/guides/create-images-videos-and-custom-characters-in-venice-ai"
    ],
  },
  {
    id:"novelai",
    name:"NovelAI",
    deployment:Deployment.HOSTED,
    capabilities:[
      MatureCapability.TEXT,
      MatureCapability.IMAGE,
    ],
    adultPolicy:MaturePolicy.UNKNOWN,
    enabledByDefault:false,
    requiresApiKey:true,
    priority:55,
    officialPolicyUrls:[
      "https://docs.novelai.net/en/image/"
    ],
  },
];

export class MatureProviderRegistry{
  constructor(seed=PROVIDERS){
    this.providers=new Map(seed.map(p=>[p.id,structuredClone(p)]));
  }
  list(){return [...this.providers.values()].map(structuredClone);}
  get(id){const p=this.providers.get(id);return p?structuredClone(p):null;}
  patch(id,patch={}){
    const p=this.providers.get(id);
    if(!p)return null;
    const next={...p,...structuredClone(patch),id:p.id};
    this.providers.set(id,next);
    return structuredClone(next);
  }
}
