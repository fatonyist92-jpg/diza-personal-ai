import test from 'node:test';
import assert from 'node:assert/strict';
import { startBrowserMic, useDirectAndroidRecorder } from './browserMic.ts';

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
