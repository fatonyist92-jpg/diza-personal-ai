import assert from 'node:assert/strict';
import { QuotaLedger } from '../quota-ledger.mjs';
import { MeshRouter } from '../mesh-router.mjs';
import { MockProvider, quotaFailure } from '../providers/mock-provider.mjs';
import { ProviderError, ErrorCode } from '../errors.mjs';
import { InMemoryTaskStore, BackgroundTaskEngine, TaskStatus } from '../task-engine.mjs';
import { ProviderCatalog } from '../catalog.mjs';
import { ProviderIntelMonitor, extractFreeTierFacts } from '../intel-monitor.mjs';
import { MaintenanceScheduler, MemoryMaintenanceState, latestJakartaMidnight, nextJakartaMidnight } from '../maintenance-scheduler.mjs';
import { syncLedgerFromCatalog } from '../quota-policy.mjs';
import { PersistentTaskStore, PersistentIdempotencyStore } from '../persistence.mjs';
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
  const feed='| Provider | Free Models | Card |\\n| --- | --- | --- |\\n| Known AI | free | no card |\\n| NewSpark AI | 4 free models | no card |';
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
  assert.equal(candidate.status,'candidate');
  assert.ok(candidate.observedSources.length>=2);
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
  assert.equal(row.quotaType,'day');
  assert.equal(row.periodMs,24*60*60*1000);
  assert.ok(row.resetAt>now);
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

let passed=0;
for (const [name,fn] of tests) { try { await fn(); console.log(`✓ ${name}`); passed++; } catch (e) { console.error(`✗ ${name}`); console.error(e); process.exitCode=1; } }
console.log(`\n${passed}/${tests.length} tests passed`);
if (passed !== tests.length) process.exit(1);
