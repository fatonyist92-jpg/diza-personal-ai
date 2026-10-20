// Version-pinned Project X route injection. Additive only.
// Runs after Bloks authentication and member segregation checks.
import { readFileSync, writeFileSync } from 'node:fs';
const file=process.env.EVOLUTION_LAB_PATCH_TARGET || '/opt/bloks/server/index.ts';
const current=readFileSync(file,'utf8');
const anchor='    if (method === "GET" && path === "/api/bots") {';
if (current.split(anchor).length!==2) throw Error('Evolution Lab security anchor missing or duplicate; abort build');
const insertion=[
  '  // Project X: owner-only experimental API after authentication and member guards.',
  '  if (path.startsWith("/api/evolution-lab/")) {',
  '    if (asAgent || caller?.personId || (viaRelay && !caller)) {',
  '      return json(res, 403, { error: "Evolution Lab is owner-only" });',
  '    }',
  '    // @ts-ignore standalone JS module shipped with pinned image',
  '    const { handleEvolutionApi } = await import("./evolution-lab-api.mjs");',
  '    return await handleEvolutionApi(req, res, method, path);',
  '  }',
  ''
].join('\n');
writeFileSync(file,current.replace(anchor,insertion+anchor));
console.log('patched: Evolution Lab guarded API');
