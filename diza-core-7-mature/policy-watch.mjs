import crypto from "node:crypto";
import { MaturePolicy } from "./provider-registry.mjs";

function clean(raw){
  return String(raw||"")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/\s+/g," ")
    .trim()
    .toLowerCase();
}

function fingerprint(raw){
  return crypto.createHash("sha256").update(clean(raw)).digest("hex");
}

export function classifyAdultPolicy(raw){
  const text=clean(raw);

  const prohibited=
    /sexually explicit content.*(?:prohibited|not allowed|forbidden)/.test(text)
    || /(?:content|your content).*(?:is not|must not be).*obscene.*lewd/.test(text)
    || /obscene,?\s+lewd,?\s+lascivious/.test(text)
    || /pornograph(?:y|ic).*(?:prohibited|not allowed|forbidden)/.test(text);

  if(prohibited)return MaturePolicy.PROHIBITED;

  const explicitAllowed=
    /unrestricted image generation/.test(text)
    || /uncensored.*(?:text|image|video)/.test(text)
    || /open source video models do not censor/.test(text)
    || /most unrestricted text model/.test(text);

  if(explicitAllowed)return MaturePolicy.EXPLICIT_ALLOWED;

  const suggestive=
    /mature content/.test(text)
    || /suggestive content/.test(text);

  if(suggestive)return MaturePolicy.SUGGESTIVE_ONLY;

  return MaturePolicy.UNKNOWN;
}

export class MaturePolicyWatcher{
  constructor({registry,fetcher,now=()=>Date.now()}={}){
    this.registry=registry;
    this.fetcher=fetcher||{
      async fetchText(url){
        const r=await fetch(url,{headers:{"user-agent":"DizaBotAgent-MaturePolicyWatch/1.0"}});
        if(!r.ok)throw new Error("HTTP "+r.status);
        return r.text();
      }
    };
    this.now=now;
    this.events=[];
  }

  async checkProvider(providerId){
    const provider=this.registry.get(providerId);
    if(!provider)return {providerId,ok:false,error:"unknown provider"};
    const urls=provider.officialPolicyUrls||[];
    let lastError=null;

    for(const url of urls){
      try{
        const raw=await this.fetcher.fetchText(url);
        const policy=classifyAdultPolicy(raw);
        const fp=fingerprint(raw);
        const previous=provider.policyIntel||null;
        const changed=!previous
          || previous.fingerprint!==fp
          || previous.policy!==policy;

        const patch={
          policyIntel:{
            policy,
            fingerprint:fp,
            checkedAt:this.now(),
            sourceUrl:url
          }
        };

        if(policy===MaturePolicy.PROHIBITED){
          patch.adultPolicy=MaturePolicy.PROHIBITED;
          patch.enabledByDefault=false;
          patch.policyDisabled=true;
        }else if(
          policy===MaturePolicy.EXPLICIT_ALLOWED
          && provider.policyDisabled!==true
        ){
          patch.adultPolicy=MaturePolicy.EXPLICIT_ALLOWED;
        }

        this.registry.patch(providerId,patch);

        if(changed){
          this.events.push({
            type:"adult_policy_changed",
            providerId,
            previous:previous?.policy||null,
            current:policy,
            sourceUrl:url,
            at:this.now()
          });
        }

        return {providerId,ok:true,changed,policy,sourceUrl:url};
      }catch(e){
        lastError=e;
      }
    }

    return {
      providerId,
      ok:false,
      error:String(lastError?.message||lastError||"no official policy source")
    };
  }

  async checkAll(){
    const out=[];
    for(const p of this.registry.list()){
      if((p.officialPolicyUrls||[]).length){
        out.push(await this.checkProvider(p.id));
      }
    }
    return out;
  }
}
