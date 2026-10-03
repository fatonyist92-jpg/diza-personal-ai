// The morning brief: what it says, when it comes.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { briefDue, composeBrief, gist, parseBriefTime } from "../server/brief.ts";
import { startHarness, type Harness } from "./helpers/server.ts";

const hour = 60 * 60 * 1000;
const now = new Date(2026, 8, 27, 8, 0).getTime();

describe("composing a brief", () => {
  const input = {
    since: now - 12 * hour,
    now,
    person: "Hamed",
    agents: [
      {
        id: "a1",
        name: "Scout",
        lanes: [
          {
            threadId: "t1",
            title: "Launch plan",
            messages: [
              { at: now - 20 * hour, role: "bot" as const, kind: "text", text: "Old news from yesterday." },
              { at: now - 3 * hour, role: "user" as const, kind: "text", text: "Move it to Friday" },
              { at: now - 2 * hour, role: "bot" as const, kind: "text", text: "**Done.** I moved the launch to Friday. Also updated [the plan](https://x.y). Third sentence here." },
              { at: now - 2 * hour, role: "bot" as const, kind: "changes", changes: { total: 2 } },
            ],
          },
        ],
      },
      { id: "a2", name: "Ivy", lanes: [{ threadId: "t2", title: "General", messages: [] }] },
    ],
    waiting: [
      { botId: "a1", name: "Scout", title: "npm publish", threadId: "t1", messageId: "m9", requestId: "r1", kind: "approval" as const },
    ],
    spend: { turns: 7, cost: 0.42, costKnown: true },
    ready: [{ label: "rehearsal", count: 1 }, { label: "note about you", count: 0 }],
  };

  test("each agent that worked says its part, in plain words, linked to where", () => {
    const brief = composeBrief(input, "b1");
    assert.equal(brief.headline, "1 agent worked on 1 thing, 1 thing waiting on you.");
    const scout = brief.parts.find((p) => p.botId === "a1")!;
    assert.equal(scout.items[0].threadId, "t1");
    assert.equal(scout.items[0].text, "Launch plan: Done. I moved the launch to Friday. (2 files changed)");
    assert.match(scout.script, /^Scout here\. Launch plan: Done\. I moved the launch to Friday\.$/);
    assert.ok(!brief.parts.some((p) => p.botId === "a2"), "an agent that did nothing is not in it");
  });

  test("it opens with the day and closes with what is waiting", () => {
    const brief = composeBrief(input, "b1");
    assert.match(brief.parts[0].script, /^Good morning, Hamed\. 1 agent worked on 1 thing.*about \$0\.42/);
    const last = brief.parts[brief.parts.length - 1];
    assert.match(last.script, /Scout wants your OK to: npm publish/);
    assert.match(last.script, /1 rehearsal ready for a look/);
    assert.deepEqual(brief.ready, [{ label: "rehearsal", count: 1 }]);
  });

  test("a quiet night says so", () => {
    const brief = composeBrief({ ...input, agents: [], waiting: [], ready: [] }, "b2");
    assert.equal(brief.quiet, true);
    assert.match(brief.headline, /quiet night/);
  });

  test("gist makes speech out of markdown", () => {
    assert.equal(gist("## Plan\n- **Ship** it `now`\n```js\nx()\n```\nSee https://a.b ok."), "Plan Ship it now See ok.");
  });
});

describe("when it is due", () => {
  test("after the chosen time, once a day", () => {
    const at = (h: number, m = 0) => new Date(2026, 8, 27, h, m);
    assert.equal(briefDue("08:00", null, at(7, 59)), false);
    assert.equal(briefDue("08:00", null, at(8, 0)), true);
    assert.equal(briefDue("08:00", "2026-09-27", at(9)), false);
    assert.equal(briefDue("08:00", "2026-09-26", at(22)), true, "a Mac asleep at eight catches up");
    assert.equal(parseBriefTime("7:30"), null);
    assert.equal(parseBriefTime("07:30"), "07:30");
    assert.equal(parseBriefTime("24:00"), null);
  });
});

describe("through the server", () => {
  let h: Harness;
  before(async () => {
    h = await startHarness();
  });
  after(() => h.stop());

  test("make one now, read it, and change the time", async () => {
    const made = await h.fetch("/api/briefs", { method: "POST" });
    assert.equal(made.status, 201);
    const { brief } = await made.json();
    assert.ok(brief.headline);
    let list = await h.json("/api/briefs");
    assert.equal(list.briefs[0].id, brief.id);
    assert.equal(list.settings.time, "08:00");
    await h.fetch(`/api/briefs/${brief.id}/read`, { method: "POST" });
    const bad = await h.fetch("/api/briefs/settings", { method: "PATCH", body: JSON.stringify({ time: "8am" }) });
    assert.equal(bad.status, 400);
    await h.fetch("/api/briefs/settings", { method: "PATCH", body: JSON.stringify({ time: "07:15", enabled: false }) });
    list = await h.json("/api/briefs");
    assert.deepEqual(list.settings, { enabled: false, time: "07:15" });
    assert.ok(list.briefs[0].readAt);
  });
});

describe("what counts", () => {
  test("a greeting nobody asked for is not work, and plurals read right", () => {
    const now = Date.now();
    const brief = composeBrief(
      {
        since: now - 3_600_000,
        now,
        agents: [{ id: "n", name: "Nova", lanes: [{ threadId: "t", title: "General", messages: [{ at: now - 1000, role: "bot", kind: "text", text: "I'm Nova, ready when you are." }] }] }],
        waiting: [],
        spend: { turns: 0, cost: 0, costKnown: false },
        ready: [{ label: "note about you", many: "notes about you", count: 2 }],
      },
      "b",
    );
    assert.equal(brief.parts.filter((p) => p.botId).length, 0);
    assert.match(brief.parts[brief.parts.length - 1].script, /2 notes about you ready for a look/);
  });
});
