// tests/verify.test.mjs
// Unit tests for the report verification layer (engine/verify.mjs) and
// its orchestration + the matchmaker checklist (engine/interview.mjs).
// No LLM calls: the claim checker and the report generator are injected.
// Run from repo root:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { auditNumbers, verifyReport, buildGroundTruth, removeSentences, extractFigures } from '../api/_lib/engine/verify.mjs';
import { generateVerifiedReport, buildChecklist } from '../api/_lib/engine/interview.mjs';

// ---------------------------------------------------------------------------
// Fixtures — a finished bands-mode session with one top pick (Doula).
// Doula: pay $75K, training 12 months, Chemistry 0.50–0.80,
// Long-term potential 0.40–0.70. Person: floor $40K, cushion 12 months.
// ---------------------------------------------------------------------------
function fakeSession(overrides = {}) {
  return {
    door: 'start',
    phase: 'done',
    stage_index: 6,
    cddq_type: 'lacks_information',
    structured: {},
    transcript: [
      { stage: 0, who: 'user', text: 'I am 30, retail associate, about $38K a year. I have a year of cushion and 4 hours a day.' },
      { stage: 1, who: 'user', text: 'I finished two of the three things I started. Training new people gave me energy.' },
    ],
    candidates: null,
    result: {
      mode: 'bands',
      mode_reason: 'fixture',
      income_floor_k: 40,
      top3: [{
        slug: 'doula', name: 'Doula', category: 'people', verdict: 'YES',
        payK: 75, pay_top_quartile_k: null, training_months: 12,
        love: { lo: 0.5, mid: 0.65, hi: 0.8 }, potential: { lo: 0.4, mid: 0.55, hi: 0.7 },
        floor_status: 'clears', confidence: 'high', flags: [],
        argument: { why_you: [], math: [], but: [], bridge: [] },
      }],
      bottom3: [],
      exploration_plan: [],
    },
    person: {
      door: 'start', age: 30, income_floor_k: 40, current_income_k: 38,
      current_profession_name: 'Retail Sales Associate',
      resources: { hours_per_day: 4, budget_k: 20, cushion_months: 12, documents_ok: 'yes', health_limits: ['none'] },
      values_rank: { achievement: 4, independence: 5, recognition: 6, relationships: 1, support: 2, working_conditions: 3 },
      autonomy_need: 1, relatedness_need: 2, supports: null, tolerances: null,
      attempts_started: 3, attempts_finished: 2, exit_pattern: 'money',
      energy_themes: ['people'], barriers: ['money'], red_lines: [],
      mirror_confirmed: 'confirmed', perceived_fit: {}, cddq_type: 'lacks_information', completeness: 1,
    },
    report: null,
    verification: null,
    ...overrides,
  };
}

const CLEAN_REPORT = [
  'You are 30, a retail associate on about $38K a year, and your floor is $40K.',
  'Doula is your strongest fit. Typical pay is about $75K a year, which clears your $40K minimum.',
  'Chemistry runs 0.50–0.80 and Long-term potential 0.40–0.70. Training takes about 12 months, and at roughly $6,250 a month the pay covers your floor from the first paycheck.',
  'You finished two of the three serious things you started, and training new people is the part of retail that gave you energy.',
].join('\n\n');

// ---------------------------------------------------------------------------
// Number audit
// ---------------------------------------------------------------------------

test('number audit: a report built from checked figures passes clean', () => {
  const issues = auditNumbers(fakeSession(), CLEAN_REPORT);
  assert.deepEqual(issues, []);
});

test('number audit: invented pay and an invented percent are caught, with sentences', () => {
  const bad = 'Doula pays about $200K a year, and demand for it will grow 95% by 2030. Your floor is $40K.';
  const issues = auditNumbers(fakeSession(), bad);
  const tokens = issues.map((i) => i.token);
  assert.ok(tokens.some((t) => t.includes('200')), `expected the $200K figure flagged, got ${JSON.stringify(issues)}`);
  assert.ok(tokens.some((t) => t.includes('95%')), `expected the 95% figure flagged, got ${JSON.stringify(issues)}`);
  assert.ok(issues.every((i) => typeof i.sentence === 'string' && i.sentence.length > 0));
  // The true floor figure in the same text is NOT flagged.
  assert.ok(!issues.some((i) => i.sentence.includes('floor is $40K') && i.token.includes('40')));
});

test('number audit: figures the person stated themselves are grounded', () => {
  // "$38K" only exists in the person's own transcript, not in scoring.
  assert.deepEqual(auditNumbers(fakeSession(), 'You earn about $38K today.'), []);
  // An off-band score decimal is not grounded anywhere.
  const issues = auditNumbers(fakeSession(), 'Your Chemistry is 0.99 on this one.');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, 'number');
});

test('ground truth: result-vs-base drift is logged, not counted as a report failure', async () => {
  const professions = [{ slug: 'doula', name: 'Doula', payK: 84, training_months: 12 }];
  const gt = buildGroundTruth(fakeSession(), professions);
  assert.equal(gt.drift.length, 1);
  assert.match(gt.drift[0], /Doula/);
  // The report repeats the SCORING figure ($75K) — verification passes;
  // the drift rides along in the result for the data team.
  const v = await verifyReport(fakeSession(), CLEAN_REPORT, { professions, claimChecker: async () => [] });
  assert.equal(v.ok, true);
  assert.equal(v.drift.length, 1);
});

// ---------------------------------------------------------------------------
// Claim audit + full verification (injected checker)
// ---------------------------------------------------------------------------

test('verifyReport: an unsupported claim about the person fails the check', async () => {
  const claimChecker = async () => [{
    sentence: 'You told me you hate working with people.',
    claim: 'the person hates working with people',
  }];
  const v = await verifyReport(fakeSession(), CLEAN_REPORT + '\n\nYou told me you hate working with people.', { claimChecker });
  assert.equal(v.ok, false);
  assert.equal(v.status, 'failed');
  assert.equal(v.claimIssues.length, 1);
});

test('verifyReport: checker infrastructure failure is an error, never a silent pass', async () => {
  const v = await verifyReport(fakeSession(), CLEAN_REPORT, {
    claimChecker: async () => { throw new Error('API down'); },
  });
  assert.equal(v.ok, false);
  assert.equal(v.status, 'error');
  assert.equal(v.claimsStatus, 'error');
});

test('verifyReport: a checker that hiccups once is retried, not failed', async () => {
  let calls = 0;
  const v = await verifyReport(fakeSession(), CLEAN_REPORT, {
    claimChecker: async () => {
      calls += 1;
      if (calls === 1) throw new Error('response incomplete: max_output_tokens');
      return [];
    },
  });
  assert.equal(calls, 2);
  assert.equal(v.ok, true);
  assert.equal(v.claimsStatus, 'ok');
});

// ---------------------------------------------------------------------------
// Orchestration: regenerate once with feedback, then sign — or cut + no sign
// ---------------------------------------------------------------------------

test('generateVerifiedReport: first draft fails, corrected draft passes and is signed', async () => {
  const session = fakeSession();
  const seen = [];
  const reportGenerator = async (s, opts) => {
    seen.push(opts);
    return seen.length === 1
      ? 'Doula pays about $200K a year. ' + CLEAN_REPORT
      : CLEAN_REPORT;
  };
  const text = await generateVerifiedReport(session, null, { reportGenerator, claimChecker: async () => [] });
  assert.equal(text, CLEAN_REPORT);
  assert.equal(seen.length, 2);
  assert.match(seen[1].verifyFeedback, /200/);
  assert.equal(session.verification.status, 'passed');
  assert.equal(session.verification.signed, true);
  assert.equal(session.verification.attempts, 2);
  assert.equal(session.report, CLEAN_REPORT);
});

test('generateVerifiedReport: a stubbornly wrong draft is cut and goes out unsigned', async () => {
  const session = fakeSession();
  const badSentence = 'Doula pays about $200K a year, guaranteed.';
  const reportGenerator = async () => `${badSentence}\n\n${CLEAN_REPORT}`;
  const text = await generateVerifiedReport(session, null, { reportGenerator, claimChecker: async () => [] });
  assert.ok(!text.includes('200K'), 'the unsupported sentence must be cut');
  assert.ok(text.includes('Doula is your strongest fit'), 'the good text survives the cut');
  assert.equal(session.verification.signed, false);
  assert.equal(session.verification.status, 'failed');
  assert.equal(session.verification.sanitized, true);
  assert.equal(session.verification.attempts, 2);
});

// ---------------------------------------------------------------------------
// Sentence cutter + checklist
// ---------------------------------------------------------------------------

test('removeSentences drops the named sentence and keeps the rest', () => {
  const text = 'Good one here. Bad figure $200K lives here. Another good one.';
  const { text: out, removed } = removeSentences(text, ['Bad figure $200K lives here.']);
  assert.equal(removed, 1);
  assert.ok(!out.includes('200K'));
  assert.ok(out.includes('Good one here.'));
  assert.ok(out.includes('Another good one.'));
});

test('buildChecklist follows the stage machine', () => {
  const at = (phase, stage_index, mode) => buildChecklist({ phase, stage_index, result: mode ? { mode } : null });
  const byKey = (list) => Object.fromEntries(list.map((i) => [i.key, i.state]));

  let s = byKey(at('cddq', -1));
  assert.equal(s.answers, 'current');
  assert.equal(s.market, 'todo');

  s = byKey(at('stages', 3));
  assert.equal(s.answers, 'done');
  assert.equal(s.story, 'done');
  assert.equal(s.blockers, 'current');
  assert.equal(s.trial, 'todo');

  s = byKey(at('stage6', 6));
  assert.equal(s.market, 'done');
  assert.equal(s.trial, 'current');

  s = byKey(at('done', 6, 'bands'));
  assert.ok(Object.values(s).every((v) => v === 'done'));

  s = byKey(at('done', 6, 'insufficient_data'));
  assert.equal(s.market, 'done');
  assert.equal(s.trial, 'todo'); // no verdict -> no first date happened
});

test('extractFigures: ranges carry their unit to both endpoints', () => {
  const figs = extractFigures('Pay runs $45–60K and Chemistry 0.50–0.80, demand up 13%.');
  const money = figs.filter((f) => f.type === 'moneyK').map((f) => f.value);
  assert.deepEqual(money.sort(), [45, 60]);
  const dec = figs.filter((f) => f.type === 'decimal').map((f) => f.value);
  assert.deepEqual(dec.sort(), [0.5, 0.8]);
  assert.ok(figs.some((f) => f.type === 'percent' && f.value === 13));
});
