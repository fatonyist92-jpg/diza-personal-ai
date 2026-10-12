// Isolated benchmark only. Explicitly reserve memory for the already-running
// Bloks + Zipformer STT workload, then generate real audio with the CPU model.
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { writeFileSync } from 'node:fs';

const reservation = Buffer.alloc(256 * 1024 * 1024, 0x7f);
const tests=[
  {text:'Halo, aku Diza. Gimana kabar kamu?',out:'/tmp/pocket-shorts.wav'},
  {text:'Halo, aku Diza. Sekarang kita bisa ngobrol santai. Ceritain apa yang kamu pikirkan hari ini.',out:'/tmp/pocket-longs.wav'}
];
for(const t of tests){
  const began=Date.now();
  const r=spawnSync('/opt/pocket/pocket-tts',[
    '--models-dir','/opt/pocket/models',
    '--voices-dir','/opt/pocket/voices',
    '--tokenizer','/opt/pocket/models/tokenizer.model',
    '--threads','1','--eos-threshold','-8.0',
    t.text,
    '/opt/pocket/voices/ref_reporter.mp3',
    t.out
  ],{encoding:'utf8',timeout:29000,maxBuffer:65536});
  if(r.status!==0)throw Error('Real native model failed: '+String(r.stderr).slice(-700));
  const wav=readFileSync(t.out);
  if(wav.toString('ascii',0,4)!=='RIFF'||wav.toString('ascii',8,12)!=='WAVE')throw Error('Bad audio file');
  const rate=wav.readUInt32LE(24),bits=wav.readUInt16LE(34);
  let offset=12,size=0;
  while(offset+8<=wav.length){
     const n=wav.readUInt32LE(offset+4),chunk=wav.toString('ascii',offset,offset+4);
     if(chunk==='data')size=n;
     offset+=8+n+(n%2);
  }
  const duration=bits===32?size/(rate*4):size/(rate*2);
  if(!Number.isFinite(duration)||duration<0.6||duration>30)throw Error('Unsupported audio length');
  console.log('POCKET_REAL_1GB_TEST',JSON.stringify({words:t.text.split(/\s+/).length,secondsAudio:duration,secondsRun:(Date.now()-began)/1000,peakWorkingReserveMB:256,wavBytes:wav.length}));
}
reservation[0] += 1;
