import { MaturePolicy } from "./provider-registry.mjs";
import { validateMatureRequest } from "./policy-engine.mjs";

export class MatureMediaRouter{
  constructor({registry,enabledProviderIds=[],preferLocal=true}={}){
    this.registry=registry;
    this.enabledProviderIds=new Set(enabledProviderIds);
    this.preferLocal=preferLocal;
  }

  enable(id){this.enabledProviderIds.add(id);}
  disable(id){this.enabledProviderIds.delete(id);}

  candidates(request){
    const validated=validateMatureRequest(request);
    return this.registry.list()
      .filter(p=>p.capabilities.includes(validated.capability))
      .filter(p=>p.adultPolicy===MaturePolicy.EXPLICIT_ALLOWED)
      .filter(p=>p.enabledByDefault||this.enabledProviderIds.has(p.id))
      .sort((a,b)=>{
        if(this.preferLocal&&a.deployment!==b.deployment){
          return a.deployment==="local"?-1:1;
        }
        return (b.priority||0)-(a.priority||0);
      });
  }

  choose(request){
    const candidates=this.candidates(request);
    if(!candidates.length){
      const e=new Error("No mature-media provider is enabled for this capability");
      e.code="NO_MATURE_PROVIDER";
      throw e;
    }
    return candidates[0];
  }
}
