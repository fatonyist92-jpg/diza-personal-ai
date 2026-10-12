// Browser acceptance of the actual Vite-generated Tailwind CSS and exact
// pinned Bloks ModelPicker markup. No server, credentials, or agent changes.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync } from 'node:fs';
const src=readFileSync('./model-picker-patched.tsx','utf8');
const marker=src.slice(src.indexOf('data-model-picker-content'));
const className=marker.match(/className="([^"]+)"/)?.[1];
assert(className?.includes('max-sm:fixed'),'mobile viewport-fix missing');
const cssFiles=readdirSync('./bloks-build-dist/assets').filter(x=>x.endsWith('.css'));
assert(cssFiles.length,'no built CSS artifact');
const css=cssFiles.map(x=>readFileSync('./bloks-build-dist/assets/'+x,'utf8')).join('\n');
const executablePath=process.env.CHROME_BIN||'/usr/bin/google-chrome';
const browser=await chromium.launch({executablePath,headless:true,args:['--no-sandbox']});
try{
  for (const [width,height] of [[320,640],[360,780],[393,852],[430,932],[1280,900]]) {
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    await page.setContent(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body style="margin:0">
      <div id="trigger" class="relative" style="position:absolute;left:142px;top:180px;width:90px;height:30px">
        <button>GPT-5.6 Sol</button>
        <div data-model-picker-content id="menu" class="${className}">
          <div class="flex min-h-0 flex-1">
            <div class="flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r bg-muted/40 p-1.5">⚙</div>
            <div id="models" class="min-w-0 flex-1 overflow-y-auto overscroll-contain p-1.5">
              <div>Codex tools</div>
              ${Array.from({length:25},(_,n)=>`<button style="display:block;height:32px;width:100%">GPT model ${n+1}</button>`).join('')}
            </div>
          </div>
          <div class="flex shrink-0 justify-end border-t px-1.5 py-1">Engines</div>
        </div>
      </div></body></html>`);
    const result=await page.evaluate(()=>{
      const el=document.querySelector('#menu'),list=document.querySelector('#models');
      const r=el.getBoundingClientRect();
      return {x:r.left,right:r.right,width:r.width,top:r.top,bottom:r.bottom,
        viewport:document.documentElement.clientWidth,height:window.innerHeight,
        scrollable:list.scrollHeight>list.clientHeight,overY:getComputedStyle(list).overflowY,
        pos:getComputedStyle(el).position}
    });
    assert(result.x>=7,`Left clipped on ${width}: ${JSON.stringify(result)}`);
    assert(result.right<=width-7,`Right clipped on ${width}: ${JSON.stringify(result)}`);
    assert(result.bottom<=height-5,`Bottom clipped on ${width}: ${JSON.stringify(result)}`);
    assert(result.scrollable,`Model list cannot scroll on ${width}`);
    if(width<640)assert.equal(result.pos,'fixed');
    else assert.equal(result.pos,'absolute');
    console.log('BLOKS_MODEL_PICKER_VIEWPORT_PASS',JSON.stringify({width,height,...result}));
    await page.close();
  }
}finally{await browser.close()}
