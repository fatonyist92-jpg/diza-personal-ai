import test from 'node:test';
import assert from 'node:assert/strict';
import {makeProxy,validToken,wavFloatToPcm16} from './native-auth-proxy.mjs';

const token = 'unit-test-voice-token-123456789012345';
function floatWav(seconds=1) {
  const frames=24000*seconds;
  const b=Buffer.alloc(44+frames*4);
  b.write('RIFF',0);b.writeUInt32LE(36+frames*4,4);b.write('WAVE',8);
  b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);
  b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);
  b.writeUInt32LE(96000,28);b.writeUInt16LE(4,32);b.writeUInt16LE(32,34);
  b.write('data',36);b.writeUInt32LE(frames*4,40);
  for(let i=0;i<frames;i++) b.writeFloatLE(0.1,44+i*4);
  return b;
}
test('true float32 WAV to standard PCM16 WAV',()=>{
  const w=wavFloatToPcm16(floatWav());
  assert.equal(w.toString('ascii',0,4),'RIFF');
  assert.equal(w.readUInt16LE(20),1);
  assert.equal(w.readUInt16LE(34),16);
  assert.equal(w.length,44+24000*2);
  assert.ok(w.readInt16LE(44)>0);
});
test('token comparison rejects unauthenticated input',()=>{
  assert.equal(validToken('Bearer '+token,token),true);
  assert.equal(validToken('Bearer fake',token),false);
  assert.equal(validToken(undefined,token),false);
});
test('real HTTP proxy accepts existing Bloks request and sends standard PCM16',async()=>{
  let calls=0;
  const nativeFetch=async(url,options)=>{
    calls++;
    assert.equal(url,'http://127.0.0.1:8080/v1/audio/speech');
    assert.deepEqual(JSON.parse(options.body),{
      model:'pocket-id-6l',input:'Halo, aku Diza.',
      voice:'ref_reporter.mp3',response_format:'wav'
    });
    return new Response(floatWav(),{headers:{'content-type':'audio/wav'}});
  };
  const server=makeProxy({token,nativeFetch});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const endpoint='http://127.0.0.1:'+server.address().port;
    const body=JSON.stringify({text:'Halo, aku Diza.',language:'id',voice:'female'});
    const headers={'content-type':'application/json','authorization':'Bearer '+token};
    const response=await fetch(endpoint+'/v1/tts',{method:'POST',headers,body});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'audio/wav');
    const data=Buffer.from(await response.arrayBuffer());
    assert.equal(data.readUInt16LE(20),1);
    assert.equal(data.readUInt16LE(34),16);
    assert.equal(calls,1);
    const invalid=await fetch(endpoint+'/v1/tts',{
      method:'POST',headers:{'content-type':'application/json'},
      body
    });
    assert.equal(invalid.status,401);
    const noEnglish=await fetch(endpoint+'/v1/tts',{
      method:'POST',headers,body:JSON.stringify({text:'Hello',language:'en',voice:'female'})
    });
    assert.equal(noEnglish.status,503);
  }finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});
