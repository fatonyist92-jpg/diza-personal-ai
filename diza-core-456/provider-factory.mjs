import { OpenAICompatibleProvider } from "./providers/openai-compatible.mjs";
import { GeminiProvider } from "./providers/gemini.mjs";
import { CloudflareWorkersAIProvider } from "./providers/cloudflare.mjs";
import { CohereTrialProvider } from "./providers/cohere.mjs";

export function buildProvidersFromCatalog(catalog,{env=process.env,includeIds=null}={}){
  const out=[];
  for(const entry of catalog.list()){
    if(includeIds&&!includeIds.includes(entry.id))continue;
    if(entry.enabled===false||entry.autoEligible===false)continue;

    const key=entry.keyEnv?env[entry.keyEnv]:null;
    if(!key)continue;
    const modelId=(entry.modelEnv&&env[entry.modelEnv])||entry.defaultModel;
    if(!modelId)continue;

    if(entry.adapter==="openai-compatible"){
      out.push(new OpenAICompatibleProvider({
        id:entry.id,
        modelId,
        baseUrl:entry.baseUrl,
        apiKey:key,
        capabilities:entry.capabilities||["text"],
        billingMode:"free_only",
        paidAllowed:false,
        contextWindow:entry.contextWindow||128000,
      }));
    }else if(entry.adapter==="gemini"){
      out.push(new GeminiProvider({
        id:entry.id,
        modelId,
        apiKey:key,
        capabilities:entry.capabilities||["text"],
        contextWindow:entry.contextWindow||1000000,
      }));
    }else if(entry.adapter==="cloudflare"){
      const accountId=entry.accountEnv?env[entry.accountEnv]:null;
      const freeConfirmed=entry.freePlanConfirmEnv
        ? String(env[entry.freePlanConfirmEnv]||"").toLowerCase()==="true"
        : false;
      if(!accountId||!freeConfirmed)continue;
      out.push(new CloudflareWorkersAIProvider({
        id:entry.id,
        modelId,
        accountId,
        apiToken:key,
        capabilities:entry.capabilities||["text"],
        contextWindow:entry.contextWindow||128000,
      }));
    }else if(entry.adapter==="cohere-trial"){
      const trialConfirmed=entry.trialConfirmEnv
        ? String(env[entry.trialConfirmEnv]||"").toLowerCase()==="true"
        : false;
      if(!trialConfirmed)continue;
      out.push(new CohereTrialProvider({
        id:entry.id,
        modelId,
        apiKey:key,
        capabilities:entry.capabilities||["text"],
        contextWindow:entry.contextWindow||128000,
      }));
    }
  }
  return out;
}
