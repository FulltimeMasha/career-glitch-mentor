// tests/smalls.test.mjs
// Acceptance tests for the gate-smalls pass (28.10.2026, brief §3):
// five point fixes, each with its own test —
//   1. an empty final set carries an exploration plan (no dead end);
//   2. result copy states the ACTUAL number of cards (no "three"
//      with two cards);
//   3. the CDDQ type is recomputed server-side from the stored votes
//      (a flipped type / rewritten votes are rejected — API level);
//   4. a stage call without the stage's required fields is rejected
//      (Point A in the API — engine throws, API answers 400);
//   5. no top-3 card sits below the person's floor without a
//      data-backed reason (floor_status top_decile_only /
//      top_tier_only) — the gate's N5 invariant, checked locally.
// Run from repo root:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadProfessions } from '../api/_lib/engine/professions.mjs';
import { scorePerson } from '../api/_lib/engine/scoring.mjs';
import {
  createSession, applyCddq, applyStage, recomputeCddqType,
} from '../api/_lib/engine/interview.mjs';
import { handleMentorRequest } from '../api/_lib/mentor-core.mjs';

const professions = loadProfessions();

const completePerson = (overrides = {}) => ({
  door: 'start',
  age: 34,
  income_floor_k: 40,
  current_profession_name: null,
  values_rank: { achievement: 3, independence: 2, recognition: 4, relationships: 1, support: 5, working_conditions: 6 },
  autonomy_need: 1,
  relatedness_need: 2,
  riasec: { R: 3, I: 5, A: 4, S: 9, E: 4, C: 6 },
  attempts_started: 2,
  attempts_finished: 1,
  exit_pattern: 'money',
  energy_themes: ['people'],
  barriers: [],
  red_lines: [],
  mirror_confirmed: 'confirmed',
  supports: { money: 1, time: 1, people: 1, learning_access: 1 },
  tolerances: { remote_pref: 1, hands_pref: 1, people_pref: 2 },
  resources: { hours_per_day: 3, budget_k: 5, cushion_months: 6, documents_ok: 'yes', health_limits: ['none'] },
  trials: [],
  perceived_fit: {},
  cddq_type: 'lacks_information',
  completeness: 1,
  ...overrides,
});

// ---------------------------------------------------------------------------
// (3) CDDQ type recompute — the claimed type is ignored; rewritten
// votes are rejected.
// ---------------------------------------------------------------------------
test('cddq recompute: an honest session recomputes to the type applyCddq derived', () => {
  const s = createSession('start');
  applyCddq(s, { cddq_vote_1: 'not_started', cddq_vote_2: 'starting_at_all', cddq_vote_3: 'would_not_act' });
  assert.equal(s.cddq_type, 'not_ready');
  assert.equal(recomputeCddqType(s), 'not_ready');
});

test('cddq recompute: flipping only the claimed type changes nothing — the votes decide', () => {
  const s = createSession('start');
  applyCddq(s, { cddq_vote_1: 'not_started', cddq_vote_2: 'starting_at_all', cddq_vote_3: 'would_not_act' });
  s.cddq_type = 'lacks_information'; // the flip the gate attack performs
  assert.equal(recomputeCddqType(s), 'not_ready', 'the recomputed type comes from the votes, not the claim');
});

test('cddq recompute: rewritten votes (the gate attack payload) throw', () => {
  const s = createSession('start');
  applyCddq(s, { cddq_vote_1: 'not_started', cddq_vote_2: 'starting_at_all', cddq_vote_3: 'would_not_act' });
  s.cddq_type = 'lacks_information';
  for (const k of Object.keys(s.cddq_answers)) s.cddq_answers[k] = 'missing_facts';
  assert.throws(() => recomputeCddqType(s), /recomputeCddqType|applyCddq/, 'missing_facts is not an option of items 2 and 3 — the forgery cannot resolve');
});

test('cddq recompute: two stored copies that disagree throw', () => {
  const s = createSession('start');
  applyCddq(s, { cddq_vote_1: 'not_started', cddq_vote_2: 'starting_at_all', cddq_vote_3: 'would_not_act' });
  // Tamper with only the structured copy: a full lacks_information set.
  s.structured.cddq_vote_1 = 'missing_facts';
  s.structured.cddq_vote_2 = 'missing_knowledge';
  s.structured.cddq_vote_3 = 'would_study_first';
  assert.throws(() => recomputeCddqType(s), /disagree/);
});

test('cddq flip attack is rejected by the API (stage action, 400)', async () => {
  const s = createSession('start');
  applyCddq(s, { cddq_vote_1: 'not_started', cddq_vote_2: 'starting_at_all', cddq_vote_3: 'would_not_act' });
  s.cddq_type = 'lacks_information';
  for (const k of Object.keys(s.cddq_answers)) s.cddq_answers[k] = 'missing_facts';
  const r = await handleMentorRequest({ action: 'stage', session: s, free_text: 'x', tail: {} });
  assert.equal(r.json.ok, false);
  assert.equal(r.status, 400);
});

// ---------------------------------------------------------------------------
// (4) Point A required fields are enforced by the API.
// ---------------------------------------------------------------------------
const POINT_A = {
  country: 'US', age: 34, income_floor_k: 40, cushion_months: 3,
  hours_per_day: 2, budget_k: 1, documents_ok: 'yes',
  health_limits: ['none'], languages: ['en'],
};

test('point A: a stage call with no required fields is rejected by the API (400)', async () => {
  const s = createSession('pivot');
  applyCddq(s, { cddq_vote_1: 'missing_facts', cddq_vote_2: 'missing_knowledge', cddq_vote_3: 'would_study_first' });
  const r = await handleMentorRequest({ action: 'stage', session: s, free_text: 'x', tail: {} });
  assert.equal(r.json.ok, false);
  assert.equal(r.status, 400);
});

test('point A: applyStage throws until every required field of the stage stands filled', () => {
  const s = createSession('pivot');
  applyCddq(s, { cddq_vote_1: 'missing_facts', cddq_vote_2: 'missing_knowledge', cddq_vote_3: 'would_study_first' });
  assert.throws(() => applyStage(s, { freeText: 'x', tailAnswers: {} }), /missing required answers/);
  assert.throws(() => applyStage(s, { freeText: 'x', tailAnswers: { age: 34 } }), /missing required answers/);
  applyStage(s, { freeText: 'x', tailAnswers: { ...POINT_A } });
  assert.equal(s.stage_index, 1, 'a complete Point A applies and advances');
});

test('point A: null in OPTIONAL fields is still accepted (not a required-field failure)', () => {
  const s = createSession('pivot');
  applyCddq(s, { cddq_vote_1: 'missing_facts', cddq_vote_2: 'missing_knowledge', cddq_vote_3: 'would_study_first' });
  applyStage(s, {
    freeText: 'x',
    tailAnswers: { ...POINT_A, current_income_k: null, state: null, current_profession_name: null },
  });
  assert.equal(s.stage_index, 1);
});

// ---------------------------------------------------------------------------
// (1) Empty final set → exploration plan.
// ---------------------------------------------------------------------------
test('empty final set: all finalists vetoed — top3 empty, exploration plan present', () => {
  const person = completePerson();
  const first = scorePerson(person, professions);
  assert.ok(first.top3.length > 0, 'fixture person gets finalists before the veto');
  const slugs = first.top3.map((r) => r.slug);
  const out = scorePerson(completePerson({
    perceived_fit: Object.fromEntries(slugs.map((s) => [s, 'not_mine'])),
    frozen_candidates: slugs,
  }), professions);
  assert.equal(out.top3.length, 0, 'every finalist crossed out — the set is honestly empty');
  assert.ok(Array.isArray(out.exploration_plan) && out.exploration_plan.length > 0,
    'an empty set in verdict mode carries an exploration plan, not a dead end');
  assert.ok(out.exploration_plan.some((l) => l.includes(first.top3[0].name)),
    'the plan starts from the strongest crossed-out finalist by name');
});

// ---------------------------------------------------------------------------
// (2) Copy matches the card count.
// ---------------------------------------------------------------------------
test('copy: a two-card set says "two versions", never "three"', () => {
  const editor = professions.find((p) => p.slug === 'video-editor');
  const pilot = professions.find((p) => p.slug === 'commercial-pilot');
  const out = scorePerson(completePerson({ income_floor_k: 0 }), [editor, pilot]);
  assert.equal(out.top3.length, 2, 'fixture produces exactly two cards');
  assert.ok(!/three versions|these three/i.test(out.set_reason || ''), `set_reason must not claim three: ${out.set_reason}`);
  assert.ok(/not two versions of the same job/.test(out.set_reason || ''), 'the different-worlds line counts the real set');
});

test('copy: a three-card set keeps the honest "three versions" wording', () => {
  const out = scorePerson(completePerson(), professions);
  assert.equal(out.top3.length, 3, 'fixture produces three cards');
  if (/versions of the same job/.test(out.set_reason || '')) {
    assert.ok(/not three versions of the same job/.test(out.set_reason), 'three cards — the line says three');
  }
});

// ---------------------------------------------------------------------------
// (5) Below-floor invariant over the full base (the gate's N5 rule).
// ---------------------------------------------------------------------------
test('below-floor: no top-3 card under the floor without a data-backed top-earner reason', () => {
  const persons = [
    completePerson({ income_floor_k: 90 }),
    completePerson({ income_floor_k: 130 }),
    completePerson({
      income_floor_k: 120,
      values_rank: { recognition: 1, achievement: 2, independence: 3, relationships: 4, working_conditions: 5, support: 6 },
      autonomy_need: 2, relatedness_need: 1,
      riasec: { R: 1.25, I: 5, A: 8.75, S: 6.25, E: 8.75, C: 3.75 },
      tolerances: { remote_pref: 2, hands_pref: 0, people_pref: 2 },
    }),
  ];
  for (const person of persons) {
    const out = scorePerson(person, professions);
    for (const r of out.top3) {
      if (person.income_floor_k > r.payK) {
        assert.ok(['top_decile_only', 'top_tier_only'].includes(r.floor_status),
          `${r.slug} pays $${r.payK}K under the $${person.income_floor_k}K floor with status ${r.floor_status} — no data-backed reason`);
      }
    }
  }
});
