import test from 'node:test';
import assert from 'node:assert/strict';
import {pcm16Wav} from '../api/tts.js';

test('Voice bridge converts C++ IEEE float WAV to PCM16',()=>{
 const n=24000;
 const b=Buffer.alloc(44+n*4);
 b.write('RIFF',0);b.writeUInt32LE(36+n*4,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);
 b.writeUInt32LE(96000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(32,34);
 b.write('data',36);b.writeUInt32LE(n*4,40);
 for(let i=0;i<n;i++) b.writeFloatLE(.12,44+i*4);
 const w=pcm16Wav(b);
 assert.equal(w.readUInt16LE(20),1);
 assert.equal(w.readUInt16LE(34),16);
 assert.equal(w.readUInt32LE(24),24000);
 assert.equal(w.length,44+n*2);
});
test('WAV rejects invalid files',()=>{
  assert.throws(()=>pcm16Wav(Buffer.from('oops')),/WAV/);
});
