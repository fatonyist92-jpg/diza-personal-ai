import { ProviderError, ErrorCode } from "../errors.mjs";

export class CohereTrialProvider {
  constructor({
    id="cohere",
    modelId="command-a-03-2025",
    apiKey,
    capabilities=["text"],
    timeoutMs=60000,
    quality=0.82,
    latencyMs=1400,
    contextWindow=128000,
    fetchImpl=globalThis.fetch
  }={}){
    Object.assign(this,{id,modelId,apiKey,timeoutMs,quality,latencyMs,contextWindow,fetchImpl});
    this.capabilities=new Set(capabilities);
    this.billingMode="free_only";
    this.paidAllowed=false;
  }

  supports(requirements={}){
    return (requirements.capabilities||["text"]).every(c=>this.capabilities.has(c));
  }

  async generate(request){
    if(!this.apiKey)throw new ProviderError(ErrorCode.AUTH,"Cohere trial API key missing");
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      const messages=request.messages||[{role:"user",content:request.input||""}];
      const res=await this.fetchImpl("https://api.cohere.com/v2/chat",{
        method:"POST",
        signal:controller.signal,
        headers:{
          authorization:"Bearer "+this.apiKey,
          "content-type":"application/json"
        },
        body:JSON.stringify({
          model:this.modelId,
          messages,
          temperature:request.temperature??0.2
        })
      });
      const body=await res.json().catch(()=>({}));
      const msg=body?.message||body?.error?.message||("HTTP "+res.status);
      if(!res.ok){
        if(res.status===429)throw new ProviderError(ErrorCode.QUOTA,msg,{status:429,retryAfterMs:60000});
        if(res.status===401||res.status===403)throw new ProviderError(ErrorCode.AUTH,msg,{status:res.status});
        if(res.status>=500)throw new ProviderError(ErrorCode.SERVER,msg,{status:res.status});
        throw new ProviderError(ErrorCode.BAD_REQUEST,msg,{status:res.status});
      }
      const text=(body?.message?.content||[]).map(x=>x?.text||"").join("\n").trim();
      const tokensUsed=Number(body?.usage?.tokens?.input_tokens||0)+Number(body?.usage?.tokens?.output_tokens||0);
      return {text,usage:{tokensUsed:tokensUsed||undefined,authoritative:Boolean(tokensUsed)}};
    }finally{
      clearTimeout(timer);
    }
  }
}
