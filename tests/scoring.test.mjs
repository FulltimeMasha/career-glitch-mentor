// tests/scoring.test.mjs
// Acceptance tests for the Career Glitch Mentor scoring engine (Day 1).
// Run from repo root:  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadProfessions } from '../api/_lib/engine/professions.mjs';
import { scorePerson, scoreCandidate, topBlockReason } from '../api/_lib/engine/scoring.mjs';

const professions = loadProfessions();

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Hand-built profession with controllable supplies (mirrors loader shape). */
function makeProf(overrides = {}) {
  return {
    slug: 'care-pro',
    name: 'Care Pro (fixture)',
    category: 'people',
    verdict: 'YES',
    verdict_text: '★ Our take: YES — fixture.',
    payK: 80,
    attrs: { pay: 2, ai: 0, remote: 0, lic: 1, hands: 1, people: 2, biz: 0, tech: 0, out: 0, care: 2, creat: 0 },
    training_months: 6,
    supplies: { achievement: 0.5, independence: 0.5, recognition: 0.5, relationships: 1, support: 1, working_conditions: 0.8 },
    supplies_stub: true,
    sdt: { autonomy: 0.5, relatedness: 1 },
    riasec: { R: 0.3, I: 0.3, A: 0.3, S: 0.9, E: 0.3, C: 0.8 },
    riasec_stub: true,
    gates: { voice_load: false, physical: false },
    onet_soc: null, bls_inherited: null, bls_vintage: null, bls_ai_exposure: null,
    work_values_extent: null, work_values_frozen_date: null, abilities_lv: null,
    skills_lv: null, inflow_competition_flag: null, license_type: null,
    data_flags: ['supplies_stub', 'riasec_stub'],
    ...overrides,
  };
}

/** Strong, complete /start person whose values/needs the fixture exactly meets. */
function strongPerson(overrides = {}) {
  return {
    door: 'start',
    age: 30,
    income_floor_k: 40,
    current_profession_name: null,
    values_rank: { achievement: 4, independence: 5, recognition: 6, relationships: 1, support: 2, working_conditions: 3 },
    autonomy_need: 1,
    relatedness_need: 2,
    riasec: { R: 3, I: 3, A: 3, S: 10, E: 3, C: 8 },
    attempts_started: 2,
    attempts_finished: 1,
    resources: { hours_per_day: 4, budget_k: 20, cushion_months: 12, documents_ok: 'yes', health_limits: ['none'] },
    trials: [{ slug: 'care-pro', score: 0.9 }],
    perceived_fit: {},
    cddq_type: 'lacks_information',
    completeness: 1,
    ...overrides,
  };
}

function allKeys(value, acc = []) {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, acc));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) { acc.push(k); allKeys(v, acc); }
  }
  return acc;
}

// ---------------------------------------------------------------------------
// (1) Persona-10 invariant: /start, 18, CDDQ not_ready → NO verdict, a plan.
//     (career-glitch-test-v3-spec.md, acceptance persona 10.)
// ---------------------------------------------------------------------------
test('persona-10: not_ready 18yo with no interests/trials → insufficient_data + exploration plan', () => {
  const persona10 = {
    door: 'start',
    age: 18,
    income_floor_k: null,
    current_profession_name: null,
    values_rank: null,
    autonomy_need: null,
    relatedness_need: null,
    riasec: null,
    attempts_started: 0,
    attempts_finished: 0,
    resources: { hours_per_day: null, budget_k: null, cushion_months: null, documents_ok: null, health_limits: [] },
    trials: [],
    perceived_fit: {},
    cddq_type: 'not_ready',
    completeness: 0.3,
  };
  const out = scorePerson(persona10, professions);
  assert.equal(out.mode, 'insufficient_data');
  assert.ok(Array.isArray(out.exploration_plan) && out.exploration_plan.length > 0,
    'exploration_plan must be non-empty in insufficient_data mode');
  assert.ok(out.exploration_plan.length >= 4 && out.exploration_plan.length <= 6,
    'exploration plan is 4–6 concrete steps');
  // <25 rule: a retest step must be part of the plan.
  assert.ok(out.exploration_plan.some((s) => /retest/i.test(s)), 'plan schedules the 6–12 month interest retest');
});

// ---------------------------------------------------------------------------
// (2) Strong /start persona vs a real people-care profession → A or B,
//     bands are ordered, and NO single "% match" field exists anywhere.
// ---------------------------------------------------------------------------
test('strong /start persona vs people-care profession → category A or B, ordered bands, no match/percent keys', () => {
  const careProf = professions.find((p) => p.name === 'Elder Care Companion (pro)');
  assert.ok(careProf, 'fixture profession exists in the base');
  const person = strongPerson({
    age: 27,
    income_floor_k: 30, // below the profession's payK (45) → no exploitation flag
    trials: [{ slug: careProf.slug, score: 0.85 }],
  });
  const out = scorePerson(person, professions);
  const hit = out.top3.find((r) => r.slug === careProf.slug) || scoreCandidate(person, careProf, professions);
  assert.ok(['A', 'B'].includes(hit.category), `expected A or B, got ${hit.category} (flags: ${hit.flags})`);
  for (const score of [hit.love, hit.potential]) {
    assert.ok(score.lo <= score.mid && score.mid <= score.hi, 'band must satisfy lo <= mid <= hi');
  }
  const keys = allKeys(out);
  assert.ok(!keys.includes('match'), 'output must not contain a key named "match" (single % match is banned)');
  assert.ok(!keys.includes('percent'), 'output must not contain a key named "percent"');
});

// ---------------------------------------------------------------------------
// (3) Deficit-only mechanics: surplus supplies are NEVER penalised.
// ---------------------------------------------------------------------------
test('deficit-only: surplus supplies score the same needs_supplies as an exact fit', () => {
  const person = strongPerson();
  const needs = Object.fromEntries(
    Object.entries(person.values_rank).map(([k, rank]) => [k, (7 - rank) / 6]),
  );
  // Fix A (28.10.2026): a stub profile's supplies are neutralised at
  // scoring time, so the deficit-only invariant is asserted on MEASURED
  // profiles — the only kind whose supplies the engine reads literally.
  const measured = { supplies_stub: false, riasec_stub: false };
  const exact = makeProf({ ...measured, supplies: { ...needs } });
  const surplus = makeProf({
    ...measured,
    supplies: Object.fromEntries(Object.keys(needs).map((k) => [k, 1])),
  });
  const deficit = makeProf({
    ...measured,
    supplies: Object.fromEntries(Object.keys(needs).map((k) => [k, 0])),
  });
  const nsExact = scoreCandidate(person, exact).love.parts.needs_supplies;
  const nsSurplus = scoreCandidate(person, surplus).love.parts.needs_supplies;
  const nsDeficit = scoreCandidate(person, deficit).love.parts.needs_supplies;
  assert.equal(nsExact, 1);
  assert.equal(nsSurplus, nsExact, 'surplus must score identically to exact fit');
  assert.ok(nsDeficit < nsExact, 'a real deficit must score lower (sanity check)');
});

// ---------------------------------------------------------------------------
// (4) Perceived-fit veto: exactly one step down, floor C, never into D.
// ---------------------------------------------------------------------------
test('perceived-fit veto lowers exactly one step with floor C', () => {
  const prof = makeProf();
  const base = strongPerson();

  const aCase = scoreCandidate(base, prof);
  assert.equal(aCase.category, 'A', `fixture should start at A, got ${aCase.category}`);
  const vetoed = scoreCandidate({ ...base, perceived_fit: { 'care-pro': 'not_mine' } }, prof);
  assert.equal(vetoed.category, 'B', 'A + not_mine → B');
  assert.ok(vetoed.flags.includes('perceived_fit_veto'));

  // A B-category case → C.
  const bPerson = strongPerson({
    trials: [{ slug: 'care-pro', score: 0.2 }],
    resources: { hours_per_day: 1, budget_k: 1, cushion_months: 0, documents_ok: 'yes', health_limits: ['none'] },
  });
  const bProf = makeProf({ training_months: 60 });
  const bCase = scoreCandidate(bPerson, bProf);
  assert.equal(bCase.category, 'B', `weakened fixture should be B, got ${bCase.category} (love ${bCase.love.mid}, potential ${bCase.potential.mid})`);
  const bVetoed = scoreCandidate({ ...bPerson, perceived_fit: { 'care-pro': 'not_mine' } }, bProf);
  assert.equal(bVetoed.category, 'C', 'B + not_mine → C');

  // Floor: a C case (base-verdict NO caps at C) stays C under the veto.
  const noProf = makeProf({ verdict: 'NO' });
  const cCase = scoreCandidate(base, noProf);
  assert.equal(cCase.category, 'C');
  const cVetoed = scoreCandidate({ ...base, perceived_fit: { 'care-pro': 'not_mine' } }, noProf);
  assert.equal(cVetoed.category, 'C', 'veto never drops below C (D is for factual gates only)');
});

// ---------------------------------------------------------------------------
// (5) Exploitation risk: high LOVE + pay below the income floor.
// ---------------------------------------------------------------------------
test('exploitation flag when payK is below the income floor and LOVE is high; blocks direct mode', () => {
  // Fix A (28.10.2026): the invariant is about a profession that
  // GENUINELY fits this person, so the fixture is a MEASURED profile —
  // a stub's supplies and RIASEC are neutralised at scoring time by
  // construction and cannot carry "high LOVE" on their own vectors.
  const lowPayProf = makeProf({ payK: 30, supplies_stub: false, riasec_stub: false, data_flags: [] });
  const person = strongPerson({ income_floor_k: 50 });
  const cand = scoreCandidate(person, lowPayProf);
  assert.ok(cand.love.mid >= 0.62, `fixture LOVE should be high, got ${cand.love.mid}`);
  assert.ok(cand.flags.includes('exploitation_risk'), 'exploitation_risk flag must be set');

  const out = scorePerson(person, [lowPayProf]);
  assert.equal(out.top3[0].slug, 'care-pro');
  assert.notEqual(out.mode, 'direct', 'an exploitation-flagged candidate cannot anchor a direct verdict');
});

// ---------------------------------------------------------------------------
// (6) loadProfessions smoke test against the live site data.
// ---------------------------------------------------------------------------
test('loadProfessions: 300+ professions, data_flags everywhere, verdicts parsed for roadmap matches', () => {
  assert.ok(professions.length >= 300, `expected 300+ professions, got ${professions.length}`);
  for (const p of professions) {
    assert.ok(Array.isArray(p.data_flags), `${p.name}: data_flags must be an array`);
    assert.ok(p.supplies && p.riasec && p.sdt, `${p.name}: vectors must exist`);
    // WS2 invariant: a sourced field is either null WITH its honesty
    // flag still on, or filled WITH provenance. Never a bare value.
    assert.equal(p.license_type, null); // no source exists anywhere yet
    assert.equal(p.bls_vintage, '2025-35', `${p.name}: vintage stamped on every vector`);
    if (p.onet_soc == null) {
      assert.ok(p.data_flags.includes('no_onet_match'), `${p.name}: unmatched must be flagged`);
    } else {
      assert.ok(p.onet_match, `${p.name}: a sourced SOC needs its match method`);
      assert.ok(!p.data_flags.includes('onet_soc'), `${p.name}: sourced SOC must drop the unsourced flag`);
      assert.equal(p.riasec_stub, false, `${p.name}: sourced RIASEC is not a stub`);
      // Per-field honesty: a value is present exactly when its stub
      // flag is off. (The frozen Work Values snapshot genuinely has no
      // rows for 20 SOC-2018-renumbered occupations — Software
      // Developers among them — so their supplies honestly stay stub.)
      assert.equal(p.supplies_stub === false, p.work_values_extent != null,
        `${p.name}: supplies provenance must match the work-values presence`);
      assert.equal(p.abilities_lv != null, !p.data_flags.includes('abilities_lv'),
        `${p.name}: abilities provenance must match its flag`);
      assert.equal(p.skills_lv != null, !p.data_flags.includes('skills_lv'),
        `${p.name}: skills provenance must match its flag`);
    }
    if (p.bls_ai_exposure != null) {
      assert.ok(p.bls_ai_exposure_tier && p.bls_ai_exposure_source,
        `${p.name}: an AI-exposure value must carry its evidence tier and source`);
    }
  }
  const withVerdict = professions.filter((p) => p.verdict === 'YES' || p.verdict === 'NO');
  assert.ok(withVerdict.length >= 240, `expected 240+ verdict-parsed professions, got ${withVerdict.length}`);
  const rn = professions.find((p) => p.name === 'Registered Nurse');
  assert.equal(rn.verdict, 'YES');
  const translator = professions.find((p) => p.name === 'Translator / Interpreter');
  assert.equal(translator.verdict, 'NO');
  // Slugs are unique (scoring keys candidates by slug).
  assert.equal(new Set(professions.map((p) => p.slug)).size, professions.length);
});

// ---------------------------------------------------------------------------
// Extra invariants (gates, pivot direction, <25 direct-verdict rule)
// ---------------------------------------------------------------------------
test('factual gates: documents=no + hard license → D; voice limit excludes voice-load professions from top3', () => {
  const rn = professions.find((p) => p.name === 'Registered Nurse'); // lic === 2
  const person = strongPerson({
    resources: { hours_per_day: 2, budget_k: 5, cushion_months: 3, documents_ok: 'no', health_limits: ['none'] },
  });
  const cand = scoreCandidate(person, rn, professions);
  assert.equal(cand.category, 'D');
  assert.ok(cand.flags.includes('documents_gate'));

  const voicePerson = strongPerson({
    resources: { hours_per_day: 2, budget_k: 5, cushion_months: 3, documents_ok: 'yes', health_limits: ['voice'] },
  });
  const out = scorePerson(voicePerson, professions);
  const voiceLoadedSlugs = new Set(professions.filter((p) => p.gates.voice_load).map((p) => p.slug));
  assert.ok(out.top3.every((r) => !voiceLoadedSlugs.has(r.slug)), 'no voice-load profession may appear in top3 for a voice-limited person');
});

// ---------------------------------------------------------------------------
// Cause B (28.10.2026): red lines read base FIELDS, not name heuristics.
// ---------------------------------------------------------------------------
test('cause B: base carries the red-line fields with provenance, known values hold', () => {
  for (const p of professions) {
    assert.equal(typeof p.night_shifts, 'boolean', `${p.slug}: night_shifts must be a boolean field`);
    assert.equal(typeof p.public_voice, 'boolean', `${p.slug}: public_voice must be a boolean field`);
    assert.equal(typeof p.relocation_required, 'boolean', `${p.slug}: relocation_required must be a boolean field`);
    assert.ok(p.data_flags.includes('night_shifts_editorial'), `${p.slug}: night provenance flag`);
    assert.ok(p.data_flags.includes('relocation_editorial'), `${p.slug}: relocation provenance flag`);
    if (p.public_voice) {
      assert.ok(
        p.data_flags.includes('public_voice_onet') || p.data_flags.includes('public_voice_editorial'),
        `${p.slug}: a public_voice=true needs its provenance flag`,
      );
    }
  }
  const bySlug = Object.fromEntries(professions.map((p) => [p.slug, p]));
  // nights: structural night work flagged; daylight work is not
  assert.equal(bySlug['registered-nurse'].night_shifts, true);
  assert.equal(bySlug['police-officer'].night_shifts, true);
  assert.equal(bySlug['drone-pilot-commercial'].night_shifts, false);
  assert.equal(bySlug['baker'].night_shifts, false); // 3–4am starts are early mornings, not night shifts
  // public voice: measured rule + editorial exceptions; the old gate's
  // recorded false positives (flagged via the voice_load mix-up) stay false
  assert.equal(bySlug['voice-actor'].public_voice, true);
  assert.equal(bySlug['online-course-creator'].public_voice, true);
  assert.equal(bySlug['funeral-director'].public_voice, true);
  assert.equal(bySlug['registered-nurse'].public_voice, false);
  assert.equal(bySlug['community-health-worker'].public_voice, false);
  assert.equal(bySlug['wellness-coach'].public_voice, false);
  // relocation: the previously dead red line has a field now; absence is not relocation
  assert.equal(bySlug['ship-engineer-merchant-marine'].relocation_required, true);
  assert.equal(bySlug['flight-attendant'].relocation_required, true);
  assert.equal(bySlug['owner-operator-trucking'].relocation_required, false);
  assert.equal(bySlug['software-developer'].relocation_required, false);
  // age gates: the cause-B statutory table
  assert.equal(bySlug['cdl-truck-driver'].age_gate.min, 21);
  assert.equal(bySlug['commercial-insurance-producer'].age_gate.min, 18);
  assert.equal(bySlug['business-broker'].age_gate.min, 18);
  assert.equal(bySlug['yacht-broker'].age_gate.min, 18);
  assert.equal(bySlug['tutoring-center-owner'].age_gate.min, 18);
  assert.equal(bySlug['air-traffic-controller'].age_gate.max, 30); // pre-existing gate untouched
  // voice load: the recorded misses are covered by the field now
  assert.equal(bySlug['commercial-insurance-producer'].gates.voice_load, true);
  assert.equal(bySlug['recruiter'].gates.voice_load, true);
});

test('cause B: topBlockReason reads fields — the relocation line is alive', () => {
  const mk = (over) => makeProf({
    age_gate: null, night_shifts: false, public_voice: false, relocation_required: false, ...over,
  });
  const person = (red_lines) => strongPerson({ red_lines });
  assert.equal(topBlockReason(person(['no_relocation']), mk({ relocation_required: true })), 'relocation_red_line');
  assert.equal(topBlockReason(person(['no_relocation']), mk({})), null);
  assert.equal(topBlockReason(person(['no_nights']), mk({ night_shifts: true })), 'nights_red_line');
  assert.equal(topBlockReason(person(['no_nights']), mk({})), null);
  assert.equal(topBlockReason(person(['no_public_voice']), mk({ public_voice: true })), 'public_voice_red_line');
  // voice_load alone must NOT trip the public-voice line — the retired
  // gate rule conflated the two fields; the engine never may.
  assert.equal(topBlockReason(person(['no_public_voice']), mk({ gates: { voice_load: true, physical: false } })), null);
});

test('cause B: voice health limit gates Commercial Insurance Producer at category D', () => {
  const cip = professions.find((p) => p.slug === 'commercial-insurance-producer');
  const voicePerson = strongPerson({
    resources: { hours_per_day: 2, budget_k: 5, cushion_months: 3, documents_ok: 'yes', health_limits: ['voice'] },
  });
  const cand = scoreCandidate(voicePerson, cip, professions);
  assert.equal(cand.category, 'D');
  assert.ok(cand.flags.includes('voice_gate'));
});

test('pivot: transfer capital rewards adjacent moves, flags unknown current profession', () => {
  const bookkeeper = professions.find((p) => p.name === 'Bookkeeper + Advisory');
  const accountant = professions.find((p) => p.name === 'Accountant (CPA track)');
  assert.ok(bookkeeper && accountant);
  const pivotPerson = {
    door: 'pivot',
    age: 38,
    income_floor_k: 45,
    current_profession_name: 'Bookkeeper + Advisory',
    values_rank: { achievement: 3, independence: 4, recognition: 5, relationships: 2, support: 1, working_conditions: 6 },
    autonomy_need: 1,
    relatedness_need: 1,
    riasec: { R: 2, I: 6, A: 2, S: 5, E: 4, C: 9 },
    attempts_started: 1,
    attempts_finished: 1,
    resources: { hours_per_day: 2, budget_k: 8, cushion_months: 6, documents_ok: 'yes', health_limits: ['none'] },
    trials: [],
    perceived_fit: {},
    cddq_type: 'lacks_information',
    completeness: 0.9,
  };
  const cand = scoreCandidate(pivotPerson, accountant, professions);
  assert.equal(cand.potential.profile, 'pivot');
  // The site attr vectors are sparse lifestyle vectors, so absolute transfer
  // values are structurally small on Day 1. The invariant that must hold is
  // DIRECTIONALITY: an adjacent move (bookkeeper → accountant) must beat a
  // distant one (plumber → accountant) on transfer, shortage AND the mid.
  const distant = scoreCandidate({ ...pivotPerson, current_profession_name: 'Plumber' }, accountant, professions);
  assert.ok(cand.potential.parts.transfer_capital > distant.potential.parts.transfer_capital,
    `adjacent transfer ${cand.potential.parts.transfer_capital} must exceed distant ${distant.potential.parts.transfer_capital}`);
  assert.ok(cand.potential.parts.shortage_distance < distant.potential.parts.shortage_distance,
    'adjacent move must have the smaller shortage distance');
  assert.ok(cand.potential.mid > distant.potential.mid, 'adjacent move must win the POTENTIAL mid');

  const lostPerson = { ...pivotPerson, current_profession_name: 'Underwater Basket Weaver' };
  const lost = scoreCandidate(lostPerson, accountant, professions);
  assert.ok(lost.flags.includes('current_profession_not_in_base'));
});

test('<25 direct-verdict rule: no direct mode on interests alone, direct allowed at 27 for a clean A', () => {
  const careProf = professions.find((p) => p.name === 'Elder Care Companion (pro)');
  const young = strongPerson({
    age: 22,
    income_floor_k: 30,
    trials: [], // interests only — no measured trial, no finished attempt evidence
    attempts_finished: 0,
  });
  const youngOut = scorePerson(young, [careProf]);
  assert.notEqual(youngOut.mode, 'direct', 'a <25 user must not get a direct verdict from interests alone');

  const adult = strongPerson({ age: 27, income_floor_k: 30, trials: [{ slug: careProf.slug, score: 0.85 }] });
  const adultOut = scorePerson(adult, [careProf]);
  assert.equal(adultOut.top3[0].category, 'A');
  assert.equal(adultOut.top3[0].confidence, 'high');
  assert.equal(adultOut.mode, 'direct');
});

// ---------------------------------------------------------------------------
// (7) Diversity + income floor + bottom-3 + argument (27.10 fixes).
// A creator-leaning person who names a $120K minimum must not be handed
// three creator-economy wrappers at $45–75K in silence.
// ---------------------------------------------------------------------------
const creatorPersona = {
  door: 'start',
  age: 34,
  income_floor_k: 120,
  current_profession_name: 'Cleaning Business Owner',
  current_income_k: 90,
  values_rank: { recognition: 1, achievement: 2, independence: 3, relationships: 4, working_conditions: 5, support: 6 },
  autonomy_need: 2,
  relatedness_need: 1,
  supports: { money: 1, time: 1, people: 2, learning_access: 2 },
  riasec: { R: 1.25, I: 5, A: 8.75, S: 6.25, E: 8.75, C: 3.75 },
  tolerances: { remote_pref: 2, hands_pref: 0, people_pref: 2 },
  attempts_started: 5,
  attempts_finished: 3,
  exit_pattern: 'boredom',
  energy_themes: ['creative', 'selling', 'people'],
  barriers: ['fear_of_failure'],
  red_lines: [],
  mirror_confirmed: 'confirmed',
  resources: { hours_per_day: 3, budget_k: 10, cushion_months: 6, documents_ok: 'yes', health_limits: ['none'] },
  trials: [],
  perceived_fit: {},
  cddq_type: 'lacks_information',
  completeness: 1,
};

test('diversity + floor: three families, no silent below-floor pick, argued cards', () => {
  const out = scorePerson(creatorPersona, professions);
  assert.equal(out.top3.length, 3);
  assert.equal(new Set(out.top3.map((r) => r.family)).size, 3, 'top-3 must span 3 families');
  assert.ok(out.top3.filter((r) => r.family === 'creator').length <= 1, 'at most one creator-economy pick');
  for (const r of out.top3) {
    assert.notEqual(r.floor_status, 'below_floor', `${r.slug} is below the $120K floor and must not be presented silently`);
    assert.ok(r.argument && r.argument.why_you.length > 0, `${r.slug} must carry a why-you argument`);
    assert.ok(r.argument.math.some((l) => l.includes('Typical pay')), `${r.slug} must carry the pay math`);
  }
  // Bottom-3: the least suitable professions — worst first, three
  // different families, never a top-3 pick, each with a why-not and the
  // protective closing line. The lead card's LOVE range must not reach
  // into the winner's range when a non-overlapping candidate exists.
  assert.ok(Array.isArray(out.bottom3) && out.bottom3.length >= 1 && out.bottom3.length <= 3,
    'a bottom list of 1–3 is produced');
  assert.equal(new Set(out.bottom3.map((r) => r.family)).size, out.bottom3.length,
    'bottom picks must span distinct families');
  assert.ok(out.bottom3[0].love.hi <= out.top3[0].love.lo,
    `bottom #1 LOVE hi ${out.bottom3[0].love.hi} must not exceed winner lo ${out.top3[0].love.lo}`);
  for (let i = 1; i < out.bottom3.length; i++) {
    assert.ok(
      out.bottom3[i].love.mid >= out.bottom3[i - 1].love.mid
        || (out.bottom3[i - 1].love.hi <= out.top3[0].love.lo && out.bottom3[i].love.hi > out.top3[0].love.lo),
      'bottom list is worst-first (non-overlapping group first, then by fit)');
  }
  for (const b of out.bottom3) {
    assert.ok(!out.top3.some((t) => t.slug === b.slug), `bottom pick ${b.slug} must not repeat a top pick`);
    assert.ok(Array.isArray(b.why_not) && b.why_not.length > 0, `bottom pick ${b.slug} must say why not`);
    assert.ok(typeof b.closing === 'string' && b.closing.length > 0, `bottom pick ${b.slug} must end with the protective line`);
    if (b.floor_status === 'below_floor') {
      assert.ok(b.argument.math.some((l) => l.includes('under your $120K minimum')),
        `below-floor bottom pick ${b.slug} must carry the plain floor line (its chip renders from floor_status)`);
    }
  }
  // Plain register: nothing user-facing may carry internal terms.
  const rendered = [
    out.set_reason, out.mode_reason,
    ...out.top3.flatMap((r) => [...r.argument.why_you, ...r.argument.math, ...r.argument.but, ...r.argument.bridge]),
    ...out.bottom3.flatMap((r) => [...(r.why_not || []), r.closing || '', ...r.argument.math]),
    ...out.exploration_plan,
  ].join('\n');
  for (const banned of ['RIASEC', 'CDDQ', 'cddq', 'bands', 'evidence', 'needs-supplies', 'in the base', 'exploitation_risk', 'base_verdict']) {
    assert.ok(!rendered.includes(banned), `user-facing text must not contain "${banned}"`);
  }
});

// ---------------------------------------------------------------------------
// Career vs side hustle (founder's rule, 28.10.2026). A match is a
// stable job — hired work or your own business as your main
// occupation. A side hustle (nobody hires you into it; typically run
// next to a main job) is never a match: not in the top-3, not in the
// bottom-3, not the cushion. It may appear exactly once, as the
// separate side_hustle_pick idea, inside the person's own limits.
// ---------------------------------------------------------------------------
test('career/side-hustle: base classification is complete, explicit and defaulted to career', () => {
  const bySlug = Object.fromEntries(professions.map((p) => [p.slug, p]));
  for (const p of professions) {
    assert.ok(p.kind === 'career' || p.kind === 'side_hustle', `${p.slug}: kind must be career|side_hustle`);
    if (p.kind === 'side_hustle') assert.ok(p.data_flags.includes('side_hustle_editorial'), `${p.slug}: provenance flag`);
  }
  const side = professions.filter((p) => p.kind === 'side_hustle').map((p) => p.slug).sort();
  assert.deepEqual(side, [
    'amazon-fba-seller', 'boat-restoration-flipping', 'car-flipping', 'car-wash-owner',
    'etsy-digital-products-seller', 'franchise-owner-home-services', 'laundromat-owner',
    'life-coach', 'online-course-creator', 'photo-booth-event-rentals-owner',
    'print-on-demand-seller', 'real-estate-investor-flips', 'real-estate-investor-rentals',
    'resale-flipping-business', 'self-storage-owner', 'streamer-content-creator',
    'vending-atm-route-owner', 'wellness-coach',
  ]);
  assert.equal(professions.length - side.length, 355, 'career count the page stat may claim');
  // Borderline rows the founder reviews by name — kept careers on the
  // record (client-hired services and operating owners).
  for (const slug of ['ugc-creator', 'doula', 'personal-fashion-stylist', 'tutoring-center-owner',
    'airbnb-co-host-str-manager', 'senior-home-care-agency-owner', 'freight-broker-agent',
    'speech-public-speaking-coach', 'home-organizer-pro', 'medical-courier-owner-route']) {
    assert.equal(bySlug[slug].kind, 'career', `${slug} stays a career`);
  }
});

test('career/side-hustle: no side hustle in top3, bottom3 or the cushion — for any fixture person', () => {
  const persons = [
    strongPerson(),
    creatorPersona,
    { ...creatorPersona, door: 'pivot', current_profession_name: 'Accountant (CPA track)' },
    strongPerson({ values_rank: { achievement: 1, independence: 2, recognition: 3, relationships: 6, support: 5, working_conditions: 4 }, autonomy_need: 2, relatedness_need: 0, riasec: { R: 2, I: 4, A: 9, S: 3, E: 9, C: 4 } }),
  ];
  for (const person of persons) {
    const out = scorePerson(person, professions);
    const surfaces = [...out.top3, ...out.bottom3, ...(out.bridge_pick ? [out.bridge_pick] : [])];
    for (const r of surfaces) assert.notEqual(r.kind, 'side_hustle', `${r.slug} must never be a match surface`);
    if (out.side_hustle_pick) assert.equal(out.side_hustle_pick.kind, 'side_hustle');
  }
});

test('career/side-hustle: a base of only side hustles produces no matches at all', () => {
  const only = professions.filter((p) => p.kind === 'side_hustle');
  const out = scorePerson(creatorPersona, only);
  assert.equal(out.top3.length, 0, 'side hustles cannot fill a top-3');
  assert.equal(out.bottom3.length, 0, 'side hustles cannot fill a bottom-3');
  assert.equal(out.bridge_pick, null);
});

test('career/side-hustle: the idea respects the named budget and hours, and stays under the fit threshold otherwise', () => {
  const rich = scorePerson(creatorPersona, professions);
  assert.ok(rich.side_hustle_pick, 'a complete creative person with $10K and 3h/day gets an idea');
  assert.ok(['low', 'mid'].includes(rich.side_hustle_pick.startup_tier), 'a $10K budget cannot buy a high-tier (asset) format');
  assert.ok(rich.side_hustle_pick.why_side.length >= 1, 'the idea carries its coded reasons');

  const broke = scorePerson({ ...creatorPersona, resources: { ...creatorPersona.resources, budget_k: 0 } }, professions);
  assert.equal(broke.side_hustle_pick, null, 'a named $0 budget buys no idea — nothing is pushed');

  const cheap = scorePerson({ ...creatorPersona, resources: { ...creatorPersona.resources, budget_k: 1 } }, professions);
  if (cheap.side_hustle_pick) assert.equal(cheap.side_hustle_pick.startup_tier, 'low', 'a $1K budget only ever buys the pocket-money tier');

  const noTime = scorePerson({ ...creatorPersona, resources: { ...creatorPersona.resources, hours_per_day: 0 } }, professions);
  assert.equal(noTime.side_hustle_pick, null, 'zero named spare hours — no side idea');
});

test('floor demotion: a below-floor favourite yields the slot to a floor-clearing pick, and is marked when kept', () => {
  // Fixture profession swapped 28.10.2026: this test used Streamer /
  // Content Creator as the favourite — under the career/side-hustle
  // rule a streamer is no longer a match at all, so the demotion
  // mechanics are asserted on Video Editor instead (a creator-family
  // CAREER, $71K against the persona's $120K floor).
  const streamer = professions.find((p) => p.slug === 'video-editor');
  const pilot = professions.find((p) => p.slug === 'commercial-pilot');
  assert.ok(streamer && pilot, 'fixture professions exist');
  const out = scorePerson(creatorPersona, [streamer, pilot]);
  assert.equal(out.top3[0].slug, 'commercial-pilot', 'the floor-clearing pick leads');
  const kept = out.top3.find((r) => r.slug === 'video-editor');
  assert.ok(kept, 'the below-floor favourite may stay only as a marked extra');
  assert.equal(kept.floor_status, 'below_floor');
  assert.ok(kept.argument.math.some((l) => l.includes('under your $120K minimum')), 'the card must state the floor miss in plain words');
});
