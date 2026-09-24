import { OpenAICompatibleProvider } from "./providers/openai-compatible.mjs";
import { GeminiProvider } from "./providers/gemini.mjs";

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
    }
  }
  return out;
}
