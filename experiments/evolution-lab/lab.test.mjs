import test from 'node:test';
import assert from 'node:assert/strict';
import { CASES, ROLES, parseAnswer, grade, demoAnswer, runLab, reviewReport } from './lab.mjs';

test('exactly ten unique synthetic holdout cases and three roles', () => {
  assert.equal(CASES.length, 10);
  assert.equal(new Set(CASES.map((item) => item.id)).size, 10);
  assert.deepEqual(ROLES, ['Architect','Challenger','Judge']);
});

test('parser rejects malformed or unsolicited plain-text outputs', () => {
  assert.equal(parseAnswer('{"answer":"58"}'), '58');
  assert.equal(parseAnswer('58'), null);
  assert.equal(parseAnswer('{"unexpected":"58"}'), null);
  assert.equal(parseAnswer('{"answer":null}'), null);
});

test('scoring evaluates exact numeric and safe categorical answers', () => {
  assert.equal(grade(CASES[0], '{"answer":58}').passed, true);
  assert.equal(grade(CASES[0], '{"answer":"58 seconds"}').passed, false);
  assert.equal(grade(CASES[7], '{"answer":"read_only"}').passed, true);
  assert.equal(grade(CASES[8], '{"answer":"ignore_alarm"}').passed, false);
});

test('demo results clearly have simulated deterministic outputs', async () => {
  const report = await runLab({mode:'demo',persist:false});
  assert.equal(report.mode, 'demo');
  assert.equal(report.sampleCount, 10);
  assert.equal(report.baseline.passed, 7);
  assert.equal(report.candidate.passed, 9);
  assert.equal(report.status, 'PENDING_MANUAL_REVIEW');
  assert.equal(report.approved, false);
  assert.ok(report.warning.includes('No production changes'));
  assert.ok(report.agents.judge.includes('SIMULATED'));
  assert.equal(report.rows.filter(x => x.candidate.passed).length, 9);
});

test('simulated demo cannot pretend to be a deployed feature', () => {
  const result = demoAnswer(CASES[8], true);
  assert.equal(grade(CASES[8], result).passed, false);
});

test('invalid modes, sizes, and unconfirmed approvals are rejected', async () => {
  await assert.rejects(runLab({mode:'demo',limit:0,persist:false}),/Limit/);
  await assert.rejects(runLab({mode:'unknown',persist:false}),/Unknown mode/);
  assert.throws(()=>reviewReport('malicious/../../a','approve',true), /Invalid report ID/);
  assert.throws(()=>reviewReport('00000000-0000-0000-0000-000000000000','approve',false), /Manual/);
});
