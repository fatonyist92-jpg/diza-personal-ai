// Cloud computers sleep when idle, and wake before a turn needs them.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";

import { isAwake } from "../server/box.ts";
import { startHarness, type Harness } from "./helpers/server.ts";

describe("sleeping computers", () => {
  test("only a box in a working state counts as awake", () => {
    assert.equal(isAwake({ state: "ready" }), true);
    assert.equal(isAwake({ state: "running" }), true);
    assert.equal(isAwake({ state: "archived" }), false);
    assert.equal(isAwake({ state: "stopping" }), false);
    assert.equal(isAwake(null), false);
  });

  let h: Harness;
  before(async () => {
    h = await startHarness();
  });
  after(() => h.stop());

  test("the idle time is a setting, twenty minutes unless changed", async () => {
    assert.deepEqual(await h.json("/api/box/settings"), { sleepAfter: 20 });
    const bad = await h.fetch("/api/box/settings", { method: "PATCH", body: JSON.stringify({ sleepAfter: -5 }) });
    assert.equal(bad.status, 400);
    assert.deepEqual(await h.json("/api/box/settings", { method: "PATCH", body: JSON.stringify({ sleepAfter: 60 }) }), { sleepAfter: 60 });
    assert.deepEqual(await h.json("/api/box/settings"), { sleepAfter: 60 });
  });
});
