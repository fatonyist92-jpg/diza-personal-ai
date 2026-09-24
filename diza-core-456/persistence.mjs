import fs from "node:fs";
import path from "node:path";
import { InMemoryTaskStore } from "./task-engine.mjs";
import { IdempotencyStore } from "./mesh-router.mjs";

function atomicWrite(filePath,value){
  fs.mkdirSync(path.dirname(filePath),{recursive:true});
  const tmp=filePath+".tmp-"+process.pid;
  fs.writeFileSync(tmp,JSON.stringify(value,null,2),"utf8");
  fs.renameSync(tmp,filePath);
}

export class JsonFileStateStore {
  constructor(filePath,defaults={}){
    this.filePath=filePath;
    this.defaults=defaults;
  }
  async load(){
    try{
      const raw=await fs.promises.readFile(this.filePath,"utf8");
      return {...this.defaults,...JSON.parse(raw)};
    }catch(e){
      if(e?.code==="ENOENT")return {...this.defaults};
      throw e;
    }
  }
  async save(state){
    await fs.promises.mkdir(path.dirname(this.filePath),{recursive:true});
    const tmp=this.filePath+".tmp-"+process.pid;
    await fs.promises.writeFile(tmp,JSON.stringify(state,null,2),"utf8");
    await fs.promises.rename(tmp,this.filePath);
  }
}

export class PersistentTaskStore extends InMemoryTaskStore {
  constructor(filePath){
    let snapshot=null;
    try{
      snapshot=JSON.parse(fs.readFileSync(filePath,"utf8"));
    }catch(e){
      if(e?.code!=="ENOENT")throw e;
    }
    super(snapshot);
    this.filePath=filePath;
  }
  flush(){atomicWrite(this.filePath,this.export());}
  createTask(input){
    const r=super.createTask(input);
    this.flush();
    return r;
  }
  mutate(id,fn){
    const r=super.mutate(id,fn);
    this.flush();
    return r;
  }
}

export class PersistentIdempotencyStore extends IdempotencyStore {
  constructor(filePath){
    let snapshot=[];
    try{
      snapshot=JSON.parse(fs.readFileSync(filePath,"utf8"));
    }catch(e){
      if(e?.code!=="ENOENT")throw e;
    }
    super(snapshot);
    this.filePath=filePath;
  }
  set(key,value){
    super.set(key,value);
    atomicWrite(this.filePath,this.snapshot());
  }
}
