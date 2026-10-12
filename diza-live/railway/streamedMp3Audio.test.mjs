import test from 'node:test';
import assert from 'node:assert/strict';
import { streamedMp3Audio } from './streamedMp3Audio.ts';

function fakePlatform() {
 const prior = {
   MediaSource: globalThis.MediaSource,
   Audio: globalThis.Audio,
   create: URL.createObjectURL,
   revoke: URL.revokeObjectURL,
 };
 let latestMedia, latestAudio, revoked=0, cancelled=0;
 class Source extends EventTarget {
   chunks=[]; mode='segments';
   appendBuffer(value) {
     this.chunks.push(new Uint8Array(value));
     queueMicrotask(()=>this.dispatchEvent(new Event('updateend')));
   }
 }
 class Media extends EventTarget {
   static supported=true;
   static isTypeSupported(t){return this.supported && t==='audio/mpeg'}
   readyState='closed';
   sourceBuffer=new Source();
   constructor(){super(); latestMedia=this;}
   addSourceBuffer(type){assert.equal(type,'audio/mpeg');return this.sourceBuffer;}
   endOfStream(){this.readyState='ended';this.didEnd=true;}
   open(){this.readyState='open';this.dispatchEvent(new Event('sourceopen'))}
 }
 class FakeAudio extends EventTarget {
   constructor(url){super();this.src=url;this.paused=true;latestAudio=this;}
   async play(){this.paused=false}
   pause(){this.paused=true;this.dispatchEvent(new Event('pause'))}
 }
 globalThis.MediaSource=Media;
 globalThis.Audio=FakeAudio;
 URL.createObjectURL=()=> 'blob:mock-media-source';
 URL.revokeObjectURL=()=>revoked++;
 return {
   Media, status(){return{latestMedia,latestAudio,revoked,cancelled}},
   trackCancel(){cancelled++},
   restore(){
     globalThis.MediaSource=prior.MediaSource;globalThis.Audio=prior.Audio;
     URL.createObjectURL=prior.create;URL.revokeObjectURL=prior.revoke;
   },
 }
}
const delay=()=>new Promise(resolve=>setTimeout(resolve,12));
test('ElevenLabs MP3 chunks are appended before complete file download',async()=>{
 const p=fakePlatform();
 try{
   let ctl,downloadComplete=false;
   const stream=new ReadableStream({
     start(c){ctl=c;},
     cancel(){p.trackCancel()}
   });
   const audio=streamedMp3Audio(stream);
   assert(audio);
   assert.equal(stream.locked,false,'read should not start before MediaSource opens');
   p.status().latestMedia.open();
   ctl.enqueue(new Uint8Array([1,2,3,4]));
   await delay();
   assert.equal(p.status().latestMedia.sourceBuffer.chunks.length,1);
   assert.equal(downloadComplete,false);
   assert.deepEqual(Array.from(p.status().latestMedia.sourceBuffer.chunks[0]),[1,2,3,4]);
   ctl.enqueue(new Uint8Array([5,6,7]));
   ctl.close();
   downloadComplete=true;
   await delay();
   assert.equal(p.status().latestMedia.sourceBuffer.chunks.length,2);
   assert.equal(p.status().latestMedia.didEnd,true);
   audio.dispatchEvent(new Event('ended'));
   assert.equal(p.status().revoked,1);
 } finally{p.restore()}
});
test('Hangup cancels pending stream and revokes media source',async()=>{
 const p=fakePlatform();
 try{
   const stream=new ReadableStream({
     start(c){c.enqueue(new Uint8Array([1,2,3,4]));},
     cancel(){p.trackCancel()}
   });
   const audio=streamedMp3Audio(stream);
   assert(audio);
   p.status().latestMedia.open();
   await delay();
   audio.pause();
   await delay();
   assert.equal(p.status().cancelled,1);
   assert.equal(p.status().revoked,1);
 }finally{p.restore()}
});
test('Unsupported browser leaves original response stream untouched for blob fallback',()=>{
 const p=fakePlatform();
 try{
   p.Media.supported=false;
   const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array([1]))}});
   assert.equal(streamedMp3Audio(stream),null);
   assert.equal(stream.locked,false);
 }finally{p.restore()}
});
test('Bad MP3 stream signals audio error instead of hanging Speaking',async()=>{
 const p=fakePlatform();
 try{
   const stream=new ReadableStream({start(c){c.error(new Error('connection dropped'))}});
   const audio=streamedMp3Audio(stream);
   let errors=0;
   audio.addEventListener('error',()=>errors++);
   p.status().latestMedia.open();
   await delay();
   assert.equal(errors,1);
   assert.equal(p.status().revoked,1);
 }finally{p.restore()}
});
