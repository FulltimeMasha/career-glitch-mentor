// tests/targets2.test.mjs
// Matchmaker 2.0 core (28.10.2026): stated targets, floor-as-path,
// ladders. Run from repo root:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadProfessions } from '../api/_lib/engine/professions.mjs';
import { scorePerson, scoreCandidate } from '../api/_lib/engine/scoring.mjs';
import { matchStatedTarget } from '../api/_lib/engine/target-match.mjs';
import { ladderPathToFloor, LADDER_FLOOR_YEARS } from '../api/_lib/engine/ladders.mjs';

const professions = loadProfessions();
const bySlug = new Map(professions.map((p) => [p.slug, p]));

function fixtureProf(overrides = {}) {
  return {
    slug: 'fixture', name: 'Fixture', category: 'health', verdict: 'YES',
    payK: 50, pay_top_quartile_k: null, pay_top_decile_k: null, training_months: 6,
    attrs: { pay: 1, ai: 0, remote: 0, lic: 1, hands: 1, people: 2, biz: 0, tech: 0, out: 0, care: 2, creat: 0 },
    supplies: { achievement: 0.5, independence: 0.5, recognition: 0.5, relationships: 1, support: 1, working_conditions: 0.8 },
    supplies_stub: false, sdt: { autonomy: 0.5, relatedness: 1 },
    riasec: { R: 0.3, I: 0.3, A: 0.3, S: 0.9, E: 0.3, C: 0.8 }, riasec_stub: false,
    gates: { voice_load: false, physical: false }, age_gate: null,
    entry_steps: [], next_steps: [], prerequisites: [], data_flags: ['onet_sourced'],
    ...overrides,
  };
}
const person = (overrides = {}) => ({
  door: 'start', age: 30, income_floor_k: 100, values_rank: ['relationships', 'support', 'working_conditions', 'achievement', 'recognition', 'independence'],
  autonomy_need: 1, relatedness_need: 2, riasec: { R: 5, I: 5, A: 2, S: 10, E: 3, C: 5 },
  tolerances: { remote_pref: 0, hands_pref: 1, people_pref: 2 }, red_lines: [],
  resources: { hours_per_day: 3, budget_k: 5, cushion_months: 6, documents_ok: 'yes', health_limits: [] },
  trials: [], perceived_fit: {}, completeness: 1, ...overrides,
});

// ---------------------------------------------------------------- matcher
test('matcher: exact base name resolves', () => {
  const m = matchStatedTarget('Registered Nurse', professions);
  assert.equal(m.matched, true);
  assert.equal(m.slug, 'registered-nurse');
});

test('matcher: abbreviation RN resolves deterministically', () => {
  const m = matchStatedTarget('RN', professions);
  assert.equal(m.matched, true);
  assert.equal(m.slug, 'registered-nurse');
  assert.equal(m.via, 'abbreviation');
});

test('matcher: O*NET alternate title resolves (nurse aide → CNA)', () => {
  const m = matchStatedTarget('Nurse Aide', professions);
  assert.equal(m.matched, true);
  assert.equal(m.slug, 'certified-nursing-assistant');
});

test('matcher: gibberish is an honest miss with a field guess or none', () => {
  const m = matchStatedTarget('Underwater Basket Weaver', professions);
  assert.equal(m.matched, false);
  const m2 = matchStatedTarget('Pediatric Surgeon', professions);
  assert.equal(m2.matched, false); // no paediatric-surgeon row exists — never swapped silently
  assert.equal(m2.nearest_field, 'health');
});

// ----------------------------------------------------------- floor-as-path
test('floor-as-path (i): median clears — status clears', () => {
  const rich = fixtureProf({ slug: 'rich', payK: 120 });
  assert.equal(scoreCandidate(person(), rich, [rich]).floor_status, 'clears');
});

test('floor-as-path (ii): ladder reaching the floor in time → clears_via_ladder with the path printed', () => {
  const low = fixtureProf({ slug: 'low', payK: 98, training_months: 36, next_steps: [{ slug: 'high' }] });
  const high = fixtureProf({ slug: 'high', name: 'High Rung', payK: 150, training_months: 12 });
  const path = ladderPathToFloor(100, low, new Map([[low.slug, low], [high.slug, high]]));
  assert.ok(path);
  assert.equal(path.via_slug, 'high');
  assert.equal(path.years_to_floor, 4);
  const scored = scoreCandidate(person(), low, [low, high]);
  assert.equal(scored.floor_status, 'clears_via_ladder');
  assert.equal(scored.floor_path.via_slug, 'high');
  // and it may legally seat in a top-3 (it is not below_floor)
  const full = scorePerson(person(), [low, high]);
  assert.deepEqual(full.target_evaluation, []); // no targets stated → no cards
});

test('floor-as-path (ii): ladder too slow → no path (below_floor stands)', () => {
  const low = fixtureProf({ slug: 'slow', payK: 90, training_months: 48, next_steps: [{ slug: 'high2' }] });
  const high = fixtureProf({ slug: 'high2', payK: 150, training_months: 24 }); // 6 years total > cap
  assert.equal(ladderPathToFloor(100, low, new Map([[low.slug, low], [high.slug, high]])), null);
  assert.ok(LADDER_FLOOR_YEARS >= 1);
});

test('floor-as-path (iii): sourced decile still clears when no ladder exists', () => {
  const prof = fixtureProf({ slug: 'dec', payK: 62, pay_top_decile_k: 138 });
  assert.equal(ladderPathToFloor(100, prof, new Map([[prof.slug, prof]])), null);
  assert.equal(scoreCandidate(person(), prof, [prof]).floor_status, 'top_decile_only');
});

test('floor-as-path: bare below_floor (no ladder, no tail figure) still never seats', () => {
  const poor = fixtureProf({ slug: 'poor', payK: 45 });
  assert.equal(scoreCandidate(person(), poor, [poor]).floor_status, 'below_floor');
});

test('floor-as-path: the RN benchmark — $98K vs a $100K floor now resolves via the ladder to aesthetics/ownership', () => {
  const rn = bySlug.get('registered-nurse');
  const path = ladderPathToFloor(100, rn, bySlug);
  assert.ok(path, 'RN must carry a ladder path over a $100K floor');
  assert.equal(path.via_slug, 'med-spa-owner');
  assert.ok(path.years_to_floor <= LADDER_FLOOR_YEARS);
});

// ----------------------------------------------------------------- marina
const MARINA = {
  door: 'pivot', age: 37, income_floor_k: 100, current_profession_name: 'Painting Company Owner',
  languages: ['en', 'ru'],
  values_rank: ['working_conditions', 'relationships', 'support', 'achievement', 'recognition', 'independence'],
  autonomy_need: 1, relatedness_need: 2, target_fields: ['health'], stated_target_names: ['Registered Nurse'],
  supports: { money: 1, time: 0, people: 2, learning_access: 2 },
  riasec: { R: 7.5, I: 5, A: 2.5, S: 10, E: 3.75, C: 5 },
  tolerances: { remote_pref: 0, hands_pref: 1, people_pref: 2 },
  attempts_started: 3, attempts_finished: 2, exit_pattern: 'energy',
  energy_themes: ['people', 'building'], barriers: ['time', 'money'], red_lines: ['no_nights'],
  resources: { hours_per_day: 2.5, budget_k: 5, cushion_months: 3, documents_ok: 'partial', health_limits: [] },
  trials: [], perceived_fit: {}, cddq_type: 'lacks_information', completeness: 1,
};

test('marina: target card for RN names the filter and the floor path', () => {
  const r = scorePerson(MARINA, professions);
  const card = r.target_evaluation.find((c) => c.slug === 'registered-nurse');
  assert.ok(card, 'RN target card must exist');
  assert.equal(card.verdict, 'YES');
  assert.ok(card.ruled_out_by.some((b) => b.filter === 'nights_red_line'), 'her no-nights line must be named');
  assert.equal(card.floor_status, 'clears_via_ladder');
  assert.ok(card.floor_path && card.floor_path.via_slug === 'med-spa-owner');
});

test('marina: top-3 holds a healthcare ladder whose first step is CNA-fast and CNA-cheap; no CIP, no Drone', () => {
  const r = scorePerson(MARINA, professions);
  const names = r.top3.map((x) => x.name);
  assert.ok(!names.includes('Commercial Insurance Producer'), names.join(', '));
  assert.ok(!names.some((n) => /Drone/.test(n)), names.join(', '));
  const laddered = r.top3.find((x) => x.ladder && x.ladder.entry_steps.length && x.ladder.entry_steps[0].slug === 'certified-nursing-assistant');
  assert.ok(laddered, `no CNA-first ladder in top3: ${names.join(', ')}`);
  assert.ok(laddered.ladder.entry_steps[0].training_months <= 3);
  assert.ok(laddered.ladder.entry_steps[0].cost_k <= 5);
});

test('targets: an unmatched stated target yields an honest unmatched card, never a swap', () => {
  const r = scorePerson({ ...MARINA, stated_target_names: ['Astronaut'] }, professions);
  const card = r.target_evaluation[0];
  assert.equal(card.matched, false);
  assert.equal(card.slug, null);
});
