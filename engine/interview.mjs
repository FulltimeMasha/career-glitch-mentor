// engine/interview.mjs
// ---------------------------------------------------------------------------
// Career Glitch Mentor — INTERVIEW SESSION STATE MACHINE (Day 1).
//
// Storage-agnostic: a session is a plain JSON object (serialize with
// JSON.stringify; persistence is the front-end's Supabase job).
//
// Flow:
//   createSession(door)
//     -> phase 'cddq'        applyCddq(session, answersByItemId)
//     -> phase 'stages'      stagePrompt(session) + applyStage(...) x stages 0..5
//     -> after stage 5: deterministic scoring runs (scoring.mjs)
//          mode 'insufficient_data' -> phase 'done' (NO stage 6, no verdict)
//          otherwise                -> phase 'stage6'
//     -> applyPerceivedFit(session, {slug: rating})
//     -> phase 'done'        generateReport(session) (Wonder, presentation only)
//
// CONTRACT — how stages.json tails become the person scoring.mjs consumes.
// Tail items are keyed by their `field` name in stages.json (the CDDQ items
// additionally carry `id`s cddq_1..3, and applyCddq is keyed by those ids).
//   stage 0: age -> person.age (+ derived age_band); income_floor_k ->
//            person.income_floor_k; current_profession_name ->
//            person.current_profession_name; cushion_months / hours_per_day /
//            budget_k / documents_ok / health_limits -> person.resources.*
//            (documents_ok values yes|partial|no are exactly scoring's);
//            country / state / languages / current_income_k are kept as
//            factual extras (scoring ignores them).
//   stage 1: attempts_started / attempts_finished / exit_pattern /
//            energy_themes -> same-named person fields.
//   stage 2: values_rank -> person.values_rank (object {valueKey: rank 1..6};
//            an ordered array, most-important first, is also accepted and
//            normalised); autonomy_need / relatedness_need -> same-named;
//            supports_money / supports_time / supports_people /
//            supports_learning_access -> person.supports {money, time,
//            people, learning_access}.
//   stage 3: barriers / red_lines -> same-named (plan/output only, unscored).
//   stage 4: riasec_<letter><n> items -> person.riasec via stages.json's
//            riasec_mapping: letter = (item_a + item_b) / 8 * 10 (0..10).
//            The profile is produced ONLY when all 12 items are present —
//            a partial profile would be a guess, so riasec stays null.
//            remote_pref / hands_pref / people_pref -> person.tolerances.*
//   stage 5: mirror_confirmed -> person.mirror_confirmed (never scored).
//   stage 6: perceived_fit -> person.perceived_fit {slug: mine|tolerable|
//            not_mine} via applyPerceivedFit (one-way veto in scoring).
//   No stage produces profession trials, so person.trials is always [] from
//   the interview; trials arrive from the separate measured-trial module.
//   person.completeness is computed here: filled / total over the tail
//   items of stages 0..5, excluding derived items and items explicitly
//   marked required:false (state, current_profession_name,
//   current_income_k). stages.json marks `required` explicitly on stages
//   0/1/3 only; stages 2/4/5 omit the flag, so an ABSENT flag is treated
//   as required-for-completeness (otherwise a session could report
//   completeness 1.0 with no values, no RIASEC and no mirror answer).
//   stages.json itself is NOT patched from here.
//
// Transcript entries: { stage: <stage id | 'cddq'>, who: 'user'|'mentor',
// text: string }. applyStage appends the user's free-text turn; the driver
// (UI / smoke script) appends mentor turns produced via llm.mjs.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { scorePerson } from './scoring.mjs';
import { loadProfessions } from './professions.mjs';
import { metaRespond, MODELS } from './llm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const STAGES_DATA = JSON.parse(readFileSync(join(HERE, 'stages.json'), 'utf8'));

const STAGES = STAGES_DATA.stages;
const CDDQ = STAGES_DATA.cddq_routing;
const VALUE_KEYS = STAGES_DATA.value_keys;
const RIASEC_LETTERS = ['R', 'I', 'A', 'S', 'E', 'C'];
const DOORS = ['start', 'pivot', 'bridge'];
// Tie-break order from stages.json cddq_routing.classification_rule.
const CDDQ_TIE_BREAK = ['inconsistent_information', 'lacks_information', 'not_ready'];
const PERCEIVED_FIT_VALUES = ['mine', 'tolerable', 'not_mine'];

const isFilled = (v) => {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true; // numbers (incl. 0 — a real answer) and booleans count
};

function stageById(id) {
  return STAGES.find((s) => s.id === id) || null;
}

function deriveAgeBand(age) {
  if (typeof age !== 'number' || !Number.isFinite(age)) return null;
  if (age < 18) return 'under_18';
  if (age <= 24) return '18_24';
  if (age <= 34) return '25_34';
  if (age <= 44) return '35_44';
  if (age <= 54) return '45_54';
  return '55_plus';
}

/** Normalise a rank6 answer to {valueKey: rank} or return null if unusable. */
function normalizeValuesRank(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) {
    // Ordered list, most important first.
    const out = {};
    raw.forEach((key, i) => { if (VALUE_KEYS.includes(key)) out[key] = i + 1; });
    return Object.keys(out).length === VALUE_KEYS.length ? out : null;
  }
  if (typeof raw === 'object') {
    const out = {};
    for (const key of VALUE_KEYS) {
      if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) out[key] = raw[key];
    }
    return Object.keys(out).length === VALUE_KEYS.length ? out : null;
  }
  return null;
}

function computeCompleteness(structured) {
  let total = 0;
  let filled = 0;
  for (const stage of STAGES) {
    if (stage.id > 5) continue; // stage 6 is post-scoring; never in completeness
    for (const item of stage.tail) {
      if (item.kind === 'derived') continue;
      if (item.required === false) continue; // explicitly optional: never counted
      total += 1;
      const v = structured[item.field];
      if (item.field === 'values_rank') {
        if (normalizeValuesRank(v)) filled += 1;
      } else if (isFilled(v)) {
        filled += 1;
      }
    }
  }
  return total > 0 ? Math.round((filled / total) * 1000) / 1000 : 0;
}

// ---------------------------------------------------------------------------
// Session lifecycle
// ---------------------------------------------------------------------------

export function createSession(door) {
  if (!DOORS.includes(door)) {
    throw new Error(`createSession: door must be one of ${DOORS.join(' | ')}, got ${JSON.stringify(door)}`);
  }
  return {
    door,
    phase: 'cddq',
    stage_index: -1,
    cddq_answers: {},
    cddq_type: null,
    structured: {},
    transcript: [],
    candidates: null,
    result: null,
    person: null,
    report: null,
  };
}

export function serializeSession(session) {
  return JSON.stringify(session);
}

export function deserializeSession(json) {
  const s = typeof json === 'string' ? JSON.parse(json) : json;
  return {
    door: s.door,
    phase: s.phase ?? 'cddq',
    stage_index: s.stage_index ?? -1,
    cddq_answers: s.cddq_answers ?? {},
    cddq_type: s.cddq_type ?? null,
    structured: s.structured ?? {},
    transcript: s.transcript ?? [],
    candidates: s.candidates ?? null,
    result: s.result ?? null,
    person: s.person ?? null,
    report: s.report ?? null,
  };
}

// ---------------------------------------------------------------------------
// CDDQ routing
// ---------------------------------------------------------------------------

function resolveCddqVote(item, answer) {
  const raw = answer && typeof answer === 'object' ? (answer.votes_for ?? answer.value ?? answer.label) : answer;
  if (typeof raw !== 'string') {
    throw new Error(`applyCddq: answer for ${item.id} must be an option value, a votes_for type, or an option object; got ${JSON.stringify(answer)}`);
  }
  if (CDDQ_TIE_BREAK.includes(raw)) return { value: raw, votes_for: raw };
  const opt = item.options.find((o) => o.value === raw || o.label === raw);
  if (!opt) {
    throw new Error(`applyCddq: unknown answer ${JSON.stringify(raw)} for ${item.id}; valid values: ${item.options.map((o) => o.value).join(', ')}`);
  }
  return { value: opt.value, votes_for: opt.votes_for };
}

/**
 * answersByItemId: { cddq_1: <option value>, cddq_2: ..., cddq_3: ... }
 * (keying by the item `field`, cddq_vote_1..3, is also accepted).
 * Sets session.cddq_type by majority vote with the stages.json tie-break.
 */
export function applyCddq(session, answersByItemId) {
  if (session.phase !== 'cddq') {
    throw new Error(`applyCddq: session phase is '${session.phase}', expected 'cddq'`);
  }
  if (!answersByItemId || typeof answersByItemId !== 'object') {
    throw new Error('applyCddq: answersByItemId object is required');
  }
  const votes = { not_ready: 0, lacks_information: 0, inconsistent_information: 0 };
  for (const item of CDDQ.items) {
    const answer = answersByItemId[item.id] ?? answersByItemId[item.field];
    if (answer === undefined) {
      throw new Error(`applyCddq: missing answer for ${item.id} (${item.field})`);
    }
    const { value, votes_for } = resolveCddqVote(item, answer);
    votes[votes_for] += 1;
    session.cddq_answers[item.id] = value;
    session.structured[item.field] = value;
  }
  const max = Math.max(...Object.values(votes));
  session.cddq_type = CDDQ_TIE_BREAK.find((t) => votes[t] === max);
  session.phase = 'stages';
  session.stage_index = 0;
  return session;
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/** The definition the UI/driver must present right now (null when done). */
export function stagePrompt(session) {
  if (session.phase === 'cddq') {
    return {
      id: 'cddq',
      slug: 'cddq',
      title: 'Before we start — what kind of stuck is this?',
      free_prompt_hint: 'In one or two sentences: what makes this decision hard right now?',
      tail: CDDQ.items.map((item) => ({
        field: item.field,
        id: item.id,
        kind: item.kind,
        label: item.prompt,
        options: item.options,
      })),
      cddq_routing: CDDQ,
    };
  }
  if (session.phase === 'stages') {
    return STAGES[session.stage_index] || null;
  }
  if (session.phase === 'stage6') {
    return stageById(6);
  }
  return null; // 'done'
}

/**
 * Apply one stage's answers. `tailAnswers` is keyed by the tail items'
 * `field` names from stages.json. Unknown fields throw (derived fields
 * such as age_band are accepted and ignored — they are computed, never
 * collected). After stage 5, scoring runs and the phase branches.
 */
export function applyStage(session, { freeText = '', tailAnswers = {} } = {}) {
  if (session.phase !== 'stages') {
    throw new Error(`applyStage: session phase is '${session.phase}', expected 'stages' (stage 6 goes through applyPerceivedFit)`);
  }
  const def = STAGES[session.stage_index];
  if (!def) throw new Error(`applyStage: no stage at index ${session.stage_index}`);
  if (def.id === 6) throw new Error('applyStage: stage 6 is applied via applyPerceivedFit');

  const validFields = new Map(def.tail.map((t) => [t.field, t]));
  for (const key of Object.keys(tailAnswers || {})) {
    const item = validFields.get(key);
    if (!item) {
      throw new Error(`applyStage: unknown tail field '${key}' for stage ${def.id} (${def.slug}); valid fields: ${[...validFields.keys()].join(', ')}`);
    }
    if (item.kind === 'derived') continue; // computed in assemblePerson, never collected
    session.structured[key] = tailAnswers[key];
  }

  if (typeof freeText === 'string' && freeText.trim().length > 0) {
    session.transcript.push({ stage: def.id, who: 'user', text: freeText });
  }

  if (def.id < 5) {
    session.stage_index += 1;
    return session;
  }

  // Stage 5 applied -> the data the verdict is built from is complete.
  // Run the deterministic engine. The LLM never touches these numbers.
  const person = assemblePerson(session);
  const result = scorePerson(person, loadProfessions());
  session.person = person;
  session.result = result;
  session.candidates = result.top3;
  if (result.mode === 'insufficient_data') {
    session.phase = 'done'; // no stage 6, no forced verdict
  } else {
    session.phase = 'stage6';
    session.stage_index = 6;
  }
  return session;
}

/**
 * Stage 6: perceived fit per candidate, { slug: 'mine'|'tolerable'|'not_mine' }.
 * Writes person.perceived_fit, re-runs scoring (the veto lives in
 * scoring.mjs), and closes the session.
 */
export function applyPerceivedFit(session, ratings) {
  if (session.phase !== 'stage6') {
    throw new Error(`applyPerceivedFit: session phase is '${session.phase}', expected 'stage6'`);
  }
  if (!ratings || typeof ratings !== 'object' || Object.keys(ratings).length === 0) {
    throw new Error('applyPerceivedFit: ratings object {slug: rating} is required');
  }
  for (const [slug, rating] of Object.entries(ratings)) {
    if (!PERCEIVED_FIT_VALUES.includes(rating)) {
      throw new Error(`applyPerceivedFit: rating for '${slug}' must be one of ${PERCEIVED_FIT_VALUES.join(' | ')}, got ${JSON.stringify(rating)}`);
    }
  }
  session.structured.perceived_fit = { ...(session.structured.perceived_fit || {}), ...ratings };
  const person = assemblePerson(session);
  const result = scorePerson(person, loadProfessions());
  session.person = person;
  session.result = result;
  session.candidates = result.top3;
  session.phase = 'done';
  return session;
}

// ---------------------------------------------------------------------------
// Person assembly — the exact shape scoring.mjs consumes.
// ---------------------------------------------------------------------------

export function assemblePerson(session) {
  const s = session.structured || {};
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  // RIASEC via stages.json's riasec_mapping — all 12 items or null.
  let riasec = null;
  {
    const per = {};
    let complete = true;
    for (const letter of RIASEC_LETTERS) {
      const a = num(s[`riasec_${letter.toLowerCase()}1`]);
      const b = num(s[`riasec_${letter.toLowerCase()}2`]);
      if (a === null || b === null) { complete = false; break; }
      per[letter] = ((a + b) / 8) * 10;
    }
    if (complete) riasec = per;
  }

  const supports = {};
  if (num(s.supports_money) !== null) supports.money = s.supports_money;
  if (num(s.supports_time) !== null) supports.time = s.supports_time;
  if (num(s.supports_people) !== null) supports.people = s.supports_people;
  if (num(s.supports_learning_access) !== null) supports.learning_access = s.supports_learning_access;

  const tolerances = {};
  if (num(s.remote_pref) !== null) tolerances.remote_pref = s.remote_pref;
  if (num(s.hands_pref) !== null) tolerances.hands_pref = s.hands_pref;
  if (num(s.people_pref) !== null) tolerances.people_pref = s.people_pref;

  const age = num(s.age);

  return {
    door: session.door,
    age,
    age_band: deriveAgeBand(age),
    income_floor_k: num(s.income_floor_k),
    current_profession_name: typeof s.current_profession_name === 'string' && s.current_profession_name.trim() ? s.current_profession_name : null,
    // Factual extras from stage 0 (not scoring inputs; report/plan context).
    country: typeof s.country === 'string' ? s.country : null,
    state: typeof s.state === 'string' ? s.state : null,
    current_income_k: num(s.current_income_k),
    languages: Array.isArray(s.languages) ? s.languages : [],
    values_rank: normalizeValuesRank(s.values_rank),
    autonomy_need: num(s.autonomy_need),
    relatedness_need: num(s.relatedness_need),
    supports: Object.keys(supports).length > 0 ? supports : null,
    riasec,
    tolerances: Object.keys(tolerances).length > 0 ? tolerances : null,
    attempts_started: num(s.attempts_started),
    attempts_finished: num(s.attempts_finished),
    exit_pattern: typeof s.exit_pattern === 'string' ? s.exit_pattern : null,
    energy_themes: Array.isArray(s.energy_themes) ? s.energy_themes : [],
    barriers: Array.isArray(s.barriers) ? s.barriers : [],
    red_lines: Array.isArray(s.red_lines) ? s.red_lines : [],
    mirror_confirmed: typeof s.mirror_confirmed === 'string' ? s.mirror_confirmed : null,
    resources: {
      hours_per_day: num(s.hours_per_day),
      budget_k: num(s.budget_k),
      cushion_months: num(s.cushion_months),
      documents_ok: typeof s.documents_ok === 'string' ? s.documents_ok : null,
      health_limits: Array.isArray(s.health_limits) ? s.health_limits : [],
    },
    trials: [], // no interview stage produces trials (see header contract)
    perceived_fit: s.perceived_fit && typeof s.perceived_fit === 'object' ? { ...s.perceived_fit } : {},
    cddq_type: session.cddq_type ?? null,
    completeness: computeCompleteness(s),
  };
}

// ---------------------------------------------------------------------------
// Report (Wonder) — presentation only; it never moves a number.
// ---------------------------------------------------------------------------

const REPORT_STRUCTURE = [
  'Write the verdict report in this argued-answer structure, in order:',
  '1. His/her facts, played back plainly (Point A: age, current situation, income floor, real resources — hours, budget, cushion, documents, health limits).',
  '2. Resources and constraints that shape what is honestly possible — including supports, barriers and red lines.',
  '3. The top candidates (only when the mode allows a verdict): for each, the LOVE band and the POTENTIAL band, each written as a RANGE (e.g. "LOVE 0.55–0.79"), its fitness category, and the plain-language reason it fits or strains — argued from the facts above, not from adjectives.',
  '4. The honest BUT: what could break this plan, where people usually quit, and any flags (e.g. pay below the income floor). Never hide a flag.',
  '5. The 90-day check plan: concrete dated-style steps and what evidence will be collected by the check-in.',
  'Hard rules: present every score as a range, NEVER as a single number and NEVER as a "match %". Never invent pay figures, professions or facts that are not in the input JSON. No personality labels, no type names. Warm, plain-spoken, concrete — this is written for the person, not about them.',
].join('\n');

const REPORT_STRUCTURE_INSUFFICIENT = [
  'The scoring mode is insufficient_data: there is NO profession verdict, and you must not invent one, hint at one, or rank professions.',
  'Write the report in this structure, in order:',
  '1. His/her facts, played back plainly — what we actually know so far.',
  '2. Why there is no verdict yet, in plain language, using the mode_reason from the input: what is missing or not yet decided. This is honesty, not failure — say so.',
  '3. The exploration plan from the input, presented as the product itself: each step warm, concrete and doable this month, with what it will prove.',
  '4. The 90-day check: what we will know by then that we do not know now, and how the verdict gets built from that evidence.',
  'Hard rules: no profession names presented as recommendations, no scores presented as verdicts, no "match %", no personality labels. Warm, plain-spoken, concrete.',
].join('\n');

export async function generateReport(session) {
  if (!session.result) {
    throw new Error('generateReport: session has no scoring result yet (finish stage 5 first)');
  }
  const person = session.person || assemblePerson(session);
  const insufficient = session.result.mode === 'insufficient_data';

  // Key structured facts only. No name/gender fields exist in this data;
  // country/state are deliberately not sent to the report writer either —
  // the verdict never turns on them.
  const facts = {
    door: person.door,
    age: person.age,
    age_band: person.age_band,
    current_profession_name: person.current_profession_name,
    current_income_k: person.current_income_k,
    income_floor_k: person.income_floor_k,
    resources: person.resources,
    values_rank: person.values_rank,
    autonomy_need: person.autonomy_need,
    relatedness_need: person.relatedness_need,
    supports: person.supports,
    riasec: person.riasec,
    attempts_started: person.attempts_started,
    attempts_finished: person.attempts_finished,
    exit_pattern: person.exit_pattern,
    energy_themes: person.energy_themes,
    barriers: person.barriers,
    red_lines: person.red_lines,
    mirror_confirmed: person.mirror_confirmed,
    perceived_fit: person.perceived_fit,
    cddq_type: person.cddq_type,
    completeness: person.completeness,
  };

  const input = JSON.stringify({ result: session.result, facts }, null, 2);
  const { text } = await metaRespond({
    model: MODELS.report,
    instructions: insufficient ? REPORT_STRUCTURE_INSUFFICIENT : REPORT_STRUCTURE,
    input,
    // Wonder's default reasoning effort is "max" and consumed an entire
    // 3000-token budget with no message output (status "incomplete",
    // reason "max_output_tokens", observed in the persona-10 smoke).
    // A report draft does not need max reasoning: pin it low, budget 4000.
    reasoning: { effort: 'low' },
    maxOutputTokens: 4000,
  });
  session.report = text;
  return text;
}

export default {
  createSession,
  applyCddq,
  stagePrompt,
  applyStage,
  applyPerceivedFit,
  assemblePerson,
  generateReport,
  serializeSession,
  deserializeSession,
};
