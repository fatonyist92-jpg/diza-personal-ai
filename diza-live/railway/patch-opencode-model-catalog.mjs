// Restore actual OpenCode model options in Bloks when initial ACP probe fails.
// No UI theme, account, authentication file or existing saved selection edits.
import { readFileSync, writeFileSync } from "node:fs";
const path="/opt/bloks/server/drivers/acp.ts";
let c=readFileSync(path,"utf8");
function one(before,after,name){
  if(c.split(before).length!==2) throw Error("OpenCode model recovery anchor mismatch: "+name);
  c=c.replace(before,after);
}
const helper = "\n/** Exact free model verified against this running OpenCode installation. */\nconst BLOKS_VERIFIED_OPENCODE_FREE = {\n  id: \"opencode/muse-spark-1.3-contributor-free\",\n  label: \"Muse Spark 1.3 Contributor Free\",\n};\nfunction openCodeCatalogWithVerifiedFree(catalog: ModelCatalog): ModelCatalog {\n  const options = [...catalog.options];\n  if (!options.some((o) => o.id === BLOKS_VERIFIED_OPENCODE_FREE.id)) {\n    options.push(BLOKS_VERIFIED_OPENCODE_FREE);\n  }\n  return { ...catalog, options };\n}\n/** Fallback when an ACP catalog handshake times out or exposes only Auto.\n * Parse authoritative OpenCode CLI output, never local login/config files.\n * Bounded time/output; no credential material or provider output in logs.\n */\nasync function openCodeCliCatalog(cli: string, env: Record<string,string|undefined>): Promise<ModelCatalog|null> {\n  return new Promise((resolve) => {\n    execFile(cli, [\"models\"], {\n      cwd: homedir(),\n      env: {...env, NO_COLOR:\"1\", CI:\"1\"},\n      timeout: 18_000,\n      maxBuffer: 384_000,\n      windowsHide: true,\n    }, (err, stdout) => {\n      if (err) return resolve(null);\n      const ids = [...new Set(String(stdout ?? \"\").split(/\\r?\\n/)\n        .map((line) => line.trim())\n        .filter((line) => line.includes(\"/\") && /^[a-z0-9][a-z0-9._:@+\\/-]{0,160}$/i.test(line)))].slice(0,400);\n      if (!ids.length) return resolve(null);\n      resolve({ default:\"auto\", options: ids.map((id) => ({ id, label:id })) });\n    });\n  });\n}\n";
one("/**\n * A provider's error, readable.",helper+"\n/**\n * A provider's error, readable.","insert bounded official CLI discovery");
const beforeProbe = [
 '    const session = await rpc.request("session/new", { cwd: tmpdir(), mcpServers: [] });',
 '    return catalogFromSession(session);',
 '  } catch {',
 '    return null;',
 '  } finally {',
].join("\n");
const afterProbe = [
 '    const session = await rpc.request("session/new", { cwd: tmpdir(), mcpServers: [] });',
 '    const acpCatalog = catalogFromSession(session);',
 '    if (spec.kind !== "opencode" || (acpCatalog?.options.length ?? 0) > 1) return acpCatalog;',
 '    const found = await openCodeCliCatalog(cli, env);',
 '    if (!found) return acpCatalog;',
 '    return {',
 '      default: acpCatalog?.default ?? found.default,',
 '      options: [...(acpCatalog?.options ?? []), ...found.options.filter((v) =>',
 '        !acpCatalog?.options.some((o) => o.id === v.id))],',
 '    };',
 '  } catch {',
 '    return spec.kind === "opencode" ? await openCodeCliCatalog(cli, env) : null;',
 '  } finally {',
].join("\n");
one(beforeProbe,afterProbe,"ACP-to-CLI fallback");
one("            models.options = catalog.options;\n            models.default = catalog.default;",
  '            models.options = spec.kind === "opencode" ? openCodeCatalogWithVerifiedFree(catalog).options : catalog.options;\n            models.default = catalog.default;',
  "instance model list");
one("              models.options = catalog.options;\n              models.default = catalog.default;",
  '              models.options = spec.kind === "opencode" ? openCodeCatalogWithVerifiedFree(catalog).options : catalog.options;\n              models.default = catalog.default;',
  "turn model list");
one('      default: "auto",\n      options: [{ id: "auto", label: "Auto" }],',
  '      default: "auto",\n      options: [{ id: "auto", label: "Auto" }, BLOKS_VERIFIED_OPENCODE_FREE],',
  "always show verified free choice");
writeFileSync(path,c);
console.log("BLOKS_OPENCODE_CATALOG_RECOVERY=APPLIED");
