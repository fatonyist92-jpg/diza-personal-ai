import fs from "node:fs";
import assert from "node:assert/strict";

const html=fs.readFileSync("diza-android/app/src/main/assets/index.html","utf8");
const main=fs.readFileSync("diza-android/app/src/main/java/com/diza/botagent/MainActivity.java","utf8");

const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(Boolean);
assert.ok(scripts.length>0,"Expected at least one inline script");
for(const [i,script] of scripts.entries()){
  try{
    new Function(script);
  }catch(error){
    throw new Error("Inline script "+i+" has syntax error: "+error.message);
  }
}

const requiredEndpoints=[
  "/native/bots/list",
  "/native/bots/save",
  "/native/bots/delete",
  "/native/memories/list",
  "/native/memories/save",
  "/native/memories/delete",
  "/native/tasks/create",
  "/native/tasks/list",
  "/native/tasks/get",
  "/native/tasks/run",
  "/native/conversations/get"
];

for(const endpoint of requiredEndpoints){
  assert.ok(html.includes(endpoint),"Missing Item 1-2-3 endpoint reference: "+endpoint);
}

const requiredUiTerms=[
  "New Bot",
  "Memory",
  "Tasks"
];

for(const term of requiredUiTerms){
  assert.ok(html.includes(term),"Missing Item 1-2-3 UI term: "+term);
}

assert.ok(
  main.includes('file:///android_asset/index.html')
    || main.includes('loadDataWithBaseURL')
    || main.includes('android_asset/index.html'),
  "Android wrapper no longer appears to use bundled/local UI"
);

console.log("✓ inline JavaScript syntax");
console.log("✓ Item 1 bot endpoint contract");
console.log("✓ Item 2 memory endpoint contract");
console.log("✓ Item 3 task endpoint contract");
console.log("✓ local Android UI wrapper contract");
console.log("\n5/5 contract checks passed");
