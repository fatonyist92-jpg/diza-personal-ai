'use strict';
const $=id=>document.getElementById(id);let jobId=null,currentReport=null,connected=false,modelReady=false,realRemaining=false,pollTimer=null;
function setText(id,text){$(id).textContent=text}
async function request(url,options={}){
  const res=await fetch(url,{credentials:'same-origin',headers:{'accept':'application/json',...(options.body?{'content-type':'application/json'}:{})},cache:'no-store',...options});
  const body=await res.json().catch(()=>({error:'Invalid server response'}));
  if(!res.ok)throw Error((body.error||'HTTP '+res.status).slice(0,230));
  return body;
}
function availability(){
  $('demo').disabled=!connected||!!pollTimer;
  $('real').disabled=!connected||!modelReady||!realRemaining||!!pollTimer;
}
async function status(){
  try{
    const s=await request('/api/evolution-lab/status');
    connected=true;modelReady=s.realConfigured;realRemaining=s.realUsedToday<s.realDailyLimit;
    setText('access','✅ Terhubung ke server Bloks terautentikasi. Production chat dan data tidak dipakai untuk pengujian.');
    setText('quota','Kuota tes AI: '+s.realUsedToday+'/'+s.realDailyLimit+' hari ini');
    availability();
  }catch(e){
    connected=false;setText('access','🔒 '+e.message+'. Silakan buka Bloks dan login/pairing melalui browser yang sama.');
    setText('quota','Belum terhubung');availability();
  }
}
function renderReport(report){
  currentReport=report;
  setText('baseline',report.baseline.percent+'%');
  setText('candidate',report.candidate.percent+'%');
  setText('completed',report.sampleCount+'/10');
  setText('discussion','Architect: '+report.agents.architect+'\n\nChallenger: '+report.agents.challenger+'\n\nJudge: '+report.agents.judge);
  $('discussion').style.whiteSpace='pre-wrap';
  const tbody=$('rows');tbody.replaceChildren();
  for(const row of report.rows){
    const tr=document.createElement('tr');
    for(const [i,s] of [row.id,row.baseline.category,row.baseline.passed?'LULUS':'GAGAL',row.candidate.passed?'LULUS':'GAGAL'].entries()){
      const td=document.createElement('td');td.textContent=s;if(i>1)td.className=s==='LULUS'?'pass':'fail';tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  $('download').disabled=false;
  const reviewable=report.mode==='real'&&report.status==='PENDING_MANUAL_REVIEW';
  $('approve').disabled=!reviewable;
  $('reject').disabled=report.status!=='PENDING_MANUAL_REVIEW';
  setText('reviewState',report.mode==='demo'?'Hasil skrip DEMO, tidak memenuhi syarat untuk approval.':'Status: '+report.status);
}
function endPolling(){if(pollTimer)clearInterval(pollTimer);pollTimer=null;availability();}
async function poll(){
  if(!jobId)return;
  try{
    const d=await request('/api/evolution-lab/jobs/'+jobId);
    if(d.state==='complete'){endPolling();renderReport(d.report);setText('access','✅ Pengujian selesai. Laporan siap ditinjau.');await status();}
    else if(d.state==='failed'){endPolling();setText('access','⚠️ '+d.message);await status();}
    else setText('access','⏳ AI sedang menjalankan benchmark. Halaman tetap bisa dibuka untuk cek hasil.');
  }catch(e){endPolling();setText('access','⚠️ '+e.message);}
}
async function run(mode){
  if(!connected)return;
  const message=mode==='real'?'AI nyata memakai sekitar 23 permintaan Gemini API dan mungkin menghabiskan kuota/menimbulkan biaya provider. Lanjut?':'Jalankan simulasi sintetis offline tanpa memakai Gemini API?';
  if(!confirm(message))return;
  try{
    const d=await request('/api/evolution-lab/run',{method:'POST',body:JSON.stringify({mode,confirm:true})});
    jobId=d.id;currentReport=null;$('download').disabled=true;$('approve').disabled=true;$('reject').disabled=true;
    setText('access','⏳ Menjalankan '+(mode==='real'?'AI nyata':'demo')+'...');
    pollTimer=setInterval(poll,2500);availability();await poll();
  }catch(e){setText('access','⚠️ '+e.message);await status();}
}
async function review(action){
  if(!jobId||!currentReport||!confirm(action==='approve'?'Tandai kandidat untuk REVIEW LANJUT, bukan pemasangan ke production?':'Tolak usulan skill ini?'))return;
  try{const r=await request('/api/evolution-lab/jobs/'+jobId+'/'+action,{method:'POST',body:JSON.stringify({confirm:true})});
    setText('reviewState',r.status+' • '+r.note);$('approve').disabled=true;$('reject').disabled=true;
  }catch(e){setText('reviewState','⚠️ '+e.message);}
}
$('demo').onclick=()=>run('demo');
$('real').onclick=()=>run('real');
$('approve').onclick=()=>review('approve');
$('reject').onclick=()=>review('reject');
$('download').onclick=()=>{if(!currentReport)return;const u=URL.createObjectURL(new Blob([JSON.stringify(currentReport,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='evolution-lab-'+currentReport.id+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);};
status();
