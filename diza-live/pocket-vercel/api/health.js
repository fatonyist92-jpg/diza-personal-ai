import {stat} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'voice-assets');
export default async function handler(_req,res){
  try {
    const [bin,model,reference]=await Promise.all([
      stat(join(root,'pocket-tts')),
      stat(join(root,'models','flow_lm_main_int8.onnx')),
      stat(join(root,'voices','ref_reporter.mp3'))
    ]);
    const ready=bin.size>100000 && model.size>1000000 && reference.size>1000;
    res.setHeader('Cache-Control','no-store');
    return res.status(ready?200:503).json({ready,voice:'Pocket Indonesian ONNX',runtime:'serverless CPU',has_wav_bridge:true});
  }catch{return res.status(503).json({ready:false})}
}
