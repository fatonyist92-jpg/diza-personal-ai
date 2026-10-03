// Messages between two agents, as the person sees them: who sent each one
// (as data, not a "From QA" prefix), the sender's own record of sending
// it, the answer it got, and the whole exchange in one place.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { startHarness } from "./helpers/server.ts";

test("an agent's message is attributed, recorded on both sides, and opens as one exchange", async (t) => {
  const home = mkdtempSync(join(tmpdir(), "bloks-exchange-"));
  const heard = join(home, "heard.log");
  const cli = join(home, "fake-claude.mjs");
  // Told PING <id>, says hello to that agent the way `bloks say` does;
  // told anything else, answers it. Every prompt it hears is logged.
  writeFileSync(
    cli,
    `#!${process.execPath}
import { appendFileSync } from "node:fs";
const [first] = process.argv.slice(2);
if (first === "--version") { console.log("9.9.9 (Claude Code)"); process.exit(0); }
if (first === "auth") { console.log(JSON.stringify({ loggedIn: true })); process.exit(0); }
let input = "";
process.stdin.on("data", (c) => (input += c));
process.stdin.on("end", async () => {
  appendFileSync(${JSON.stringify(heard)}, JSON.stringify(input) + "\\n");
  const ping = input.match(/PING ([\\w-]+)/);
  let answer = "Got it, on it.";
  if (ping) {
    await fetch(process.env.BLOKS_URL + "/api/bots/" + ping[1] + "/messages", {
      method: "POST",
      headers: { authorization: "Bearer " + process.env.BLOKS_TOKEN, "content-type": "application/json" },
      body: JSON.stringify({ text: "Please run the release checks." }),
    });
    answer = "Asked QA.";
  }
  console.log(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: answer }] } }));
  console.log(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: answer }));
});
`,
    { mode: 0o755 },
  );
  mkdirSync(join(home, ".bloks"), { recursive: true });
  writeFileSync(join(home, ".bloks", "config.json"), JSON.stringify({ instances: { claude: { driver: "claudeAgent", config: { cli } } } }));
  const h = await startHarness({ HOME: home });
  t.after(async () => {
    await h.stop();
    rmSync(home, { recursive: true, force: true });
  });

  const hire = async (name: string) => {
    const { bot } = await h.json("/api/bots", { method: "POST", body: JSON.stringify({ name }) });
    await h.fetch(`/api/bots/${bot.id}`, { method: "PATCH", body: JSON.stringify({ modelSelection: { instanceId: "claude", model: "claude-sonnet-5" } }) });
    return bot;
  };
  const manager = await hire("Manager");
  const qa = await hire("QA");
  const lane = (bot: any) => bot.tasks[0].id as string;
  const messages = async (bot: any) => (await h.json(`/api/bots/${bot.id}/messages?thread=${lane(bot)}&limit=500`)).messages as any[];
  const until = async <T>(check: () => Promise<T | undefined>) => {
    for (let i = 0; i < 200; i++) {
      const v = await check();
      if (v) return v;
      await new Promise((r) => setTimeout(r, 50));
    }
    return undefined;
  };

  await h.fetch(`/api/bots/${manager.id}/messages`, { method: "POST", body: JSON.stringify({ text: `PING ${qa.id}` }) });

  // QA's chat: the message is from Manager, as data, with the words alone
  const arrived = await until(async () => (await messages(qa)).find((m) => m.agent?.dir === "in"));
  assert.ok(arrived, "QA never received the message");
  assert.equal(arrived.role, "user");
  assert.equal(arrived.text, "Please run the release checks.");
  assert.deepEqual(arrived.agent, { dir: "in", peerId: manager.id, peerName: "Manager" });

  // QA's engine was told who it is from and how to answer
  const told = await until(async () =>
    existsSync(heard) ? readFileSync(heard, "utf8").split("\n").find((l) => l.includes("release checks")) : undefined,
  );
  assert.match(told ?? "", /A message from Manager, another agent/);
  assert.match(told ?? "", new RegExp(`bloks say ${manager.id}`));

  // QA's answer belongs to that exchange
  const reply = await until(async () => (await messages(qa)).find((m) => m.agent?.dir === "reply"));
  assert.ok(reply, "QA's answer was not marked as the exchange's reply");
  assert.equal(reply.text, "Got it, on it.");
  assert.equal(reply.agent.peerId, manager.id);

  // Manager's chat keeps a record of sending it, and whether it went
  const sent = await until(async () => (await messages(manager)).find((m) => m.agent?.dir === "out"));
  assert.ok(sent, "Manager's chat has no record of the send");
  assert.equal(sent.agent.peerId, qa.id);
  assert.ok(sent.agent.status === "sent" || sent.agent.status === "queued");
  assert.equal(sent.text, "Please run the release checks.");
  // the person's own message is untouched
  assert.equal((await messages(manager)).find((m) => m.text === `PING ${qa.id}`)?.agent, undefined);

  // the whole exchange, from either side, in order and once
  const { messages: exchange } = await h.json(`/api/bots/${manager.id}/exchange/${qa.id}`);
  assert.deepEqual(
    exchange.map((e: any) => [e.dir, e.fromName, e.toName, e.text]),
    [
      ["in", "Manager", "QA", "Please run the release checks."],
      ["reply", "QA", "Manager", "Got it, on it."],
    ],
  );
  assert.equal(exchange[0].laneTitle, "General");
  const mirrored = await h.json(`/api/bots/${qa.id}/exchange/${manager.id}`);
  assert.equal(mirrored.messages.length, 2);
});
