import test from 'node:test';
import assert from 'node:assert/strict';
import { startNativeIndonesianSpeech } from './browserSpeechNative.ts';

function setup() {
  const record = [];
  let active;
  class SpeechRecognition {
    lang=''; continuous=true; interimResults=false; maxAlternatives=0;
    onresult=null; onerror=null; onend=null;
    start(){ record.push('start'); active=this; }
    stop(){record.push('stop');}
    abort(){record.push('abort');}
  }
  const events=[];
  const hooks={
    onFinal: text=>events.push(['final',text]),
    onSilence: ()=>events.push(['silence']),
    onError: text=>events.push(['error',text]),
    onFallback: ()=>events.push(['fallback'])
  };
  return {host:{webkitSpeechRecognition:SpeechRecognition},
    hooks,events,record,get active(){return active}};
}

test('return null when Android browser has no native recognition',()=>{
  const t=setup();
  assert.equal(startNativeIndonesianSpeech(t.hooks,{}),null);
});

test('native Indonesian recognizes full text and emits it once',()=>{
  const t=setup();
  const session=startNativeIndonesianSpeech(t.hooks,t.host);
  assert.ok(session);
  assert.equal(t.active.lang,'id-ID');
  assert.equal(t.active.continuous,false);
  assert.equal(t.active.interimResults,true);
  t.active.onresult({results:[{0:{transcript:'tes satu dua tiga'},isFinal:true}]});
  t.active.onend();
  assert.deepEqual(t.events,[['final','tes satu dua tiga']]);
  assert.deepEqual(t.record,['start','stop']);
});
test('natural early speech termination preserves interim words',()=>{
  const t=setup();
  startNativeIndonesianSpeech(t.hooks,t.host);
  t.active.onresult({results:[{0:{transcript:'halo Diza'},isFinal:false}]});
  t.active.onend();
  assert.deepEqual(t.events,[['final','halo Diza']]);
});
test('network error triggers offline model exactly once',()=>{
  const t=setup();
  startNativeIndonesianSpeech(t.hooks,t.host);
  t.active.onerror({error:'network'});
  t.active.onend();
  t.active.onend();
  assert.deepEqual(t.events,[['fallback']]);
});
test('service not allowed falls back to local Zipformer',()=>{
  const t=setup();
  startNativeIndonesianSpeech(t.hooks,t.host);
  t.active.onerror({error:'service-not-allowed'});
  t.active.onend();
  assert.deepEqual(t.events,[['fallback']]);
});
test('hangup abort does not deliver a ghost transcript',()=>{
  const t=setup();
  const s=startNativeIndonesianSpeech(t.hooks,t.host);
  t.active.onresult({results:[{0:{transcript:'salah'},isFinal:false}]});
  s.cancel();
  t.active.onend();
  assert.deepEqual(t.events,[]);
  assert.ok(t.record.includes('abort'));
});
test('manual stop accepts recognized partial text',()=>{
  const t=setup();
  const s=startNativeIndonesianSpeech(t.hooks,t.host);
  t.active.onresult({results:[{0:{transcript:'halo Diza'},isFinal:false}]});
  s.stop();
  t.active.onerror({error:'aborted'});
  t.active.onend();
  assert.deepEqual(t.events,[['final','halo Diza']]);
});
test('user blocked microphone receives error without sending audio to provider',()=>{
  const t=setup();
  startNativeIndonesianSpeech(t.hooks,t.host);
  t.active.onerror({error:'not-allowed'});
  t.active.onend();
  assert.equal(t.events.length,1);
  assert.equal(t.events[0][0],'error');
});
test('no-speech returns clean silence event',()=>{
  const t=setup();
  startNativeIndonesianSpeech(t.hooks,t.host);
  t.active.onerror({error:'no-speech'});
  t.active.onend();
  assert.deepEqual(t.events,[['silence']]);
});
