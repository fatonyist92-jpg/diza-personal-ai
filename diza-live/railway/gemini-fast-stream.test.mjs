import { strict as assert } from "node:assert";
import { streamGeminiNaturalVoice } from "./gemini-fast-stream.mjs";
const old={fetch:globalThis.fetch,key:process.env.GEMINI_API_KEY,tts:process.env.GEMINI_TTS_ENABLED,stream:process.env.GEMINI_TTS_STREAM_ENABLED};
try {
  let count=0;
  process.env.GEMINI_TTS_ENABLED='1';
  process.env.GEMINI_TTS_STREAM_ENABLED='0';
  process.env.GEMINI_API_KEY='private-test-only';
  globalThis.fetch=async()=>{count++;throw Error('off must not send');};
  assert.equal(await streamGeminiNaturalVoice('Tes satu dua tiga','id-ID-GadisNeural'),null);
  assert.equal(count,0);
  process.env.GEMINI_TTS_STREAM_ENABLED='1';
  assert.equal(await streamGeminiNaturalVoice('Tes satu dua tiga','id-ID-ArdiNeural'),null);
  assert.equal(count,0);
  const a=Buffer.from([0,0,127,127]);
  const b=Buffer.from([8,8,17,17]);
  const sse=[
    'data: '+JSON.stringify({event_type:'interaction.start',interaction_id:'mock'}),
    'data: '+JSON.stringify({event_type:'step.delta',delta:{type:'audio',data:a.toString('base64')}}),
    'data: '+JSON.stringify({event_type:'step.delta',delta:{type:'audio',data:b.toString('base64')}}),
    'data: '+JSON.stringify({event_type:'interaction.complete',status:'completed'}),
  ].join('\n\n')+'\n\n';
  globalThis.fetch=async (url,options)=>{
    assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/interactions');
    assert.equal(options.headers['x-goog-api-key'],'private-test-only');
    const body=JSON.parse(options.body);
    assert.equal(body.stream,true);
    assert.equal(body.model,'gemini-3.8-flash-tts');
    assert.equal(body.response_format.mime_type,'audio/l16');
    assert.equal(body.input[0].content[0].text,'Tes satu dua tiga');
    return new Response(new ReadableStream({start(controller){
      const bytes=new TextEncoder().encode(sse);
      controller.enqueue(bytes.subarray(0,13));
      controller.enqueue(bytes.subarray(13,41));
      controller.enqueue(bytes.subarray(41));
      controller.close();
    }}),{status:200,headers:{'content-type':'text/event-stream'}});
  };
  const result=await streamGeminiNaturalVoice('Tes satu dua tiga','id-ID-GadisNeural');
  assert.equal(result.mime,'audio/l16;rate=24000;channels=1');
  const chunks=[];
  for await (const chunk of result.stream) chunks.push(Buffer.from(chunk));
  assert.deepEqual(Buffer.concat(chunks),Buffer.concat([a,b]));
  globalThis.fetch=async()=>new Response('{}',{status:429});
  assert.equal(await streamGeminiNaturalVoice('Tes satu dua tiga','id-ID-GadisNeural'),null);
  console.log('STREAMING_PCM_TEST=PASS');
} finally {
  globalThis.fetch=old.fetch;
  for(const [name,value] of [['GEMINI_API_KEY',old.key],['GEMINI_TTS_ENABLED',old.tts],['GEMINI_TTS_STREAM_ENABLED',old.stream]]) {
    if(value===undefined)delete process.env[name]; else process.env[name]=value;
  }
}
