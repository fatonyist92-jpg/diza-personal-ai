import assert from 'node:assert/strict';
import { QuotaLedger } from '../quota-ledger.mjs';
import { MeshRouter, IdempotencyStore } from '../mesh-router.mjs';
import { MockProvider, quotaFailure } from '../providers/mock-provider.mjs';
import { ProviderError, ErrorCode } from '../errors.mjs';
import { InMemoryTaskStore, BackgroundTaskEngine, TaskStatus } from '../task-engine.mjs';
import { ProviderCatalog } from '../catalog.mjs';
import { ProviderIntelMonitor, extractFreeTierFacts } from '../intel-monitor.mjs';
import { MaintenanceScheduler, MemoryMaintenanceState, latestJakartaMidnight, nextJakartaMidnight } from '../maintenance-scheduler.mjs';
import { syncLedgerFromCatalog } from '../quota-policy.mjs';
import { PersistentTaskStore, PersistentIdempotencyStore } from '../persistence.mjs';
import { CloudflareWorkersAIProvider } from '../providers/cloudflare.mjs';
import { buildProvidersFromCatalog } from '../provider-factory.mjs';
import { OpenAICompatibleProvider, parseReset } from '../providers/openai-compatible.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let now = Date.parse('2026-09-25T00:00:00Z');
const clock = () => now;
const advance = (ms) => { now += ms; };
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
function makeLedger() { return new QuotaLedger({ now: clock, reserveRatio: 0.10, freeOnly: true }); }

test('dynamic routing prefers healthier quota, not fixed first provider', async () => {
  const ledger = makeLedger();
  const a = new MockProvider({ id:'a', quality:0.95, latencyMs:100 });
  const b = new MockProvider({ id:'b', quality:0.80, latencyMs:200 });
  ledger.upsert('a','mock',{requestLimit:100,requestsUsed:88,resetAt:now+3600000});
  ledger.upsert('b','mock',{requestLimit:100,requestsUsed:10,resetAt:now+3600000});
  const out = await new MeshRouter({providers:[a,b],ledger,now:clock}).execute({requestId:'r1',input:'hello',estimatedTokens:1});
  assert.equal(out.providerId,'b');
});

test('hard Rp0 lock blocks paid provider', async () => {
  const ledger = makeLedger();
  const paid = new MockProvider({ id:'paid', billingMode:'paid', paidAllowed:true, quality:1 });
  const free = new MockProvider({ id:'free', quality:0.4 });
  ledger.upsert('paid','mock',{}); ledger.upsert('free','mock',{});
  const out = await new MeshRouter({providers:[paid,free],ledger,now:clock}).execute({requestId:'r2',input:'test',estimatedTokens:1});
  assert.equal(out.providerId,'free'); assert.equal(paid.calls.length,0);
});

test('429 automatically fails over and cooldown is recorded', async () => {
  const ledger = makeLedger(), resetAt = now + 3600000;
  const a = new MockProvider({id:'a',quality:1,behavior:async()=>quotaFailure({resetAt})});
  const b = new MockProvider({id:'b',quality:0.5});
  ledger.upsert('a','mock',{requestLimit:100,requestsUsed:0}); ledger.upsert('b','mock',{requestLimit:100,requestsUsed:0});
  const out = await new MeshRouter({providers:[a,b],ledger,now:clock}).execute({requestId:'r3',input:'hello',estimatedTokens:1});
  assert.equal(out.providerId,'b'); assert.equal(ledger.get('a','mock').cooldownUntil,resetAt);
});

test('weekly-style reset makes provider usable again', async () => {
  const ledger = makeLedger(), p = new MockProvider({id:'weekly'}), resetAt = now + 7*24*3600000;
  ledger.upsert('weekly','mock',{requestLimit:10,requestsUsed:9,resetAt});
  assert.equal(ledger.canUse(p,{estimatedTokens:1}).ok,false); advance(7*24*3600000 + 1); assert.equal(ledger.canUse(p,{estimatedTokens:1}).ok,true);
});

test('idempotency returns cached output without second provider call', async () => {
  const ledger = makeLedger(), p = new MockProvider({id:'idem'}); ledger.upsert('idem','mock',{});
  const router = new MeshRouter({providers:[p],ledger,now:clock});
  const one = await router.execute({requestId:'same',input:'x',estimatedTokens:1});
  const two = await router.execute({requestId:'same',input:'x',estimatedTokens:1});
  assert.equal(one.text,two.text); assert.equal(two.cached,true); assert.equal(p.calls.length,1);
});

test('background engine runs ordered 3-bot task and passes previous outputs', async () => {
  const ledger = makeLedger(), seen = [];
  const p = new MockProvider({id:'worker-provider',behavior:async(req)=>{seen.push(req.input);return {text:`done-${seen.length}`,usage:{tokensUsed:10}}}});
  ledger.upsert('worker-provider','mock',{requestLimit:1000,requestsUsed:0,tokenLimit:100000,tokensUsed:0});
  const router = new MeshRouter({providers:[p],ledger,now:clock}), store = new InMemoryTaskStore();
  const task = store.createTask({title:'chain',instruction:'overall',steps:[{botId:1,instruction:'A'},{botId:2,instruction:'B'},{botId:3,instruction:'C'}]});
  const engine = new BackgroundTaskEngine({store,router,now:clock,contextBuilder:async({task,step,previous})=>({input:`${task.instruction}|${step.instruction}|PREV:${previous.map(x=>x.output).join(',')}`,estimatedTokens:10})});
  await engine.runNext(); await engine.runNext(); await engine.runNext();
  assert.equal(store.get(task.id).status,TaskStatus.COMPLETED); assert.match(seen[1],/done-1/); assert.match(seen[2],/done-1,done-2/);
});

test('all compatible free quota exhausted moves task to waiting_for_quota', async () => {
  const ledger = makeLedger(), p = new MockProvider({id:'empty'}), resetAt = now + 7200000;
  ledger.upsert('empty','mock',{requestLimit:10,requestsUsed:9,resetAt});
  const router = new MeshRouter({providers:[p],ledger,now:clock}), store = new InMemoryTaskStore();
  const task = store.createTask({title:'wait',instruction:'x',steps:[{botId:1,instruction:'x'}]});
  await new BackgroundTaskEngine({store,router,now:clock}).runNext();
  assert.equal(store.get(task.id).status,TaskStatus.WAITING); assert.equal(store.get(task.id).wakeAt,resetAt);
});

test('waiting task resumes after reset and worker restart', async () => {
  const ledger = makeLedger(), p = new MockProvider({id:'resume'}), resetAt = now + 1000;
  ledger.upsert('resume','mock',{requestLimit:10,requestsUsed:9,resetAt});
  const router = new MeshRouter({providers:[p],ledger,now:clock}), store1 = new InMemoryTaskStore();
  const task = store1.createTask({title:'resume',instruction:'x',steps:[{botId:1,instruction:'x'}]});
  await new BackgroundTaskEngine({store:store1,router,now:clock,workerId:'w1'}).runNext();
  assert.equal(store1.get(task.id).status,TaskStatus.WAITING);
  const snapshot = store1.export(); advance(1001);
  const store2 = new InMemoryTaskStore(snapshot);
  await new BackgroundTaskEngine({store:store2,router,now:clock,workerId:'w2'}).runNext();
  assert.equal(store2.get(task.id).status,TaskStatus.COMPLETED);
});

test('no task means no background work', async () => {
  const ledger = makeLedger(), p = new MockProvider({id:'idle'}); ledger.upsert('idle','mock',{});
  const engine = new BackgroundTaskEngine({store:new InMemoryTaskStore(),router:new MeshRouter({providers:[p],ledger,now:clock}),now:clock});
  assert.equal(await engine.runNext(),null); assert.equal(p.calls.length,0);
});

test('bounded retry stays bounded', async () => {
  const ledger = makeLedger(), p = new MockProvider({id:'bad',behavior:async()=>{throw new ProviderError(ErrorCode.BAD_REQUEST,'bad input')}});
  ledger.upsert('bad','mock',{});
  const router = new MeshRouter({providers:[p],ledger,now:clock}), store = new InMemoryTaskStore();
  const task = store.createTask({title:'bad',instruction:'x',steps:[{botId:1,instruction:'x'}]});
  const engine = new BackgroundTaskEngine({store,router,now:clock,maxStepAttempts:2});
  await engine.runNext(); await engine.runNext();
  assert.equal(store.get(task.id).status,TaskStatus.FAILED);
});


test('free-tier parser extracts daily requests and tokens', async () => {
  const facts=extractFreeTierFacts('Free tier. No credit card. 1,000 requests per day and 200K tokens/day. OpenAI-compatible.');
  assert.equal(facts.freeStatus,'recurring');
  assert.equal(facts.requiresCard,false);
  assert.ok(facts.limits.some(x=>x.metric==='requests'&&x.value===1000&&x.period==='day'));
  assert.ok(facts.limits.some(x=>x.metric==='tokens'&&x.value===200000&&x.period==='day'));
  assert.equal(facts.openAICompatible,true);
});

test('official free-tier change can safety-disable a provider', async () => {
  const catalog=new ProviderCatalog([{
    id:'watch',name:'Watch AI',aliases:[],adapter:'custom',autoEligible:true,
    officialDocs:['https://official.test/pricing']
  }]);
  let body='Free tier. No credit card. 100 requests per day.';
  const fetcher={fetchText:async()=>body};
  const monitor=new ProviderIntelMonitor({catalog,fetcher,now:clock});
  await monitor.dailyCheck();
  assert.equal(catalog.get('watch').autoEligible,true);
  body='No free tier. Paid plans only.';
  await monitor.dailyCheck();
  assert.equal(catalog.get('watch').autoEligible,false);
  assert.equal(catalog.get('watch').disabledReason,'free-tier-safety');
});

test('provider discovery finds unknown free provider but does not auto-enable it', async () => {
  const catalog=new ProviderCatalog([{id:'known',name:'Known AI',aliases:[],officialDocs:[],autoEligible:true}]);
  const feed=['| Provider | Free Models | Card |','| --- | --- | --- |','| Known AI | free | no card |','| NewSpark AI | 4 free models | no card |'].join('\n');
  const monitor=new ProviderIntelMonitor({
    catalog,
    fetcher:{fetchText:async()=>feed},
    discoveryFeeds:[{id:'feed-a',url:'https://feed.test/a'},{id:'feed-b',url:'https://feed.test/b'}],
    now:clock
  });
  const found=await monitor.discover();
  assert.ok(found.some(x=>x.name==='NewSpark AI'));
  assert.equal(catalog.findByName('NewSpark AI'),null);
  const candidate=catalog.listCandidates().find(x=>x.name==='NewSpark AI');
  assert.ok(candidate);
  assert.equal(candidate.status,'needs_manual_verification');
  assert.ok(candidate.observedSources.length>=2);
});


test('discovery auto-verifies recurring free provider from official link but keeps it out of live catalog', async () => {
  const catalog=new ProviderCatalog([]);
  const feed=['| Provider | Free |','| --- | --- |','| [Fresh AI](https://fresh.example/pricing) | free tier |'].join('\n');
  const fetcher={fetchText:async(url)=>{
    if(url==='https://feed.test/free')return feed;
    if(url==='https://fresh.example/pricing')return 'Free tier. No credit card. OpenAI-compatible API. 500 requests per day.';
    throw new Error('unexpected url');
  }};
  const monitor=new ProviderIntelMonitor({
    catalog,fetcher,
    discoveryFeeds:[{id:'free-feed',url:'https://feed.test/free'}],
    now:clock
  });
  const found=await monitor.discover();
  const fresh=found.find(x=>x.name==='Fresh AI');
  assert.ok(fresh);
  assert.equal(fresh.status,'verified_free');
  assert.equal(fresh.pullable,true);
  assert.equal(catalog.findByName('Fresh AI'),null);
});

test('maintenance daily check flips after 00:00 WIB', async () => {
  let localNow=Date.parse('2026-09-24T16:59:00Z');
  const calls={daily:0,discover:0};
  const monitor={
    dailyCheck:async()=>{calls.daily++;return[];},
    discover:async()=>{calls.discover++;return[];}
  };
  const currentMidnight=latestJakartaMidnight(localNow);
  const state=new MemoryMaintenanceState({
    lastDailyCheckAt:currentMidnight+1000,
    lastDiscoveryAt:localNow
  });
  const scheduler=new MaintenanceScheduler({monitor,stateStore:state,now:()=>localNow});
  let report=await scheduler.runDue();
  assert.equal(report.ranDaily,false);
  localNow=nextJakartaMidnight(Date.parse('2026-09-24T16:59:00Z'))+60_000;
  report=await scheduler.runDue();
  assert.equal(report.ranDaily,true);
  assert.equal(calls.daily,1);
});

test('provider discovery is due every 48 hours', async () => {
  let localNow=Date.parse('2026-09-25T00:00:00Z');
  const calls={daily:0,discover:0};
  const monitor={
    dailyCheck:async()=>{calls.daily++;return[];},
    discover:async()=>{calls.discover++;return[];}
  };
  const state=new MemoryMaintenanceState({
    lastDailyCheckAt:localNow,
    lastDiscoveryAt:localNow
  });
  const scheduler=new MaintenanceScheduler({monitor,stateStore:state,now:()=>localNow});
  await scheduler.runDue();
  assert.equal(calls.discover,0);
  localNow+=48*60*60*1000+1;
  await scheduler.runDue();
  assert.equal(calls.discover,1);
});

test('monitored daily quota syncs into ledger with a reset calendar', async () => {
  const catalog=new ProviderCatalog([{
    id:'quota-ai',name:'Quota AI',aliases:[],defaultModel:'free-model',
    officialDocs:[],autoEligible:true,
    intel:{freeStatus:'recurring',requiresCard:false,limits:[{metric:'requests',value:100,period:'day'}]}
  }]);
  const ledger=makeLedger();
  const provider=new MockProvider({id:'quota-ai',modelId:'free-model'});
  syncLedgerFromCatalog(catalog,ledger,{now:clock,providers:[provider]});
  const row=ledger.get('quota-ai','free-model');
  assert.equal(row.requestLimit,100);
  const day=row.windows['requests:day'];
  assert.ok(day);
  assert.equal(day.limit,100);
  assert.equal(day.periodMs,24*60*60*1000);
  assert.ok(day.resetAt>now);
});

test('recurring quota window advances instead of disappearing after reset', async () => {
  const ledger=makeLedger(), p=new MockProvider({id:'cycle'});
  const period=24*60*60*1000;
  ledger.upsert('cycle','mock',{requestLimit:10,requestsUsed:9,resetAt:now+1000,periodMs:period});
  advance(1001);
  assert.equal(ledger.canUse(p,{estimatedTokens:1}).ok,true);
  assert.ok(ledger.get('cycle','mock').resetAt>now);
});

test('persistent task and idempotency state survive restart', async () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'diza-core-'));
  try{
    const taskPath=path.join(dir,'tasks.json');
    const idemPath=path.join(dir,'idem.json');
    const store1=new PersistentTaskStore(taskPath);
    const task=store1.createTask({title:'persist',instruction:'x',steps:[{botId:1,instruction:'a'}]});
    store1.mutate(task.id,t=>{t.status='running';});
    const store2=new PersistentTaskStore(taskPath);
    assert.equal(store2.get(task.id).status,'running');

    const i1=new PersistentIdempotencyStore(idemPath);
    i1.set('request-1',{text:'saved'});
    const i2=new PersistentIdempotencyStore(idemPath);
    assert.equal(i2.get('request-1').text,'saved');
  }finally{
    fs.rmSync(dir,{recursive:true,force:true});
  }
});


test('Cloudflare paid-only model is blocked before any network request', async () => {
  let networkCalls=0;
  const p=new CloudflareWorkersAIProvider({
    modelId:'@cf/zai-org/glm-5.3',
    accountId:'acct',
    apiToken:'token',
    fetchImpl:async()=>{networkCalls++;throw new Error('should not run');}
  });
  await assert.rejects(
    ()=>p.generate({input:'hello'}),
    e=>e.code===ErrorCode.PAID_REQUIRED
  );
  assert.equal(networkCalls,0);
});

test('Cloudflare daily free allocation error becomes quota reset at next UTC midnight', async () => {
  const localNow=Date.parse('2026-09-25T10:00:00Z');
  const p=new CloudflareWorkersAIProvider({
    modelId:'@cf/google/gemma-4-26b-a4b-it',
    accountId:'acct',
    apiToken:'token',
    now:()=>localNow,
    fetchImpl:async()=>({
      ok:false,status:429,
      json:async()=>({success:false,errors:[{code:3036,message:'daily allocation exhausted'}]})
    })
  });
  await assert.rejects(
    ()=>p.generate({input:'hello'}),
    e=>e.code===ErrorCode.QUOTA
      && e.resetAt===Date.parse('2026-09-26T00:00:00Z')
  );
});

test('Cloudflare factory requires explicit Workers Free confirmation', async () => {
  const catalog=new ProviderCatalog([{
    id:'cloudflare',name:'Cloudflare Workers AI',aliases:[],
    adapter:'cloudflare',
    keyEnv:'CLOUDFLARE_API_TOKEN',
    accountEnv:'CLOUDFLARE_ACCOUNT_ID',
    freePlanConfirmEnv:'CLOUDFLARE_FREE_PLAN_CONFIRMED',
    modelEnv:'CLOUDFLARE_MODEL',
    defaultModel:'@cf/google/gemma-4-26b-a4b-it',
    capabilities:['text'],
    autoEligible:true,
    enabled:true
  }]);
  const baseEnv={CLOUDFLARE_API_TOKEN:'token',CLOUDFLARE_ACCOUNT_ID:'acct'};
  assert.equal(buildProvidersFromCatalog(catalog,{env:baseEnv}).length,0);
  const providers=buildProvidersFromCatalog(catalog,{env:{...baseEnv,CLOUDFLARE_FREE_PLAN_CONFIRMED:'true'}});
  assert.equal(providers.length,1);
  assert.equal(providers[0].id,'cloudflare');
  assert.equal(providers[0].paidAllowed,false);
});

test('OpenRouter is excluded from factory when policy blocked', async () => {
  const catalog=new ProviderCatalog();
  const entry=catalog.get('openrouter');
  assert.equal(entry.policyBlocked,true);
  assert.equal(entry.autoEligible,false);
  const providers=buildProvidersFromCatalog(catalog,{env:{OPENROUTER_API_KEY:'key'}});
  assert.equal(providers.some(p=>p.id==='openrouter'),false);
});


test('human duration rate-limit reset headers are parsed correctly', async () => {
  const base=Date.parse('2026-09-25T00:00:00Z');
  assert.equal(parseReset('2m59.56s',base),base+179560);
  assert.equal(parseReset('7.66s',base),base+7660);
});

test('OpenAI-compatible adapter returns independent request and token quota windows', async () => {
  const base=Date.parse('2026-09-25T00:00:00Z');
  const headers=new Map([
    ['x-ratelimit-limit-requests','14400'],
    ['x-ratelimit-remaining-requests','14370'],
    ['x-ratelimit-reset-requests','2m'],
    ['x-ratelimit-limit-tokens','18000'],
    ['x-ratelimit-remaining-tokens','17900'],
    ['x-ratelimit-reset-tokens','7.5s']
  ]);
  const provider=new OpenAICompatibleProvider({
    id:'header-test',modelId:'model',baseUrl:'https://example.test/v1',apiKey:'k',
    rateLimitSemantics:{requests:'day',tokens:'minute'},now:()=>base,
    fetchImpl:async()=>({
      ok:true,status:200,
      headers:{get:(k)=>headers.get(k)||null},
      json:async()=>({choices:[{message:{content:'ok'}}],usage:{total_tokens:42}})
    })
  });
  const out=await provider.generate({input:'hi'});
  const rw=out.usage.quotaWindows.find(x=>x.metric==='requests');
  const tw=out.usage.quotaWindows.find(x=>x.metric==='tokens');
  assert.equal(rw.limit,14400);assert.equal(rw.remaining,14370);assert.equal(rw.period,'day');
  assert.equal(tw.limit,18000);assert.equal(tw.remaining,17900);assert.equal(tw.period,'minute');
  assert.equal(tw.resetAt,base+7500);
});

test('multi-window ledger blocks exhausted TPM while daily request quota is healthy', async () => {
  const ledger=makeLedger();
  const p=new MockProvider({id:'multi',modelId:'m'});
  ledger.upsert('multi','m',{quotaWindows:[
    {metric:'requests',period:'day',limit:1000,remaining:900,resetAt:now+86400000,authoritative:true},
    {metric:'tokens',period:'minute',limit:10000,remaining:500,resetAt:now+60000,authoritative:true}
  ]});
  const check=ledger.canUse(p,{estimatedTokens:1000});
  assert.equal(check.ok,false);
  assert.equal(check.reason,'tokens_reserve');
  assert.equal(check.nextAt,now+60000);
});

test('Groq and Gemini require explicit free-tier account confirmation before routing', async () => {
  const catalog=new ProviderCatalog();
  const env={
    GROQ_API_KEY:'g',
    GEMINI_API_KEY:'x'
  };
  let providers=buildProvidersFromCatalog(catalog,{env});
  assert.equal(providers.some(p=>p.id==='groq'),false);
  assert.equal(providers.some(p=>p.id==='gemini'),false);
  providers=buildProvidersFromCatalog(catalog,{env:{
    ...env,
    GROQ_FREE_PLAN_CONFIRMED:'true',
    GEMINI_FREE_TIER_CONFIRMED:'true'
  }});
  assert.equal(providers.some(p=>p.id==='groq'),true);
  assert.equal(providers.some(p=>p.id==='gemini'),true);
});

test('trial and evaluation providers require explicit opt-in plus confirmation', async () => {
  const catalog=new ProviderCatalog();
  let providers=buildProvidersFromCatalog(catalog,{env:{
    CEREBRAS_API_KEY:'c',
    NVIDIA_API_KEY:'n'
  }});
  assert.equal(providers.some(p=>p.id==='cerebras'),false);
  assert.equal(providers.some(p=>p.id==='nvidia'),false);

  providers=buildProvidersFromCatalog(catalog,{env:{
    CEREBRAS_API_KEY:'c',
    CEREBRAS_FREE_TRIAL_CONFIRMED:'true',
    DIZA_ENABLE_CEREBRAS_TRIAL:'true',
    NVIDIA_API_KEY:'n',
    NVIDIA_DEVELOPER_PROGRAM_CONFIRMED:'true',
    DIZA_ENABLE_NVIDIA_DEV:'true'
  }});
  assert.equal(providers.some(p=>p.id==='cerebras'),true);
  assert.equal(providers.some(p=>p.id==='nvidia'),true);
});


test('explicitly enabled reserve provider remains usable after ledger policy sync', async () => {
  const catalog=new ProviderCatalog();
  const env={
    CEREBRAS_API_KEY:'c',
    CEREBRAS_FREE_TRIAL_CONFIRMED:'true',
    DIZA_ENABLE_CEREBRAS_TRIAL:'true'
  };
  const providers=buildProvidersFromCatalog(catalog,{env});
  const cerebras=providers.find(p=>p.id==='cerebras');
  assert.ok(cerebras);
  const ledger=makeLedger();
  syncLedgerFromCatalog(catalog,ledger,{now:clock,providers});
  assert.equal(ledger.get('cerebras',cerebras.modelId).disabled,false);
  assert.equal(ledger.canUse(cerebras,{estimatedTokens:10}).ok,true);
});


test('task provider-call budget counts actual failover attempts', async () => {
  const ledger=makeLedger();
  const a=new MockProvider({id:'attempt-a',quality:1,behavior:async()=>{throw new ProviderError(ErrorCode.SERVER,'down')}});
  const b=new MockProvider({id:'attempt-b',quality:0.5,behavior:async()=>({text:'fallback-ok',usage:{}})});
  ledger.upsert('attempt-a','mock',{});ledger.upsert('attempt-b','mock',{});
  const router=new MeshRouter({providers:[a,b],ledger,now:clock});
  const store=new InMemoryTaskStore();
  const task=store.createTask({title:'attempts',instruction:'x',maxProviderCalls:4,steps:[{botId:1,instruction:'x'}]});
  const engine=new BackgroundTaskEngine({store,router,now:clock});
  await engine.runNext();
  assert.equal(store.get(task.id).status,TaskStatus.COMPLETED);
  assert.equal(store.get(task.id).providerCalls,2);
});

test('task maxProviderCalls limits router failover attempts exactly', async () => {
  const ledger=makeLedger();
  const reset=now+60000;
  const a=new MockProvider({id:'budget-a',quality:1,behavior:async()=>quotaFailure({resetAt:reset})});
  const b=new MockProvider({id:'budget-b',quality:0.5,behavior:async()=>({text:'should-not-run',usage:{}})});
  ledger.upsert('budget-a','mock',{});ledger.upsert('budget-b','mock',{});
  const router=new MeshRouter({providers:[a,b],ledger,now:clock});
  const store=new InMemoryTaskStore();
  const task=store.createTask({title:'budget',instruction:'x',maxProviderCalls:1,steps:[{botId:1,instruction:'x'}]});
  const engine=new BackgroundTaskEngine({store,router,now:clock});
  await engine.runNext();
  assert.equal(store.get(task.id).providerCalls,1);
  assert.equal(b.calls.length,0);
});

test('stable task-step idempotency completes after simulated crash without second provider call', async () => {
  const ledger=makeLedger();
  const p=new MockProvider({id:'crash-safe'});
  ledger.upsert('crash-safe','mock',{});
  const idem=new IdempotencyStore();
  idem.set('task:1:step:1',{
    providerId:'crash-safe',modelId:'mock',text:'already-finished',usage:{},
    attempts:[{providerId:'crash-safe',ok:true}]
  });
  const router=new MeshRouter({providers:[p],ledger,idempotency:idem,now:clock});
  const store=new InMemoryTaskStore();
  const task=store.createTask({title:'recover',instruction:'x',steps:[{botId:1,instruction:'x'}]});
  assert.equal(task.id,1);
  const engine=new BackgroundTaskEngine({store,router,now:clock});
  await engine.runNext();
  assert.equal(store.get(task.id).status,TaskStatus.COMPLETED);
  assert.equal(store.get(task.id).steps[0].output,'already-finished');
  assert.equal(p.calls.length,0);
  assert.equal(store.get(task.id).providerCalls,0);
});

test('user cancellation prevents queued bot work', async () => {
  const ledger=makeLedger(),p=new MockProvider({id:'cancel'});
  ledger.upsert('cancel','mock',{});
  const router=new MeshRouter({providers:[p],ledger,now:clock}),store=new InMemoryTaskStore();
  const task=store.createTask({title:'cancel',instruction:'x',steps:[{botId:1,instruction:'x'},{botId:2,instruction:'y'}]});
  const engine=new BackgroundTaskEngine({store,router,now:clock});
  engine.cancelTask(task.id);
  assert.equal(store.get(task.id).status,TaskStatus.CANCELLED);
  assert.equal(await engine.runNext(),null);
  assert.equal(p.calls.length,0);
});

test('active runtime budget is enforced after a slow provider call', async () => {
  const ledger=makeLedger();
  const p=new MockProvider({id:'slow',behavior:async()=>{advance(2000);return {text:'late',usage:{}}}});
  ledger.upsert('slow','mock',{});
  const router=new MeshRouter({providers:[p],ledger,now:clock}),store=new InMemoryTaskStore();
  const task=store.createTask({title:'runtime',instruction:'x',maxRuntimeMs:1000,steps:[{botId:1,instruction:'x'}]});
  const engine=new BackgroundTaskEngine({store,router,now:clock});
  await engine.runNext();
  assert.equal(store.get(task.id).status,TaskStatus.FAILED);
  assert.match(store.get(task.id).error,/runtime budget/i);
});

let passed=0;
for (const [name,fn] of tests) { try { await fn(); console.log(`✓ ${name}`); passed++; } catch (e) { console.error(`✗ ${name}`); console.error(e); process.exitCode=1; } }
console.log(`\n${passed}/${tests.length} tests passed`);
if (passed !== tests.length) process.exit(1);
