import { ProviderError, ErrorCode } from "../errors.mjs";

export const CLOUDFLARE_PAID_ONLY_MODELS = new Set([
  "@cf/moonshotai/kimi-k2.6",
  "@cf/moonshotai/kimi-k2.7-code",
  "@cf/zai-org/glm-5.2",
  "@cf/zai-org/glm-5.3",
  "@cf/zai-org/glm-5.3-flash",
  "@cf/deepseek-ai/deepseek-v4-flash-0731",
  "@cf/deepseek-ai/deepseek-v4-pro-0813",
]);

function nextUtcMidnight(now=Date.now()){
  const d=new Date(now);
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1,0,0,0,0);
}
function internalCode(body){
  const rows=Array.isArray(body?.errors)?body.errors:[];
  for(const e of rows){
    const n=Number(e?.code);
    if(Number.isFinite(n))return n;
  }
  const n=Number(body?.code);
  return Number.isFinite(n)?n:null;
}
function extractText(body){
  const r=body?.result;
  if(typeof r==="string")return r;
  if(typeof r?.response==="string")return r.response;
  if(typeof r?.text==="string")return r.text;
  if(Array.isArray(r?.choices)){
    return r.choices.map(x=>x?.message?.content||x?.text||"").filter(Boolean).join("\n");
  }
  return "";
}

export class CloudflareWorkersAIProvider {
  constructor({
    id="cloudflare",
    modelId="@cf/google/gemma-4-26b-a4b-it",
    accountId,
    apiToken,
    capabilities=["text","coding"],
    timeoutMs=60000,
    quality=0.80,
    latencyMs=1300,
    contextWindow=128000,
    now=()=>Date.now(),
    fetchImpl=globalThis.fetch
  }={}){
    Object.assign(this,{id,modelId,accountId,apiToken,timeoutMs,quality,latencyMs,contextWindow,now,fetchImpl});
    this.capabilities=new Set(capabilities);
    this.billingMode="free_only";
    this.paidAllowed=false;
  }

  supports(requirements={}){
    return (requirements.capabilities||["text"]).every(c=>this.capabilities.has(c));
  }

  assertFreeModel(){
    if(CLOUDFLARE_PAID_ONLY_MODELS.has(this.modelId)){
      throw new ProviderError(
        ErrorCode.PAID_REQUIRED,
        "Cloudflare model requires Workers Paid plan",
        {status:403,details:{modelId:this.modelId}}
      );
    }
  }

  async generate(request){
    this.assertFreeModel();
    if(!this.accountId||!this.apiToken){
      throw new ProviderError(ErrorCode.AUTH,"Cloudflare Account ID/API token missing");
    }

    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try{
      const url="https://api.cloudflare.com/client/v4/accounts/"
        +encodeURIComponent(this.accountId)
        +"/ai/run/"
        +this.modelId;

      const messages=request.messages||[
        {role:"user",content:request.input||""}
      ];
      const res=await this.fetchImpl(url,{
        method:"POST",
        signal:controller.signal,
        headers:{
          authorization:"Bearer "+this.apiToken,
          "content-type":"application/json"
        },
        body:JSON.stringify({
          messages,
          temperature:request.temperature??0.2
        })
      });
      const body=await res.json().catch(()=>({}));
      const code=internalCode(body);
      const msg=body?.errors?.[0]?.message||body?.message||("HTTP "+res.status);

      if(!res.ok||body?.success===false){
        if(res.status===403&&code===5035){
          throw new ProviderError(ErrorCode.PAID_REQUIRED,msg,{
            status:403,details:{internalCode:code,modelId:this.modelId}
          });
        }
        if(res.status===429&&code===3036){
          throw new ProviderError(ErrorCode.QUOTA,msg,{
            status:429,
            resetAt:nextUtcMidnight(this.now()),
            details:{internalCode:code}
          });
        }
        if(res.status===429&&code===3040){
          throw new ProviderError(ErrorCode.SERVER,msg,{
            status:429,
            retryAfterMs:30000,
            details:{internalCode:code}
          });
        }
        if(res.status===408||code===3007||code===3008){
          throw new ProviderError(ErrorCode.TIMEOUT,msg,{
            status:res.status,details:{internalCode:code}
          });
        }
        if(res.status===401||res.status===403){
          throw new ProviderError(ErrorCode.AUTH,msg,{
            status:res.status,details:{internalCode:code}
          });
        }
        if(res.status>=500){
          throw new ProviderError(ErrorCode.SERVER,msg,{
            status:res.status,details:{internalCode:code}
          });
        }
        throw new ProviderError(ErrorCode.BAD_REQUEST,msg,{
          status:res.status,details:{internalCode:code}
        });
      }

      return {
        text:extractText(body),
        usage:{
          quotaType:"day",
          resetAt:nextUtcMidnight(this.now()),
          authoritative:false
        }
      };
    }finally{
      clearTimeout(timer);
    }
  }
}
