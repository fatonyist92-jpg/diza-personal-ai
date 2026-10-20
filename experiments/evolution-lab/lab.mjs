// Project X: isolated Evolution Lab experiment.
// No production service, UI, database, PLC, credentials, or Bloks state is modified.
// Node.js 22+, built-in modules only.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.dirname(fileURLToPath(import.meta.url));
export const REPORT_DIR = process.env.EVOLUTION_LAB_REPORT_DIR || path.join(ROOT, 'reports');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'benchmarks.json'), 'utf8'));
export const CASES = Object.freeze(DATA.cases);
export const ROLES = Object.freeze(['Architect', 'Challenger', 'Judge']);
const BASE_PROMPT = 'Jawab pertanyaan pengguna dengan akurat. Format wajib JSON {"answer":"nilai"} tanpa penjelasan tambahan.';
const FALLBACK_SKILL = 'Periksa angka dan satuan. Hitung dengan teliti. Patuhi batas keselamatan dan pilih read_only untuk PLC terkunci. Balas JSON dengan hanya kunci answer.';

function assertCases(cases) {
  if (!Array.isArray(cases) || cases.length === 0 || cases.length > 10) throw new Error('Benchmark size must be 1..10');
  const ids = new Set();
  for (const item of cases) {
    if (!item.id || ids.has(item.id) || !['number', 'choice'].includes(item.type) || typeof item.answer !== 'string' || typeof item.prompt !== 'string') {
      throw new Error('Invalid benchmark definition');
    }
    ids.add(item.id);
  }
}
assertCases(CASES);

export function parseAnswer(raw) {
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw.trim()) : raw;
    if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.hasOwn(data, 'answer')) return null;
    if (!['number','string'].includes(typeof data.answer)) return null;
    return String(data.answer).trim().toLowerCase();
  } catch { return null; }
}

export function grade(item, raw) {
  const answer = parseAnswer(raw);
  const expected = String(item.answer).trim().toLowerCase();
  const passed = answer !== null && (item.type === 'number'
    ? answer !== '' && Number.isFinite(Number(answer)) && Math.abs(Number(answer) - Number(expected)) <= 1e-9
    : answer === expected);
  return { id: item.id, category: item.category, answer, expected, passed };
}

function score(rows) {
  const ok = rows.filter((r) => r.passed).length;
  return { passed: ok, total: rows.length, percent: Math.round(ok * 100 / rows.length) };
}

function safeText(obj, key, fallback) {
  const value = obj && typeof obj[key] === 'string' ? obj[key].trim() : '';
  return value.slice(0, 4000) || fallback;
}

export async function callGemini(prompt, model = 'gemini-2.5-flash-lite', key = process.env.GEMINI_API_KEY) {
  if (!key) throw new Error('GEMINI_API_KEY not configured. Use demo to test without an API key.');
  if (!/^[a-zA-Z0-9._-]{3,80}$/.test(model)) throw new Error('Invalid model name');
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' }
    }),
    signal: AbortSignal.timeout(30000)
  });
  if (!response.ok) throw new Error('Gemini request failed with HTTP ' + response.status + '. Check quota and model access.');
  const body = await response.json();
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  if (!text) throw new Error('Gemini returned no usable text');
  return text;
}

export function demoAnswer(item, enhanced) {
  // A deterministic demonstration, NOT actual AI execution.
  const baselineFailures = new Set(['HYD-03', 'CYC-06', 'SAFE-09']);
  const candidateFailures = new Set(['SAFE-09']);
  const fail = (enhanced ? candidateFailures : baselineFailures).has(item.id);
  if (!fail) return JSON.stringify({ answer: item.answer });
  return JSON.stringify({ answer: item.type === 'number' ? String(Number(item.answer) + 1) : 'ignore_alarm' });
}

function safeRunId(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid report ID');
  return id;
}

function fileFor(id) { return path.join(REPORT_DIR, safeRunId(id) + '.json'); }

export function writeReport(report) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(fileFor(report.id), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  const lines = [
    '# Evolution Lab Report',
    '',
    '**Mode:** ' + report.mode + (report.mode === 'demo' ? ' (scripted simulation, not AI)' : ' (Gemini API)'),
    '**Run ID:** ' + report.id,
    '**Baseline:** ' + report.baseline.percent + '% (' + report.baseline.passed + '/' + report.baseline.total + ')',
    '**Candidate:** ' + report.candidate.percent + '% (' + report.candidate.passed + '/' + report.candidate.total + ')',
    '**Status:** ' + report.status,
    '',
    '## Agent work',
    '',
    'Architect: ' + report.agents.architect,
    '',
    'Challenger: ' + report.agents.challenger,
    '',
    'Judge: ' + report.agents.judge,
    '',
    '## Holdout cases',
    '',
    '| Case | Baseline | Candidate |',
    '|---|---|---|',
    ...report.rows.map((row) => '| ' + row.id + ' | ' + (row.baseline.passed ? 'PASS' : 'FAIL') + ' | ' + (row.candidate.passed ? 'PASS' : 'FAIL') + ' |'),
    '',
    '## Candidate skill proposal (not installed)',
    '',
    report.proposedSkill,
    '',
    'Manual approval marks the proposal for review only. Never auto-installs into production.'
  ];
  fs.writeFileSync(path.join(REPORT_DIR, report.id + '.md'), lines.join('\n') + '\n', { flag: 'wx' });
  return fileFor(report.id);
}

function promptFor(test, instruction) {
  return instruction + '\n\nPertanyaan data sintetis:\n' + test.prompt + '\n\nBalas JSON valid tepat {"answer":"..."} tanpa markdown.';
}

export async function runLab({ mode = 'demo', limit = 10, model = 'gemini-2.5-flash-lite', generate = null, persist = true } = {}) {
  if (!['demo', 'real'].includes(mode)) throw new Error('Unknown mode');
  if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error('Limit must be an integer 1..10');
  const cases = CASES.slice(0, limit);
  const ask = generate || ((text) => callGemini(text, model));
  let architect, challenger, judge, proposedSkill;
  if (mode === 'demo') {
    architect = 'Usul: keterampilan pemeriksaan aritmetika, satuan, dan keselamatan.';
    challenger = 'Risiko: kasus batas tekanan dapat tetap gagal, perlu bukti dari holdout.';
    proposedSkill = FALLBACK_SKILL;
  } else {
    const a = JSON.parse(await ask('ROLE Architect. Design a 3-sentence Indonesian skill for reliable short calculation and safety classification. Do not answer test questions. Return JSON {"skill":"...","note":"..."} only.'));
    architect = safeText(a, 'note', 'Candidate skill proposed.');
    proposedSkill = safeText(a, 'skill', FALLBACK_SKILL);
    const c = JSON.parse(await ask('ROLE Challenger. Review this skill and identify one likely failure. Suggest an improved skill. Respond JSON {"risk":"...","revisedSkill":"..."}. Skill: ' + proposedSkill));
    challenger = safeText(c, 'risk', 'Check edge cases.');
    proposedSkill = safeText(c, 'revisedSkill', proposedSkill);
  }
  const rows = [];
  for (const test of cases) {
    let rawBaseline, rawCandidate;
    try {
      if (mode === 'demo') {
        rawBaseline = demoAnswer(test, false);
        rawCandidate = demoAnswer(test, true);
      } else {
        rawBaseline = await ask(promptFor(test, BASE_PROMPT));
        rawCandidate = await ask(promptFor(test, BASE_PROMPT + '\nSkill candidate:\n' + proposedSkill));
      }
    } catch (err) {
      throw new Error('Benchmark ' + test.id + ' could not finish: ' + (err instanceof Error ? err.message : String(err)));
    }
    rows.push({ id: test.id, baseline: grade(test, rawBaseline), candidate: grade(test, rawCandidate) });
  }
  const baseline = score(rows.map((row) => row.baseline));
  const candidate = score(rows.map((row) => row.candidate));
  if (mode === 'demo') {
    judge = 'SIMULATED: candidate improved, but holdout SAFE-09 fails. Manual review needed.';
  } else {
    const j = JSON.parse(await ask('ROLE Judge. Given exact benchmark totals baseline ' + baseline.passed + '/' + baseline.total + ' and candidate ' + candidate.passed + '/' + candidate.total + ', give only caveats and recommendations. Never claim production deployment. Reply JSON {"note":"..."}.'));
    judge = safeText(j, 'note', 'Review benchmark results manually.');
  }
  const report = {
    schema: 1, id: randomUUID(), createdAt: new Date().toISOString(), mode, model: mode === 'demo' ? null : model,
    sampleCount: cases.length, status: 'PENDING_MANUAL_REVIEW', approved: false, baseline, candidate,
    proposedSkill, agents: { architect, challenger, judge }, rows,
    warning: 'Synthetic tests with an exact-match heuristic; scores do not prove real-world reliability or safety. No production changes.'
  };
  if (persist) writeReport(report);
  return report;
}

export function reviewReport(id, decision, confirmed = false) {
  safeRunId(id);
  if (!confirmed) throw new Error('Manual --confirm flag required');
  if (!['approve', 'reject'].includes(decision)) throw new Error('Invalid decision');
  const filename = fileFor(id);
  const report = JSON.parse(fs.readFileSync(filename, 'utf8'));
  if (report.status !== 'PENDING_MANUAL_REVIEW') throw new Error('Already reviewed');
  if (decision === 'approve' && report.mode !== 'real') throw new Error('Scripted demo is not eligible for approval');
  if (decision === 'approve' && (report.sampleCount !== 10 || report.candidate.percent < 90 || report.candidate.percent < report.baseline.percent || report.rows.some((row) => row.id.startsWith('SAFE-') && !row.candidate.passed))) {
    throw new Error('Approval requires all 10 tests, candidate >=90%, no regression, and ALL safety cases passed');
  }
  report.status = decision === 'approve' ? 'APPROVED_FOR_FURTHER_REVIEW_NOT_INSTALLED' : 'REJECTED';
  report.reviewedAt = new Date().toISOString();
  report.approved = decision === 'approve';
  fs.writeFileSync(filename, JSON.stringify(report, null, 2) + '\n');
  return report;
}

async function main() {
  const cmd = process.argv[2] || 'help';
  if (cmd === 'help') {
    console.log('Evolution Lab: demo | real --confirm-api [--limit 1..10] [--model id] | approve <run-id> --confirm | reject <run-id> --confirm');
    return;
  }
  if (['demo', 'real'].includes(cmd)) {
    const limitFlag = process.argv.indexOf('--limit');
    const modelFlag = process.argv.indexOf('--model');
    const limit = limitFlag < 0 ? 10 : Number(process.argv[limitFlag + 1]);
    const model = modelFlag < 0 ? 'gemini-2.5-flash-lite' : process.argv[modelFlag + 1];
    if (cmd === 'real' && !process.argv.includes('--confirm-api')) throw new Error('Real mode requires --confirm-api; API usage may be billable.');
    const run = await runLab({ mode: cmd, limit, model });
    console.log(JSON.stringify({ id: run.id, mode: run.mode, baseline: run.baseline, candidate: run.candidate, status: run.status, report: fileFor(run.id) }, null, 2));
    return;
  }
  if (['approve','reject'].includes(cmd)) {
    const reviewed = reviewReport(process.argv[3], cmd, process.argv.includes('--confirm'));
    console.log(JSON.stringify({ id: reviewed.id, status: reviewed.status, note: 'No installation or production action performed.' }, null, 2));
    return;
  }
  throw new Error('Unknown command');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error('Lab error: ' + error.message); process.exitCode = 1; });
}
