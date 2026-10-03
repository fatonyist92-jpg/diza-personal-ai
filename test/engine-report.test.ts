// Engine scout: which engine's work gets kept, and a lighter one that does as well.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { ENOUGH, engineReport, lighter, weightOf, type Outcome, type TurnLog } from "../server/engine-report.ts";

let n = 0;
const turn = (botId: string, model: string, extra: Partial<TurnLog> = {}): TurnLog => ({
  id: `t${n++}`,
  at: 1_000 + n,
  startedAt: 900 + n,
  botId,
  laneId: "l",
  instanceId: model.startsWith("claude") ? "claude" : "codex",
  model,
  ok: true,
  input: 1000,
  output: 200,
  cost: null,
  ...extra,
});

describe("how heavy a model is", () => {
  test("families, lightest first", () => {
    assert.ok(lighter("claude-sonnet-5", "claude-opus-5-5"));
    assert.ok(lighter("claude-haiku-4-5", "claude-sonnet-5"));
    assert.ok(lighter("gpt-6-luna", "gpt-6-sol"));
    assert.ok(lighter("gemini-3.5-flash-lite", "gemini-3.8-flash"));
    assert.ok(lighter("gemini-3.8-flash", "gemini-3.1-pro-preview"));
    assert.ok(!lighter("claude-opus-5-5", "claude-sonnet-5"));
    assert.ok(!lighter("gpt-6-luna", "claude-opus-5-5"), "different families are not compared");
    assert.equal(weightOf("deepseek-chat"), null);
  });
});

describe("the report", () => {
  const outcomes: Record<string, Outcome> = {};
  const outcomeOf = (t: TurnLog) => outcomes[t.id] ?? (t.ok ? "kept" : "failed");
  const label = (_i: string, m: string) => m;

  test("kept rates count undo, rewind and discard against an engine, and not running out", () => {
    const turns = [
      turn("a", "claude-opus-5-5"),
      turn("a", "claude-opus-5-5"),
      turn("a", "claude-opus-5-5"),
      turn("a", "claude-opus-5-5", { ok: false, out: true }),
    ];
    outcomes[turns[1].id] = "undone";
    outcomes[turns[3].id] = "out";
    const report = engineReport(turns, outcomeOf, label, () => ({ instanceId: "claude", model: "claude-opus-5-5" }));
    const row = report.engines[0];
    assert.equal(row.turns, 4);
    assert.equal(row.undone, 1);
    assert.equal(row.out, 1);
    assert.equal(row.keptRate, 67, "2 of the 3 turns that say anything about quality");
    assert.equal(report.suggestions.length, 0, "not enough to go on");
  });

  test("a lighter model doing as well is suggested, with enough turns on both", () => {
    const turns: TurnLog[] = [];
    for (let i = 0; i < ENOUGH + 2; i++) turns.push(turn("b", "claude-opus-5-5", { cost: 0.2 }));
    for (let i = 0; i < ENOUGH + 2; i++) turns.push(turn("b", "claude-sonnet-5", { cost: 0.05 }));
    outcomes[turns[0].id] = "undone";
    outcomes[turns[ENOUGH + 2].id] = "rewound";
    const report = engineReport(turns, outcomeOf, label, () => ({ instanceId: "claude", model: "claude-opus-5-5" }));
    assert.equal(report.suggestions.length, 1);
    const s = report.suggestions[0];
    assert.equal(s.to.model, "claude-sonnet-5");
    assert.equal(s.saves, 0.15);
    assert.match(s.why, /You kept 90% of claude-sonnet-5's work and 90% of claude-opus-5-5's/);
  });

  test("a lighter model that does noticeably worse is not suggested", () => {
    const turns: TurnLog[] = [];
    for (let i = 0; i < 10; i++) turns.push(turn("c", "gpt-6-sol"));
    for (let i = 0; i < 10; i++) {
      const t = turn("c", "gpt-6-luna");
      if (i < 3) outcomes[t.id] = "undone";
      turns.push(t);
    }
    const report = engineReport(turns, outcomeOf, label, () => ({ instanceId: "codex", model: "gpt-6-sol" }));
    assert.equal(report.suggestions.length, 0);
  });
});
