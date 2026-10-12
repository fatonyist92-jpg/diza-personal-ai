import test from 'node:test';
import assert from 'node:assert/strict';
import { startBrowserMic, useDirectAndroidRecorder, createMicrophoneActivityDetector } from './browserMic.ts';

test('Android always bypasses unreliable Chrome Web Speech', () => {
  assert.equal(useDirectAndroidRecorder('Mozilla/5.0 (Linux; Android 16; Mobile) Chrome/140'),true);
  assert.equal(useDirectAndroidRecorder('Mozilla/5.0 (Linux; Android 15; wv) AppleWebKit'),true);
  assert.equal(useDirectAndroidRecorder('Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/140'),false);
});

test('Call on Android sends actual mic audio to the local Railway STT endpoint', async () => {
  const saved={window:globalThis.window, mediaRecorder:globalThis.MediaRecorder,
    audioContext:globalThis.AudioContext, fetch:globalThis.fetch,
    nav:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
  const transcript='tes satu dua tiga';
  let uploads=0, tracksStopped=0, fakeSpeechCalled=0, mediaStarted=0;
  let delivered, failed;
  const delivery=new Promise((resolve,reject)=>{delivered=resolve;failed=reject});
  try {
    Object.defineProperty(globalThis,'navigator',{
      configurable:true,
      value:{
        userAgent:'Mozilla/5.0 (Linux; Android 16; Pixel) Chrome/141.0',
        mediaDevices:{ getUserMedia:async constraints => {
          assert.equal(constraints.audio.echoCancellation,true);
          return {getTracks:()=>[{stop:()=>tracksStopped++}]};
        }},
      },
    });
    globalThis.window={
      isSecureContext:true,
      webkitSpeechRecognition: class { constructor(){fakeSpeechCalled++} },
    };
    globalThis.MediaRecorder=class {
      static isTypeSupported(v){return v==='audio/webm;codecs=opus'}
      constructor(stream,opt){
        this.mimeType=opt.mimeType;this.state='inactive';
      }
      start(){mediaStarted++;this.state='recording'}
      stop(){
        this.state='inactive';
        this.ondataavailable({data:new Blob([new Uint8Array(500).fill(3)],
          {type:this.mimeType})});
        this.onstop();
      }
    };
    globalThis.AudioContext=class {
      createMediaStreamSource(){return {connect(){}}}
      createAnalyser(){return {fftSize:1024,getByteTimeDomainData(buf){buf.fill(128)}}}
      close(){return Promise.resolve()}
    };
    globalThis.fetch=async (path,params)=>{
      assert.equal(path,'/api/bloks-stt/transcribe');
      assert.equal(params.method,'POST');
      assert.equal(params.credentials,'same-origin');
      assert.equal(params.headers['content-type'],'audio/webm;codecs=opus');
      assert.ok(params.body instanceof Blob && params.body.size>=256);
      uploads++;
      return new Response(JSON.stringify({text:transcript}),{
        status:200,headers:{'content-type':'application/json'}
      });
    };
    const session=await startBrowserMic({
      onFinal: text=>{try{assert.equal(text,transcript);delivered()}catch(e){failed(e)}},
      onSilence: ()=>failed(Error('Unexpected silence')),
      onError: e=>failed(Error('Unexpected STT error: '+e)),
      onProcessing: ()=>{},
    },true);
    assert.equal(mediaStarted,1);
    assert.equal(fakeSpeechCalled,0);
    session.stop();
    await Promise.race([
      delivery,
      new Promise((_,reject)=>setTimeout(()=>reject(Error('No transcription callback')),3000)),
    ]);
    assert.equal(uploads,1);
    assert.ok(tracksStopped>0);
    session.cancel();
  } finally {
    globalThis.window=saved.window;
    globalThis.MediaRecorder=saved.mediaRecorder;
    globalThis.AudioContext=saved.audioContext;
    globalThis.fetch=saved.fetch;
    if(saved.nav)Object.defineProperty(globalThis,'navigator',saved.nav);
    else delete globalThis.navigator;
  }
});

test('Android VAD needs sustained voice, rejects clicks and detects quiet 0.01 voice',()=>{
 const d=createMicrophoneActivityDetector();
 assert.equal(d.update(.017,100).heardSpeech,false); // a single transient
 assert.equal(d.update(.001,200).heardSpeech,false);
 assert.equal(d.update(.010,300).heardSpeech,false);
 assert.equal(d.update(.010,400).heardSpeech,true);
 assert.equal(d.update(.001,500).lastLoud,400);
 assert.equal(d.update(.012,600).heardSpeech,true);
 assert.equal(d.update(.012,700).lastLoud,700);
});
test('422 no words is nonfatal silence, while mic remains reusable',async()=>{
 const previous={wnd:globalThis.window,media:globalThis.MediaRecorder,
  audio:globalThis.AudioContext,net:globalThis.fetch,
  nav:Object.getOwnPropertyDescriptor(globalThis,'navigator')};
 let requested=0, silence=0,error=null, resolve;
 const done=new Promise(r=>resolve=r);
 try{
   Object.defineProperty(globalThis,'navigator',{configurable:true,
    value:{userAgent:'Android 16 Chrome',mediaDevices:{
      getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})
    }}});
   globalThis.window={isSecureContext:true};
   globalThis.MediaRecorder=class {
     static isTypeSupported(){return true}
     constructor(){this.mimeType='audio/webm';this.state='inactive'}
     start(){this.state='recording'}
     stop(){
       this.state='inactive';
       this.ondataavailable({data:new Blob([new Uint8Array(1500)])});
       this.onstop();
     }
   };
   globalThis.AudioContext=class{createMediaStreamSource(){return{connect(){}}}
    createAnalyser(){return{fftSize:1024,getByteTimeDomainData(b){b.fill(128)}}}
    close(){return Promise.resolve()}};
   globalThis.fetch=async(url,init)=>{
     assert.equal(url,'/api/bloks-stt/transcribe');requested++;
     return new Response(JSON.stringify({error:'No audible words'}),{status:422,
      headers:{'content-type':'application/json'}});
   };
   const session=await startBrowserMic({
    onFinal:()=>{error='unexpected transcript';resolve()},
    onSilence:()=>{silence++;resolve()},
    onError:(e)=>{error=e;resolve()},
   },true);
   session.stop();
   await Promise.race([done,new Promise((_,rej)=>setTimeout(()=>rej(Error('No 422 callback')),1500))]);
   assert.equal(error,null);
   assert.equal(silence,1);
   assert.equal(requested,1);
   session.cancel();
 }finally{
   globalThis.window=previous.wnd;globalThis.MediaRecorder=previous.media;
   globalThis.AudioContext=previous.audio;globalThis.fetch=previous.net;
   if(previous.nav)Object.defineProperty(globalThis,'navigator',previous.nav);
   else delete globalThis.navigator;
 }
});
