// Real Chromium Android-mode smoke. Tests MP3 decoding/playback begins before
// the final network bytes arrive. Audio is synthetic 440 Hz, never private.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import ts from 'typescript';
import { readFileSync } from 'node:fs';

const sample=readFileSync('/tmp/bloks-test-stream.mp3');
const source=readFileSync('diza-live/railway/streamedMp3Audio.ts','utf8');
const script=ts.transpileModule(source,{compilerOptions:{
  target:ts.ScriptTarget.ES2022,
  module:ts.ModuleKind.ES2022,
}}).outputText.replace('export function streamedMp3Audio','function streamedMp3Audio')+
  '\nwindow.bloksTestStreamedMp3Audio = streamedMp3Audio;';
const chrome=process.env.CHROME_BIN||'/usr/bin/google-chrome';
const browser=await chromium.launch({executablePath:chrome,headless:true,
  args:['--no-sandbox','--autoplay-policy=no-user-gesture-required','--mute-audio']});
try {
  const page=await browser.newPage({viewport:{width:393,height:852}});
  await page.goto('about:blank');
  await page.addScriptTag({content:script});
  const out=await page.evaluate(async (b64)=>{
    const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
    if(!window.MediaSource?.isTypeSupported('audio/mpeg'))
      return {unsupported:true};
    let completed=false;
    const chunks=Math.floor(bytes.length*0.75);
    const stream=new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0,chunks));
        setTimeout(()=>{
          try { controller.enqueue(bytes.slice(chunks));controller.close();completed=true; }
          catch(e){completed=true;}
        },3500);
      },
    });
    const a=window.bloksTestStreamedMp3Audio(stream);
    if(!a) return {noAudio:true};
    const start=performance.now();
    let failure;
    a.addEventListener('error',()=>failure='audio error');
    try {await a.play()}catch(e){return {error:String(e)}}
    const started=performance.now()-start;
    const beganBeforeDownloadFinished=!completed;
    const pos=a.currentTime;
    // Wait for the complete stream and real HTMLAudioElement end event.
    const ending=new Promise(resolve=>{
      a.addEventListener('ended',()=>resolve('ended'),{once:true});
      a.addEventListener('error',()=>resolve('error'),{once:true});
      setTimeout(()=>resolve('timeout'),11000);
    });
    const end=await ending;
    return {started, beganBeforeDownloadFinished, pos, completed, end, failure};
  },sample.toString('base64'));
  console.log('CHROMIUM_REAL_ANDROID_ELEVENLABS_PROGRESSIVE_MP3',JSON.stringify(out));
  assert.equal(out.beganBeforeDownloadFinished,true,'audio must start before whole MP3 download');
  assert.equal(out.end,'ended','native audio must end naturally and unlock Call');
  assert.equal(out.completed,true);
  assert(out.started<3000,'start must not block on full audio (3500ms delay)');
} finally {await browser.close()}
