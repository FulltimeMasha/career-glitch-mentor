// scripts/test_bridge_pick.mjs
// ---------------------------------------------------------------------------
// Career Glitch Mentor — CUSHION (bridge_pick) RULE TESTS (27.10.2026).
//
// Founder's rule: when the #1 match is a slow-money profession (income is
// built — audience, clients, practice, commissions, ownership — not a wage
// from month one), scorePerson must also pick ONE very stable HIRED job:
// the cushion. It must clear the person's own income floor on typical
// pay, enter in ≤12 months, carry low AI exposure in the base, not be a
// base-verdict NO, fit the person at A/B, and not be slow-money itself.
//
// No LLM calls: this exercises the deterministic engine only, importing
// the LIVE site engine by absolute path (the deployed copy), not the
// local mirror in this repo.
//
// Personas are built by hand in the assemblePerson output shape; their
// riasec / values_rank / SDT needs are cloned from the target profession's
// own vectors so the intended #1 lands deterministically (a clone scores
// congruence 1.0 against itself — the tuning the rule's test needs).
//
// Run:  node scripts/test_bridge_pick.mjs
// Exit code 0 = all hard assertions passed.
// ---------------------------------------------------------------------------

import { loadProfessions } from '/home/hatch/workspace/careerglitch-site/api/_lib/engine/professions.mjs';
import {
  scorePerson,
  SLOW_MONEY_NAMES,
  isSlowMoney,
} from '/home/hatch/workspace/careerglitch-site/api/_lib/engine/scoring.mjs';

const VALUE_KEYS = ['achievement', 'independence', 'recognition', 'relationships', 'support', 'working_conditions'];

const professions = loadProfessions();
const profByName = new Map(professions.map((p) => [p.name, p]));

let failures = 0;
function check(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures += 1;
}
function note(text) { console.log(`  ..  ${text}`); }

/** Rank the 6 work values by a profession's supplies, strongest first
 *  (ties keep VALUE_KEYS order) — the values profile that fits it best. */
function rankFromSupplies(prof) {
  const keys = VALUE_KEYS.slice().sort((a, b) => {
    const d = (prof.supplies?.[b] ?? 0) - (prof.supplies?.[a] ?? 0);
    return d !== 0 ? d : VALUE_KEYS.indexOf(a) - VALUE_KEYS.indexOf(b);
  });
  const out = {};
  keys.forEach((k, i) => { out[k] = i + 1; });
  return out;
}

/** Clone a profession's own vectors into person-shaped answers. */
function cloneVectors(prof) {
  const riasec = {};
  for (const k of ['R', 'I', 'A', 'S', 'E', 'C']) riasec[k] = (prof.riasec?.[k] ?? 0) * 10;
  return {
    riasec,
    values_rank: rankFromSupplies(prof),
    autonomy_need: Math.min(2, Math.max(0, Math.round((prof.sdt?.autonomy ?? 0) * 2))),
    relatedness_need: Math.min(2, Math.max(0, Math.round((prof.sdt?.relatedness ?? 0) * 2))),
  };
}

/** Hand-built person in the exact assemblePerson output shape. */
function makePerson(overrides = {}) {
  return {
    door: 'start',
    age: 30,
    age_band: '25_34',
    income_floor_k: 50,
    current_profession_name: null,
    country: 'United States',
    state: 'North Carolina',
    current_income_k: 45,
    languages: ['en'],
    values_rank: null,
    autonomy_need: 1,
    relatedness_need: 1,
    supports: { money: 1, time: 1, people: 1, learning_access: 2 },
    riasec: null,
    tolerances: null,
    attempts_started: 2,
    attempts_finished: 1,
    exit_pattern: 'boredom',
    energy_themes: ['creative'],
    barriers: ['money'],
    red_lines: [],
    mirror_confirmed: 'confirmed',
    resources: {
      hours_per_day: 2,
      budget_k: 5,
      cushion_months: 3,
      documents_ok: 'yes',
      health_limits: [],
    },
    // One dummy trial entry: a trials module exists (so the mode logic
    // does not treat this person as never-tried), but it carries no slug
    // and no score, so it moves no number.
    trials: [{}],
    perceived_fit: {},
    cddq_type: 'lacks_information',
    completeness: 1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 0. The slow-money set must name real professions — a typo'd name would
// silently never fire.
// ---------------------------------------------------------------------------
console.log('\n== Slow-money set integrity ==');
const missing = [...SLOW_MONEY_NAMES].filter((n) => !profByName.has(n));
check(missing.length === 0, `all ${SLOW_MONEY_NAMES.size} SLOW_MONEY_NAMES exist in the base (${professions.length} professions)`);
if (missing.length) note(`missing: ${missing.join(' | ')}`);

// ---------------------------------------------------------------------------
// 1. Creator persona — #1 is slow-money → a cushion must be picked, and it
// must pass every hard filter.
// ---------------------------------------------------------------------------
console.log('\n== Persona 1: creator (slow-money #1) ==');
const streamer = profByName.get('Streamer / Content Creator');
const p1 = makePerson(cloneVectors(streamer));
const r1 = scorePerson(p1, professions);
const top1 = r1.top3[0];
note(`mode=${r1.mode} top3=${r1.top3.map((c) => `${c.name} [${c.category}]`).join(' · ')}`);
check(r1.mode === 'bands', `persona 1 mode is 'bands' (got '${r1.mode}')`);
check(!!top1 && isSlowMoney(top1), `persona 1 #1 is slow-money (got '${top1?.name}')`);
check(r1.bridge_pick != null, 'persona 1 bridge_pick is non-null');
if (r1.bridge_pick) {
  const bp = r1.bridge_pick;
  const bpProf = profByName.get(bp.name);
  const inTopOrBottom = new Set([...r1.top3, ...r1.bottom3].map((c) => c.slug));
  note(`bridge_pick = ${bp.name} [${bp.category}] payK=${bp.payK} training=${bp.training_months}`);
  check(bp.floor_status === 'clears', `cushion clears the floor (floor_status='${bp.floor_status}')`);
  check(bp.category === 'A' || bp.category === 'B', `cushion category is A/B (got '${bp.category}')`);
  check(!!bpProf && bpProf.verdict !== 'NO', `cushion base verdict is not NO (got '${bpProf?.verdict}')`);
  check(typeof bp.training_months === 'number' && bp.training_months <= 12, `cushion training ≤ 12 months (got ${bp.training_months})`);
  check(!!bpProf && typeof bpProf.attrs?.ai === 'number' && bpProf.attrs.ai <= 1, `cushion attrs.ai ≤ 1 (got ${bpProf?.attrs?.ai})`);
  check(!isSlowMoney(bp), `cushion is NOT slow-money itself ('${bp.name}')`);
  check(!inTopOrBottom.has(bp.slug), 'cushion duplicates no top-3 / bottom-3 pick');
  check(Array.isArray(bp.why_bridge) && bp.why_bridge.length > 0 && bp.why_bridge.every((l) => typeof l === 'string' && l.length > 0), 'cushion carries why_bridge lines');
  console.log('  why_bridge:');
  for (const line of bp.why_bridge || []) console.log(`    - ${line}`);
}

// ---------------------------------------------------------------------------
// 2. Nurse persona — #1 is a wage profession → no cushion at all.
// ---------------------------------------------------------------------------
console.log('\n== Persona 2: nurse (wage #1) ==');
const nurse = profByName.get('Registered Nurse');
const p2 = makePerson(cloneVectors(nurse));
const r2 = scorePerson(p2, professions);
const top2 = r2.top3[0];
note(`mode=${r2.mode} top3=${r2.top3.map((c) => `${c.name} [${c.category}]`).join(' · ')}`);
if (top2?.name === 'Registered Nurse') note('top1 is exactly Registered Nurse');
else note(`top1 is '${top2?.name}', not Registered Nurse (the brief's fallback clause applies)`);
check(!!top2 && !isSlowMoney(top2), `persona 2 #1 is NOT slow-money (got '${top2?.name}')`);
check(r2.bridge_pick === null, `persona 2 bridge_pick is null (got ${JSON.stringify(r2.bridge_pick?.name ?? null)})`);

// ---------------------------------------------------------------------------
// 3. Creator persona with a $200K floor — no honest cushion exists.
// ---------------------------------------------------------------------------
console.log('\n== Persona 3: creator, $200K floor ==');
const p3 = makePerson({ ...cloneVectors(streamer), income_floor_k: 200 });
const r3 = scorePerson(p3, professions);
note(`mode=${r3.mode} top1=${r3.top3[0]?.name} [${r3.top3[0]?.category}] floor_status=${r3.top3[0]?.floor_status}`);
check(r3.bridge_pick === null, `persona 3 bridge_pick is null — nothing clears $200K honestly (got ${JSON.stringify(r3.bridge_pick?.name ?? null)})`);

// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
