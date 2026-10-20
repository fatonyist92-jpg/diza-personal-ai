// Project X: sandboxed owner-only experimental HTTP adapter.
// Imported ONLY after Bloks's remote-pairing + caller checks in server/index.ts.
// Never touches chat, agents, existing settings, or the production UI.
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runLab, reviewReport } from './lab.mjs';

const jobs = new Map();
let active = null;
const MAX_JOBS = 12;
const MAX_REAL_RUNS_PER_UTC_DAY = 1;
const REPORT_DIR = process.env.EVOLUTION_LAB_REPORT_DIR || '/home/node/.bloks/evolution-lab/reports';
const VERSION = '0.2.0';

function respond(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options':'nosniff' });
  res.end(JSON.stringify(value));
}
function readJson(req, max=4096) {
  return new Promise((resolve,reject)=>{
    const chunks=[];let n=0;
    req.on('data',c=>{n+=c.length;if(n>max){req.destroy();reject(Error('payload too large'));return;}chunks.push(c);});
    req.on('end',()=>{try{resolve(chunks.length?JSON.parse(Buffer.concat(chunks).toString('utf8')):{})}catch{reject(Error('invalid JSON'))}});
    req.on('error',reject);
  });
}
function publicJob(job) {
  return {id:job.id, mode:job.mode, state:job.state, createdAt:job.createdAt, finishedAt:job.finishedAt||null, message:job.message||null, report:job.report||null};
}
function dayBucket(now) {return new Date(now).toISOString().slice(0,10);}
function todayRealCount() {
  const today=dayBucket(Date.now());
  let count=Array.from(jobs.values()).filter(j=>j.mode==='real'&&dayBucket(j.createdAt)===today).length;
  try{
    for(const file of readdirSync(REPORT_DIR).filter(x=>x.endsWith('.json')).slice(-100)){
      const j=JSON.parse(readFileSync(join(REPORT_DIR,file),'utf8'));
      if(j.mode==='real'&&j.createdAt?.slice(0,10)===today&&!jobs.has(j.id))count++;
    }
  }catch{}
  return count;
}
function latestJobs() {
  const live=Array.from(jobs.values()).map(publicJob);
  const known=new Set(live.map(j=>j.id));
  try {
    const files=readdirSync(REPORT_DIR).filter(x=>/^[a-f0-9-]{36}\\.json$/.test(x)).slice(-100);
    for(const file of files){
      const obj=JSON.parse(readFileSync(join(REPORT_DIR,file),'utf8'));
      if(!known.has(obj.id)){
        live.push({id:obj.id,mode:obj.mode,state:'complete',createdAt:obj.createdAt,
          finishedAt:obj.reviewedAt||obj.createdAt,message:'Stored report',report:obj});
      }
    }
  }catch{}
  return live.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,5);
}
function recordJob(job) {
  jobs.set(job.id,job);
  if(jobs.size>MAX_JOBS) {
    for(const [id,j] of jobs) {if(j.state!=='running'&&j.state!=='queued'){jobs.delete(id);break;}}
  }
}
function resolveReport(id) {
  if(!/^[a-f0-9-]{36}$/.test(id))return null;
  try{return JSON.parse(readFileSync(join(REPORT_DIR,id+'.json'),'utf8'))}catch{return null}
}
export async function handleEvolutionApi(req,res,method,pathname) {
  if(method==='GET'&&pathname==='/api/evolution-lab/status') {
    return respond(res,200,{version:VERSION, enabled:true, realConfigured:!!process.env.GEMINI_API_KEY?.trim(),
      active:!!active, realUsedToday:todayRealCount(), realDailyLimit:MAX_REAL_RUNS_PER_UTC_DAY,
      latest:latestJobs()});
  }
  if(method==='POST'&&pathname==='/api/evolution-lab/run'){
    let input;
    try {input=await readJson(req)} catch {return respond(res,400,{error:'Invalid request data'});}
    if(!input||!['demo','real'].includes(input.mode)||input.confirm!==true) return respond(res,400,{error:'Mode and explicit confirmation required'});
    if(active)return respond(res,429,{error:'Another experiment is already running'});
    if(input.mode==='real'&&!process.env.GEMINI_API_KEY?.trim())return respond(res,409,{error:'Gemini API key is not configured on this server'});
    if(input.mode==='real'&&todayRealCount()>=MAX_REAL_RUNS_PER_UTC_DAY)return respond(res,429,{error:'Daily real-run quota reached; avoid unexpected API costs'});
    const id=randomUUID();
    const job={id,mode:input.mode,state:'queued',createdAt:new Date().toISOString(),message:'Queued',report:null};
    recordJob(job);
    active=id;job.state='running';job.message='Comparing baseline and candidate...';
    void (async()=>{
      try{
        const result=await runLab({mode:job.mode,limit:10,persist:false});
        // API job ID becomes report ID, so refresh/review are stable.
        result.id=id;
        result.createdAt=job.createdAt;
        result.status='PENDING_MANUAL_REVIEW';
        mkdirSync(REPORT_DIR,{recursive:true,mode:0o700});
        writeFileSync(join(REPORT_DIR,id+'.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
        job.report=result;job.state='complete';job.message='Run complete, pending manual review';
      }catch(e){
        job.state='failed';
        const message=e instanceof Error?e.message:String(e);
        // Never include any supplied key, prompt, or backend request body.
        job.message=/quota|429/i.test(message)?'Model quota exhausted':'Experiment failed; consult model availability and server configuration';
      }finally{job.finishedAt=new Date().toISOString();active=null;}
    })();
    return respond(res,202,{id,mode:job.mode,state:job.state});
  }
  const match=pathname.match(/^\/api\/evolution-lab\/jobs\/([a-f0-9-]{36})(?:\/(approve|reject))?$/);
  if(match){
    const id=match[1],action=match[2];
    if(method==='GET'&&!action){
      const job=jobs.get(id);
      if(job)return respond(res,200,publicJob(job));
      const report=resolveReport(id);
      return report?respond(res,200,{id,mode:report.mode,state:'complete',report}):respond(res,404,{error:'Experiment report not found'});
    }
    if(method==='POST'&&action){
      const old=resolveReport(id);
      if(!old)return respond(res,404,{error:'No completed report'});
      let input;
      try{input=await readJson(req)}catch{return respond(res,400,{error:'Invalid request'});}
      if(!input||input.confirm!==true)return respond(res,400,{error:'Explicit manual confirmation required'});
      try{
        const result=reviewReport(id,action,true);
        const job=jobs.get(id);
        if(job)job.report=result;
        return respond(res,200,{status:result.status,approved:result.approved,note:'No skill installed, no Railway code or Bloks settings modified'});
      }catch(e){
        return respond(res,409,{error:e instanceof Error?e.message:'Review refused'});
      }
    }
  }
  return respond(res,404,{error:'Lab route not found'});
}