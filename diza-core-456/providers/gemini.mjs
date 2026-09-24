import { ProviderError, ErrorCode } from "../errors.mjs";

export class GeminiProvider {
  constructor({
    id="gemini",
    modelId="gemini-2.5-flash",
    apiKey,
    capabilities=["text","coding","long_context"],
    timeoutMs=60000,
    quality=0.88,
    latencyMs=1200,
    contextWindow=1000000
  }={}){
    Object.assign(this,{id,modelId,apiKey,timeoutMs,quality,latencyMs,contextWindow});
    this.capabilities=new Set(capabilities);
    this.billingMode="free_only";
    this.paidAllowed=false;
  }

  supports(requirements={}){
    return (requirements.capabilities||["text"]).every(c=>this.capabilities.has(c));
  }

  async generate(request){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      const contents=request.geminiContents||[
        {role:"user",parts:[{text:request.input||""}]}
      ];
      const url="https://generativelanguage.googleapis.com/v1beta/models/"
        +encodeURIComponent(this.modelId)
        +":generateContent?key="
        +encodeURIComponent(this.apiKey);

      const res=await fetch(url,{
        method:"POST",
        signal:controller.signal,
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          contents,
          generationConfig:{temperature:request.temperature??0.2}
        })
      });
      const body=await res.json().catch(()=>({}));

      if(!res.ok){
        const msg=body?.error?.message||("HTTP "+res.status);
        if(res.status===429)throw new ProviderError(ErrorCode.QUOTA,msg,{status:429,retryAfterMs:60000});
        if(res.status===401||res.status===403)throw new ProviderError(ErrorCode.AUTH,msg,{status:res.status});
        if(res.status>=500)throw new ProviderError(ErrorCode.SERVER,msg,{status:res.status});
        throw new ProviderError(ErrorCode.BAD_REQUEST,msg,{status:res.status});
      }

      const text=(body?.candidates?.[0]?.content?.parts||[])
        .map(p=>p.text||"")
        .join("\n")
        .trim();
      const usageMeta=body?.usageMetadata||{};
      const tokensUsed=Number(usageMeta.totalTokenCount||usageMeta.totalTokens||0)||undefined;
      return {
        text,
        usage:{
          tokensUsed,
          authoritative:Boolean(tokensUsed)
        }
      };
    }finally{
      clearTimeout(timer);
    }
  }
}
