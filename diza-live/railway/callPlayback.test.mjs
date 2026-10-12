import test from 'node:test';
import assert from 'node:assert/strict';
import { playCallAudio } from './callPlayback.ts';

class FakeAudio {
  constructor(){this.events = new Map(); this.plays = 0; this.pauses=0;}
  addEventListener(t, fn){const s=this.events.get(t)??new Set();s.add(fn);this.events.set(t,s);}
  removeEventListener(t, fn){this.events.get(t)?.delete(fn);}
  emit(t){for(const fn of this.events.get(t)||[])fn()}
  play(){this.plays++; return Promise.resolve();}
  pause(){this.pauses++;}
}
test('normal ElevenLabs ended returns microphone exactly once', async()=>{
 const a=new FakeAudio();let done=0;
 const stop=playCallAudio(a,()=>done++,1000);
 assert.equal(a.plays,1);
 a.emit('ended');a.emit('error');a.emit('ended');
 await Promise.resolve();
 assert.equal(done,1);
 assert.equal(a.events.get('ended').size,0);
 stop();
});
test('missing ended: finite watchdog exits endless Speaking',async()=>{
 const a=new FakeAudio();let done=0;
 playCallAudio(a,()=>done++,100);
 await new Promise(r=>setTimeout(r,160));
 assert.equal(done,1);
 assert.equal(a.pauses,1);
 assert.equal(a.events.get('ended').size,0);
});
test('barge in cancels playback and must not restart mic twice', async()=>{
 const a=new FakeAudio();let done=0;
 const stop=playCallAudio(a,()=>done++,100);
 stop(); a.emit('ended');a.emit('error');
 await new Promise(r=>setTimeout(r,160));
 assert.equal(done,0);
 assert.equal(a.pauses,1);
});
test('audio play rejection unlocks Call once', async()=>{
 const a=new FakeAudio();let done=0;
 a.play=()=>Promise.reject(Error('Android audio focus denied'));
 playCallAudio(a,()=>done++,100);
 await new Promise(r=>setTimeout(r,20));
 assert.equal(done,1);
});
test('audio error returns microphone exactly once',async()=>{
 const a=new FakeAudio();let done=0;
 playCallAudio(a,()=>done++,100);
 a.emit('error'); a.emit('ended');
 assert.equal(done,1);
});
