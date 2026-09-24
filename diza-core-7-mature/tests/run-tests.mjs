import assert from "node:assert/strict";
import { MatureProviderRegistry, MatureCapability } from "../provider-registry.mjs";
import { MatureMediaRouter } from "../router.mjs";
import { MaturePolicyError } from "../policy-engine.mjs";

const tests=[];
const test=(name,fn)=>tests.push([name,fn]);

test("adult text prefers local provider",()=>{
  const registry=new MatureProviderRegistry();
  const router=new MatureMediaRouter({registry});
  const p=router.choose({
    capability:MatureCapability.TEXT,
    allAdultsConfirmed:true,
    subjectType:"synthetic"
  });
  assert.equal(p.id,"local-text");
});

test("adult image prefers local provider",()=>{
  const registry=new MatureProviderRegistry();
  const router=new MatureMediaRouter({registry});
  const p=router.choose({
    capability:MatureCapability.IMAGE,
    allAdultsConfirmed:true,
    subjectType:"synthetic"
  });
  assert.equal(p.id,"local-image");
});

test("adult i2v prefers local Wan provider",()=>{
  const registry=new MatureProviderRegistry();
  const router=new MatureMediaRouter({registry});
  const p=router.choose({
    capability:MatureCapability.I2V,
    allAdultsConfirmed:true,
    subjectType:"synthetic"
  });
  assert.equal(p.id,"local-wan-i2v");
});

test("hosted provider is not silently enabled",()=>{
  const registry=new MatureProviderRegistry();
  registry.patch("local-text",{enabledByDefault:false});
  const router=new MatureMediaRouter({registry});
  assert.throws(()=>router.choose({
    capability:MatureCapability.TEXT,
    allAdultsConfirmed:true,
    subjectType:"synthetic"
  }),e=>e.code==="NO_MATURE_PROVIDER");
});

test("hosted provider can be explicitly enabled",()=>{
  const registry=new MatureProviderRegistry();
  registry.patch("local-text",{enabledByDefault:false});
  const router=new MatureMediaRouter({registry,enabledProviderIds:["venice"]});
  const p=router.choose({
    capability:MatureCapability.TEXT,
    allAdultsConfirmed:true,
    subjectType:"synthetic"
  });
  assert.equal(p.id,"venice");
});

test("ambiguous age is blocked",()=>{
  const registry=new MatureProviderRegistry();
  const router=new MatureMediaRouter({registry});
  assert.throws(()=>router.choose({
    capability:MatureCapability.IMAGE,
    allAdultsConfirmed:false,
    ageAmbiguous:true
  }),e=>e instanceof MaturePolicyError&&e.code==="ADULT_STATUS_REQUIRED");
});

test("real-person sexual content requires consent confirmation",()=>{
  const registry=new MatureProviderRegistry();
  const router=new MatureMediaRouter({registry});
  assert.throws(()=>router.choose({
    capability:MatureCapability.I2V,
    allAdultsConfirmed:true,
    subjectType:"real_person",
    consentConfirmed:false
  }),e=>e instanceof MaturePolicyError&&e.code==="CONSENT_REQUIRED");
});

let passed=0;
for(const [name,fn] of tests){
  try{
    await fn();
    console.log("✓",name);
    passed++;
  }catch(e){
    console.error("✗",name);
    console.error(e);
    process.exitCode=1;
  }
}
console.log("\n"+passed+"/"+tests.length+" tests passed");
if(passed!==tests.length)process.exit(1);
