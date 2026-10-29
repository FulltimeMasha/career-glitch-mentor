// tests/result-extras.test.mjs
// Matchmaker 2.0 extension (brief 28.10 §5.4-5.6): the deterministic
// result decorations — bridge evaluation rules, OEWS state pay, and the
// real-programs attachment. Run from repo root: npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadProfessions } from '../api/_lib/engine/professions.mjs';
import { buildBridgeEvaluation, professionFieldKey } from '../api/_lib/engine/bridge-eval.mjs';
import { statePayFor, normalizeState } from '../api/_lib/engine/state-pay.mjs';
import { programsForStep } from '../api/_lib/engine/programs.mjs';
import { decorateResult } from '../api/_lib/engine/result-extras.mjs';

const professions = loadProfessions();
const bySlug = new Map(professions.map((p) => [p.slug, p]));
const fieldOf = (slug) => {
  const p = bySlug.get(slug);
  return p ? professionFieldKey(p) : null;
};

// ---------------------------------------------------------------- bridge
test('bridge: no foreign degree -> no evaluation', () => {
  assert.equal(buildBridgeEvaluation({ degree_status: 'us_degree' }, [], fieldOf), null);
  assert.equal(buildBridgeEvaluation({}, [], fieldOf), null);
  assert.equal(buildBridgeEvaluation(null, [], fieldOf), null);
});

test('bridge: engineering degree -> WES/ECE first, then FE/EIT -> PE', () => {
  const be = buildBridgeEvaluation(
    { degree_status: 'foreign_degree', degree_field: 'engineering', degree_level: 'bachelor', degree_country: 'Belarus', degree_years: 10 },
    ['registered-nurse'], fieldOf);
  assert.ok(be);
  assert.equal(be.degree.field, 'engineering');
  assert.equal(be.degree.field_label, 'Engineering');
  assert.equal(be.degree.country, 'Belarus');
  assert.equal(be.steps[0].id, 'credential_evaluation');
  assert.match(be.steps[0].title, /WES/);
  const ids = be.steps.map((s) => s.id);
  assert.ok(ids.includes('fe_eit'), 'FE/EIT step present');
  assert.ok(ids.includes('pe'), 'PE step present');
  // Marina's case: degree field != nursing target -> no in-field credit claim.
  assert.equal(be.credit.rule, 'no_months_reduction');
  assert.equal(be.credit.target_in_field, null);
});

test('bridge: nursing degree aiming at RN -> target in field, NCLEX route', () => {
  const be = buildBridgeEvaluation(
    { degree_status: 'foreign_degree', degree_field: 'nursing', degree_level: 'bachelor' },
    ['registered-nurse'], fieldOf);
  assert.ok(be);
  assert.equal(be.credit.target_in_field, 'registered-nurse');
  assert.ok(be.steps.some((s) => s.id === 'nclex'));
});

test('bridge: medicine -> ECFMG + USMLE + residency', () => {
  const be = buildBridgeEvaluation(
    { degree_status: 'foreign_degree', degree_field: 'medicine' }, [], fieldOf);
  const ids = be.steps.map((s) => s.id);
  assert.deepEqual(ids, ['credential_evaluation', 'ecfmg', 'usmle', 'residency']);
});

test('bridge: unknown field falls back to the generic route, still WES/ECE first', () => {
  const be = buildBridgeEvaluation(
    { degree_status: 'foreign_degree', degree_field: 'astrology' }, [], fieldOf);
  assert.equal(be.degree.field, 'other');
  assert.equal(be.steps[0].id, 'credential_evaluation');
});

test('bridge: profession field mapping is by the licensed role, not IT titles', () => {
  assert.equal(professionFieldKey(bySlug.get('registered-nurse')), 'nursing');
  assert.equal(professionFieldKey({ name: 'Civil Engineer' }), 'engineering');
  assert.equal(professionFieldKey({ name: 'Software Engineer' }), 'it_computing');
  assert.equal(professionFieldKey({ name: 'Architect' }), 'architecture');
  assert.equal(professionFieldKey({ name: 'Caterer' }), null);
});

// ------------------------------------------------------------ state pay
test('state pay: RN in NC matches the OEWS May 2024 extract', () => {
  const sp = statePayFor('29-1141.00', 'NC');
  assert.ok(sp);
  assert.equal(sp.state, 'NC');
  assert.equal(sp.name, 'North Carolina');
  assert.equal(sp.median_k, 81.9); // BLS OEWS May 2024, NC, SOC 29-1141
});

test('state pay: state names normalize; unbuilt states give null', () => {
  assert.equal(normalizeState('North Carolina'), 'NC');
  assert.equal(normalizeState('nc'), 'NC');
  assert.equal(normalizeState('FL'), 'FL');
  assert.equal(normalizeState('Florida'), 'FL');
  assert.equal(normalizeState('Texas'), null);
  assert.equal(statePayFor('29-1141.00', 'Texas'), null);
  assert.equal(statePayFor(null, 'NC'), null);
});

test('state pay: FL RN row exists with its own figure', () => {
  const sp = statePayFor('29-1141.00', 'FL');
  assert.ok(sp);
  assert.equal(sp.median_k, 82.9);
});

// ------------------------------------------------------------- programs
test('programs: CNA in NC returns real programs with price and duration', () => {
  const list = programsForStep('certified-nursing-assistant', 'NC');
  assert.ok(Array.isArray(list) && list.length >= 1 && list.length <= 3);
  for (const p of list) {
    assert.ok(p.school && p.program, 'school + program named');
    assert.ok(typeof p.cost_k === 'number' && p.cost_k > 0, 'price present');
    assert.ok(typeof p.months === 'number' && p.months > 0, 'duration present');
    assert.ok(p.source, 'source recorded');
  }
  // Ranked cheapest first (fit by cost/duration; no commissions exist).
  const costs = list.map((p) => p.cost_k);
  assert.deepEqual(costs, [...costs].sort((a, b) => a - b));
});

test('programs: unfilled clusters are honestly empty', () => {
  assert.equal(programsForStep('certified-nursing-assistant', 'FL'), null);
  assert.equal(programsForStep('electrician', 'NC'), null);
  assert.equal(programsForStep('certified-nursing-assistant', 'Texas'), null);
});

// ------------------------------------------------------------ decorator
test('decorator: Marina-shaped session gets bridge, NC pay and CNA programs', () => {
  const rn = bySlug.get('registered-nurse');
  assert.ok(rn, 'RN in the base');
  const session = {
    structured: {
      state: 'NC',
      degree_status: 'foreign_degree', degree_field: 'engineering',
      degree_level: 'bachelor', degree_country: 'Belarus', degree_years: 10,
    },
    result: {
      mode: 'direct',
      top3: [],
      target_evaluation: [{
        slug: 'registered-nurse', name: 'Registered Nurse', matched: true, pay_k: rn.payK,
        ladder: { entry_steps: [{ slug: 'certified-nursing-assistant', name: 'Certified Nursing Assistant', training_months: 2, cost_k: 1 }], next_steps: [], prerequisites: [] },
        floor_path: { reaches_floor: true, steps: [
          { slug: 'certified-nursing-assistant', name: 'Certified Nursing Assistant', pay_k: 42 },
          { slug: 'registered-nurse', name: 'Registered Nurse', pay_k: 98 },
        ] },
      }],
    },
  };
  decorateResult(session, professions);
  const r = session.result;
  // (e) bridge evaluation names the engineering degree + WES route
  assert.ok(r.bridge_evaluation);
  assert.equal(r.bridge_evaluation.degree.field, 'engineering');
  assert.match(JSON.stringify(r.bridge_evaluation.steps), /WES/);
  // (f) state pay on the target card and its floor-path steps
  const card = r.target_evaluation[0];
  assert.equal(card.pay_state.state, 'NC');
  assert.equal(card.pay_state_k, 81.9);
  assert.equal(card.floor_path.steps[1].pay_state_k, 81.9);
  assert.equal(card.floor_path.steps[0].pay_state_k, 37.7); // CNA NC
  // (g) programs on the CNA first step
  const progs = card.ladder.entry_steps[0].programs;
  assert.ok(Array.isArray(progs) && progs.length >= 1);
  assert.ok(progs[0].cost_k > 0 && progs[0].months > 0);
  // header
  assert.equal(r.state_pay.state, 'NC');
});

test('decorator: no state / no degree -> nothing invented', () => {
  const session = { structured: {}, result: { mode: 'direct', top3: [], target_evaluation: [] } };
  decorateResult(session, professions);
  assert.equal(session.result.bridge_evaluation, undefined);
  assert.equal(session.result.state_pay, undefined);
});
