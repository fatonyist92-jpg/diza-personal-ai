import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

const dir=mkdtempSync(join(tmpdir(),'evolution-api-test-'));
process.env.EVOLUTION_LAB_REPORT_DIR=dir;
delete process.env.GEMINI_API_KEY;
const { handleEvolutionApi }=await import('./evolution-lab-api.mjs');

async function invoke(method,path,body){
  const req=Readable.from(body===undefined?[]:[Buffer.from(JSON.stringify(body))]);
  const res={
    code:null, data:'',
    writeHead(code,headers){this.code=code;this.headers=headers;return this;},
    end(x){this.data=x;},
  };
  await handleEvolutionApi(req,res,method,path);
  return {code:res.code,body:JSON.parse(res.data),headers:res.headers};
}
async function eventually(path){
  for(let i=0;i<40;i++){
    const d=await invoke('GET',path);
    if(d.body.state==='complete'||d.body.state==='failed')return d;
    await new Promise(r=>setTimeout(r,20));
  }
  throw Error('Lab completion timed out');
}

test('status is bounded and no API key is exposed',async()=>{
  const s=await invoke('GET','/api/evolution-lab/status');
  assert.equal(s.code,200);
  assert.equal(s.body.realConfigured,false);
  assert.equal(s.headers['cache-control'],'no-store');
  assert.equal(JSON.stringify(s.body).includes('GEMINI_API_KEY'),false);
});

test('request validation rejects unconfirmed or unauthorized AI mode',async()=>{
  assert.equal((await invoke('POST','/api/evolution-lab/run',{mode:'real',confirm:false})).code,400);
  assert.equal((await invoke('POST','/api/evolution-lab/run',{mode:'real',confirm:true})).code,409);
  assert.equal((await invoke('POST','/api/evolution-lab/run',{mode:'demo',confirm:false})).code,400);
  assert.equal((await invoke('GET','/api/evolution-lab/jobs/../../etc/passwd')).code,404);
});

test('real 10-case scripted demo persists in isolated reports, rejects approval, accepts rejection',async()=>{
  const made=await invoke('POST','/api/evolution-lab/run',{mode:'demo',confirm:true});
  assert.equal(made.code,202);
  const id=made.body.id;
  assert.match(id,/^[a-f0-9-]{36}$/);
  const done=await eventually('/api/evolution-lab/jobs/'+id);
  assert.equal(done.code,200);
  assert.equal(done.body.state,'complete');
  assert.equal(done.body.report.baseline.passed,7);
  assert.equal(done.body.report.candidate.passed,9);
  assert.equal(done.body.report.mode,'demo');
  assert.equal(readdirSync(dir).filter(f=>f.endsWith('.json')).length,1);
  const no=await invoke('POST','/api/evolution-lab/jobs/'+id+'/approve',{confirm:true});
  assert.equal(no.code,409);
  assert.match(no.body.error,/not eligible/i);
  const reject=await invoke('POST','/api/evolution-lab/jobs/'+id+'/reject',{confirm:true});
  assert.equal(reject.code,200);
  assert.equal(reject.body.approved,false);
  assert.equal(reject.body.status,'REJECTED');
  assert.equal((await invoke('POST','/api/evolution-lab/jobs/'+id+'/reject',{confirm:true})).code,409);
});

test('unknown routes return 404',async()=>{
  assert.equal((await invoke('GET','/api/evolution-lab/nonexistent')).code,404);
});

process.on('exit',()=>{try{rmSync(dir,{recursive:true,force:true})}catch{}});
