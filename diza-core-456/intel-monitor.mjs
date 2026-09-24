import crypto from "node:crypto";
import { DISCOVERY_FEEDS } from "./catalog.mjs";

function stripHtml(input){
  return String(input||"")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/\s+/g," ")
    .trim();
}
function normalize(input){return stripHtml(input).toLowerCase();}
function hash(input){return crypto.createHash("sha256").update(String(input)).digest("hex");}
function parseNumber(s){
  const raw=String(s||"").toLowerCase().replace(/,/g,"").trim();
  const m=raw.match(/^([0-9]+(?:\.[0-9]+)?)(k|m|b|thousand|million|billion)?$/);
  if(!m)return null;
  const n=Number(m[1]),u=m[2];
  const mult=u==="k"||u==="thousand"?1e3:u==="m"||u==="million"?1e6:u==="b"||u==="billion"?1e9:1;
  return Math.round(n*mult);
}
function uniqueLimits(list){
  const seen=new Set();
  return list.filter(x=>{
    const k=x.metric+":"+x.value+":"+x.period;
    if(seen.has(k))return false;
    seen.add(k);
    return true;
  });
}

export function extractFreeTierFacts(raw){
  const text=normalize(raw);
  let freeStatus="unknown";
  const recurring=/free tier|free plan|always free|free forever|\$0(?:\D|$)|no credit card|free api endpoint|free mode/.test(text);
  const notFree=/no free tier|free tier (?:is )?(?:retired|removed|ended|discontinued)|free plan (?:is )?(?:retired|removed|ended|discontinued)/.test(text);
  const trial=/free trial|trial key|trial credits|signup credits|sign-up credits/.test(text);
  if(notFree)freeStatus="not_free";
  else if(recurring)freeStatus="recurring";
  else if(trial)freeStatus="trial";

  let requiresCard=null;
  if(/no credit card|without (?:a )?credit card|card not required/.test(text))requiresCard=false;
  if(/credit card required|payment method required|requires (?:a )?(?:credit card|payment method)/.test(text))requiresCard=true;

  const limits=[];
  const period="minute|hour|day|week|month";
  const patterns=[
    {metric:"requests",re:new RegExp("([0-9][0-9,.]*(?:\\s*(?:k|m|b|thousand|million|billion))?)\\s*(?:requests?|req(?:uests?)?)\\s*(?:per|/)\\s*("+period+")","gi")},
    {metric:"tokens",re:new RegExp("([0-9][0-9,.]*(?:\\s*(?:k|m|b|thousand|million|billion))?)\\s*tokens?\\s*(?:per|/)\\s*("+period+")","gi")},
    {metric:"credits",re:new RegExp("\\$\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(?:of\\s+)?(?:free\\s+)?credits?\\s*(?:per|/)\\s*("+period+")","gi")},
    {metric:"neurons",re:new RegExp("([0-9][0-9,.]*(?:\\s*(?:k|m|b|thousand|million|billion))?)\\s*neurons?\\s*(?:per|/)\\s*("+period+")","gi")},
  ];
  for(const p of patterns){
    let m;
    while((m=p.re.exec(text))){
      const value=p.metric==="credits"?Number(m[1]):parseNumber(m[1].replace(/\s+/g,""));
      if(Number.isFinite(value))limits.push({metric:p.metric,value,period:m[2]});
    }
  }

  const openAICompatible=/openai[- ]compatible|compatible with (?:the )?openai api|\/v1\/chat\/completions/.test(text);
  const zeroSpendSafe=/spending limit|usage limit|free quota only|will stop|stops when.*quota|no automatic charge/.test(text);
  return {freeStatus,requiresCard,limits:uniqueLimits(limits),openAICompatible,zeroSpendSafe};
}

export class DefaultTextFetcher {
  constructor({timeoutMs=20000,userAgent="DizaBotAgent-FreeTier-Monitor/1.0"}={}){
    this.timeoutMs=timeoutMs;
    this.userAgent=userAgent;
  }
  async fetchText(url){
    const c=new AbortController();
    const timer=setTimeout(()=>c.abort(),this.timeoutMs);
    try{
      const r=await fetch(url,{
        headers:{
          "user-agent":this.userAgent,
          "accept":"text/html,text/plain,application/json;q=0.9,*/*;q=0.8"
        },
        signal:c.signal
      });
      if(!r.ok)throw new Error("HTTP "+r.status+" for "+url);
      return await r.text();
    }finally{
      clearTimeout(timer);
    }
  }
}

function cleanProviderName(cell){
  return String(cell||"")
    .replace(/!\[[^\]]*\]\([^)]*\)/g,"")
    .replace(/\[([^\]]+)\]\([^)]*\)/g,"$1")
    .replace(/[*_\`#]/g,"")
    .replace(/<[^>]+>/g,"")
    .trim();
}
function rowLinks(row){
  return [...String(row).matchAll(/\[[^\]]+\]\((https?:\/\/[^)]+)\)/g)].map(m=>m[1]);
}
export function extractDiscoveryCandidates(raw,sourceId){
  const out=[];
  const lines=String(raw||"").split(/\r?\n/);
  for(const line of lines){
    if(!line.trim().startsWith("|"))continue;
    const cells=line.split("|").slice(1,-1).map(x=>x.trim());
    if(cells.length<2)continue;
    const name=cleanProviderName(cells[0]);
    if(!name||/^(provider|platform|name|---|:--)/i.test(name)||name.length>80)continue;
    const row=line.toLowerCase();
    if(!/(free|\$0|no card|registration|phone verification|trial)/.test(row))continue;
    out.push({
      name,
      observedSources:[sourceId],
      links:rowLinks(line),
      confidence:0.52
    });
  }
  return out;
}

function stableFacts(f){
  return JSON.stringify({
    freeStatus:f.freeStatus,
    requiresCard:f.requiresCard,
    limits:f.limits,
    openAICompatible:f.openAICompatible,
    zeroSpendSafe:f.zeroSpendSafe
  });
}

export class ProviderIntelMonitor {
  constructor({catalog,fetcher=new DefaultTextFetcher(),discoveryFeeds=DISCOVERY_FEEDS,now=()=>Date.now()}={}){
    this.catalog=catalog;
    this.fetcher=fetcher;
    this.discoveryFeeds=discoveryFeeds;
    this.now=now;
  }

  async dailyCheck(){
    const results=[];
    for(const provider of this.catalog.list()){
      const urls=provider.officialDocs||[];
      let success=null;
      let lastError=null;
      for(const url of urls){
        try{
          const raw=await this.fetcher.fetchText(url);
          const normalized=normalize(raw);
          const fingerprint=hash(normalized);
          const facts=extractFreeTierFacts(raw);
          success={url,fingerprint,facts};
          break;
        }catch(e){
          lastError=e;
        }
      }
      if(!success){
        this.catalog.addEvent({
          type:"intel_check_failed",
          providerId:provider.id,
          error:String(lastError?.message||lastError||"no source")
        });
        results.push({providerId:provider.id,ok:false});
        continue;
      }

      const prev=provider.intel||null;
      const changed=!prev||prev.fingerprint!==success.fingerprint||stableFacts(prev)!==stableFacts(success.facts);
      this.catalog.applyIntel(provider.id,success.facts,{
        sourceUrl:success.url,
        fingerprint:success.fingerprint,
        checkedAt:this.now()
      });
      if(changed){
        this.catalog.addEvent({
          type:prev?"free_tier_changed":"free_tier_baseline",
          providerId:provider.id,
          previous:prev?{
            freeStatus:prev.freeStatus,
            requiresCard:prev.requiresCard,
            limits:prev.limits
          }:null,
          current:success.facts,
          sourceUrl:success.url,
        });
      }
      results.push({providerId:provider.id,ok:true,changed,facts:success.facts});
    }
    return results;
  }

  async discover(){
    const seen=[];
    for(const feed of this.discoveryFeeds){
      try{
        const raw=await this.fetcher.fetchText(feed.url);
        for(const candidate of extractDiscoveryCandidates(raw,feed.id)){
          if(this.catalog.findByName(candidate.name))continue;
          const saved=this.catalog.upsertCandidate(candidate);
          seen.push(saved);
        }
      }catch(e){
        this.catalog.addEvent({
          type:"discovery_feed_failed",
          feedId:feed.id,
          error:String(e?.message||e)
        });
      }
    }
    const unique=[...new Map(seen.map(c=>[c.id,c])).values()];
    for(const c of unique){
      this.catalog.addEvent({
        type:"new_provider_candidate",
        candidateId:c.id,
        name:c.name,
        confidence:c.confidence,
        observedSources:c.observedSources
      });
    }
    return unique;
  }

  async verifyCandidate(candidate){
    const links=(candidate.links||[]).filter(
      u=>!/(github\.com|raw\.githubusercontent\.com|freellmapi\.co)/i.test(u)
    );
    for(const url of links.slice(0,4)){
      try{
        const raw=await this.fetcher.fetchText(url);
        const facts=extractFreeTierFacts(raw);
        if(facts.freeStatus==="recurring"){
          return {
            ...candidate,
            status:"verified_free",
            officialUrl:url,
            facts,
            pullable:facts.openAICompatible
          };
        }
      }catch{}
    }
    return {
      ...candidate,
      status:"needs_manual_verification",
      pullable:false
    };
  }
}
