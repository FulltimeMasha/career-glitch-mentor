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
//            languages / current_income_k are kept as factual extras
//            (scoring ignores them); country / state stay ONLY in
//            session.structured — they never enter the person object
//            (audit C6: the verdict must not turn on them).
//   stage 1: attempts_started / attempts_finished / exit_pattern /
//            energy_themes -> same-named person fields.
//   stage 2: values_rank -> person.values_rank (object {valueKey: rank 1..6};
//            an ordered array, most-important first, is also accepted and
//            normalised); autonomy_need / relatedness_need -> same-named;
//            supports_money / supports_time / supports_people /
//            supports_learning_access -> person.supports {money, time,
//            people, learning_access}; target_fields -> person.target_fields
//            (the fields the person named as their direction — the coded
//            capture for what used to live only in free text; the
//            direction anchor in scoring.mjs holds one top-3 seat for
//            the best legal in-field candidate).
//   stage 3: barriers / red_lines -> same-named (plan/output only, unscored).
//   stage 4: riasec_<letter><n> items -> person.riasec via stages.json's
//            riasec_mapping: letter = (item_a + item_b) / 8 * 10 (0..10).
//            The profile is produced ONLY when all 12 items are present —
//            a partial profile would be a guess, so riasec stays null.
//            remote_pref / hands_pref / people_pref -> person.tolerances.*
//   stage 5: mirror_confirmed -> person.mirror_confirmed (never scored).
//   stage 6: perceived_fit -> person.perceived_fit {slug: mine|tolerable|
//            not_mine} via applyPerceivedFit (hard exclusion + bounded
//            'mine' LOVE nudge in scoring — founder QA rule, 27.10.2026).
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

import { scorePerson, TARGET_FIELDS } from './scoring.mjs';
import { loadProfessions } from './professions.mjs';
import { metaRespond, MODELS, sanitizeUserText } from './llm.mjs';
import { verifyReport, buildVerifyFeedback, removeSentences } from './verify.mjs';

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

/** Normalise a rank6 answer to {valueKey: rank} or return null if unusable.
 *  Object-form ranks must be a true forced ranking — integers 1..6, all
 *  distinct (audit V1, 27.10.2026: any numbers at all were accepted, so
 *  a rank of 99 silently poisoned the needs–supplies math). */
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
    const used = new Set();
    for (const key of VALUE_KEYS) {
      const v = raw[key];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 6 || used.has(v)) return null;
      used.add(v);
      out[key] = v;
    }
    return out;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Intake validation (audit V1/V2, 27.10.2026). One validator, driven by
// the stages.json item definitions themselves (kind, min, max, option
// values), applied to every tail answer at the moment it is stored:
//   * numbers/scales: must be finite numbers; CLAMPED into the item's
//     declared range (age 300 → 99, hours 100 → 16, floor −50 → 0);
//     fields whose item declares no max get a generous sanity ceiling.
//   * choices: must be one of the declared option values — anything
//     else (documents_ok 'maybe') is rejected, and the API layer turns
//     the rejection into a clean 400 with no internal text (V14).
//   * multichoices: must be a LIST — a bare string is rejected
//     explicitly (V2: it used to silently become []); entries are
//     filtered to the declared option values (languages ['klingon']
//     collapses to the declared 'other' via allow_other, it does not
//     enter the coded answers as-is); a "none"-type option mixed with
//     substantive answers is normalised away (V3/U9: 'none' only ever
//     stands alone — see the multichoice branch).
//   * rank6: must normalise to a true forced ranking.
//   * short text: control characters flattened, length capped (also
//     the C5 prompt-injection hygiene for anything later quoted to an
//     LLM).
// ---------------------------------------------------------------------------
const NUMBER_SANITY_CEILING = 100000;

function validateTailValue(item, value) {
  switch (item.kind) {
    case 'number':
    case 'scale': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`applyStage: '${item.field}' must be a number`);
      }
      const min = typeof item.min === 'number' ? item.min : 0;
      const max = typeof item.max === 'number' ? item.max : NUMBER_SANITY_CEILING;
      return Math.min(max, Math.max(min, value));
    }
    case 'choice': {
      const vals = (item.options || []).map((o) => o.value);
      if (typeof value !== 'string' || !vals.includes(value)) {
        throw new Error(`applyStage: '${item.field}' must be one of: ${vals.join(' | ')}`);
      }
      return value;
    }
    case 'multichoice': {
      if (!Array.isArray(value)) {
        throw new Error(`applyStage: '${item.field}' must be a list of option values`);
      }
      const vals = new Set((item.options || []).map((o) => o.value));
      // "None"-type options (audit V3/U9, 28.10.2026): 'No limits',
      // 'No red lines', 'none_clear' etc. are marked exclusive in
      // stages.json — they can only ever stand ALONE. A payload that
      // mixes one with substantive answers is normalised by dropping
      // the none (the stated limits/red lines/barriers are the facts;
      // 'none' beside them is the contradiction, and dropping a real
      // stated limit would be the dangerous direction).
      const noneVals = new Set((item.options || [])
        .filter((o) => o.exclusive === true || o.value === 'none' || (typeof o.value === 'string' && o.value.startsWith('none_')))
        .map((o) => o.value));
      const out = [];
      for (const v of value) {
        if (typeof v !== 'string') continue;
        if (vals.has(v)) { if (!out.includes(v)) out.push(v); }
        else if (item.allow_other && !out.includes('other')) out.push('other');
      }
      if (out.length > 1 && out.some((v) => noneVals.has(v))) {
        return out.filter((v) => !noneVals.has(v));
      }
      return out;
    }
    case 'rank6': {
      if (!normalizeValuesRank(value)) {
        throw new Error(`applyStage: '${item.field}' must rank all six values 1..6 with no ties`);
      }
      return value;
    }
    case 'text_short': {
      if (typeof value !== 'string') {
        throw new Error(`applyStage: '${item.field}' must be text`);
      }
      return sanitizeUserText(value, 500);
    }
    default:
      return value;
  }
}

// ---------------------------------------------------------------------------
// Progression integrity (audit C1, 27.10.2026). The session is
// client-held, so a client-declared phase/stage_index proves nothing:
// progress is DERIVED from the coded answers actually present — the
// opening is done when all three CDDQ votes are stored, and the stage
// count is the number of CONSECUTIVE stages (0..5) whose required tail
// items are all filled. The API layer reconciles every session against
// this before applying cddq/stage/fit/report actions, so a forged
// stage_index can never outrun the answers behind it.
// ---------------------------------------------------------------------------
export function deriveProgress(session) {
  const s = (session && session.structured) || {};
  const cddqAnswers = (session && session.cddq_answers) || {};
  const cddqDone = CDDQ.items.every((it) => isFilled(s[it.field]) || isFilled(cddqAnswers[it.id]));
  let stagesAnswered = 0;
  for (const stage of STAGES) {
    if (stage.id > 5) continue;
    const items = stage.tail.filter((t) => t.kind !== 'derived' && t.required !== false);
    if (!items.length) { stagesAnswered += 1; continue; }
    const done = items.every((t) => (t.field === 'values_rank' ? !!normalizeValuesRank(s[t.field]) : isFilled(s[t.field])));
    if (!done) break; // stages are sequential — the first gap stops the count
    stagesAnswered += 1;
  }
  return { cddqDone, stagesAnswered };
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
    verification: null,
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
    verification: s.verification ?? null,
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
// CDDQ type integrity (gate smalls, 28.10.2026). The session is
// client-held, so a client-sent cddq_type proves nothing: the type is
// RECOMPUTED from the stored votes — the same option resolution
// applyCddq used to derive it — and the API layer overwrites the
// session's type with the recomputed value before anything reads it
// (assemblePerson consumes session.cddq_type; the claimed value is
// ignored). applyCddq writes the votes twice — cddq_answers by item
// id and structured by field — from the same answers; when both
// copies are complete they must agree, and every stored vote must
// resolve to a declared option of its item. A flipped type or a
// rewritten vote set throws here, and the API answers a clean 400.
// Returns the recomputed type, or null when the opening is not fully
// answered yet (nothing to recompute — the type is not in force).
// ---------------------------------------------------------------------------
function typeFromStoredVotes(getAnswer) {
  const votes = { not_ready: 0, lacks_information: 0, inconsistent_information: 0 };
  for (const item of CDDQ.items) {
    const answer = getAnswer(item);
    if (answer === undefined || answer === null || answer === '') return null;
    const { votes_for } = resolveCddqVote(item, answer); // throws on junk
    votes[votes_for] += 1;
  }
  const max = Math.max(...Object.values(votes));
  return CDDQ_TIE_BREAK.find((t) => votes[t] === max);
}

export function recomputeCddqType(session) {
  if (!session || typeof session !== 'object') return null;
  const byId = typeFromStoredVotes((item) => (session.cddq_answers || {})[item.id]);
  const byField = typeFromStoredVotes((item) => (session.structured || {})[item.field]);
  if (byId && byField && byId !== byField) {
    throw new Error('recomputeCddqType: the two stored copies of the CDDQ votes disagree');
  }
  return byId || byField;
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

// ---------------------------------------------------------------------------
// Stage-0 free-text number extraction (fallback only).
// The structured Point A fields are the source of truth — the page
// collects them as widgets. But when a person states a number ONLY in
// their free-text answer ("savings cover maybe 3 months"), scoring must
// not silently read it as nothing (founder QA, 27.10.2026: that sentence
// was stored as cushion 0 and the verdict repeated "0 months"). The
// patterns are deliberately conservative: an explicit keyword near an
// explicit number, values range-checked, and a field the structured
// answers already carry is NEVER overwritten.
// ---------------------------------------------------------------------------
const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const NUM_TOKEN = '(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)';
const numFromToken = (tok) => {
  if (tok == null) return null;
  if (/^\d/.test(tok)) { const v = Number(tok); return Number.isFinite(v) ? v : null; }
  return WORD_NUMBERS[tok] ?? null;
};
const moneyKFrom = (digits, hasKSuffix) => {
  let v = Number(digits);
  if (!Number.isFinite(v)) return null;
  if (!hasKSuffix && v >= 1000) v = v / 1000;
  return v;
};

export function extractStage0Numbers(text) {
  const out = {};
  const t = ` ${String(text).toLowerCase().replace(/,/g, '')} `;
  let m;
  // Cushion / runway, in months.
  if ((m = t.match(new RegExp(`(?:savings?|cushion|runway|cover|lasts?|last)[^0-9]{0,30}?${NUM_TOKEN}\\s*months?`)))) {
    const v = numFromToken(m[1]);
    if (v != null && v <= 120) out.cushion_months = v;
  } else if ((m = t.match(new RegExp(`${NUM_TOKEN}\\s*months?\\s*of\\s*(?:savings|expenses|runway)`)))) {
    const v = numFromToken(m[1]);
    if (v != null && v <= 120) out.cushion_months = v;
  }
  // Age.
  if ((m = t.match(/(?:i am|i'm|age[:\s]+)\s*(\d{2})\b/)) || (m = t.match(/\b(\d{2})\s*years?\s*old\b/))) {
    const v = Number(m[1]);
    if (v >= 14 && v <= 99) out.age = v;
  }
  // Study hours per day.
  if ((m = t.match(/(\d+(?:\.\d+)?)\s*hours?\s*(?:a|per)\s*day/))) {
    const v = Number(m[1]);
    if (v > 0 && v <= 16) out.hours_per_day = v;
  }
  // Money figures ($K): floor, current income, budget.
  const MONEY = '\\$?\\s*(\\d+(?:\\.\\d+)?)\\s*(k)(?![a-z])|\\$\\s*(\\d+(?:\\.\\d+)?)';
  const grabMoney = (keywordRe) => {
    const mm = t.match(new RegExp(`(?:${keywordRe})[^0-9$]{0,30}?(?:${MONEY})`));
    if (!mm) return null;
    if (mm[1] != null) return moneyKFrom(mm[1], true);
    return moneyKFrom(mm[3], false);
  };
  const floor = grabMoney('floor|minimum|at least|below');
  if (floor != null && floor > 0 && floor <= 1000) out.income_floor_k = floor;
  const income = grabMoney('i earn|i make|earning|salary|income|making');
  if (income != null && income > 0 && income <= 1000) out.current_income_k = income;
  const budget = grabMoney('budget');
  if (budget != null && budget >= 0 && budget <= 1000) out.budget_k = budget;
  return out;
}

/**
 * Apply one stage's answers. `tailAnswers` is keyed by the tail items'
 * `field` names from stages.json. Unknown fields throw (derived fields
 * such as age_band are accepted and ignored — they are computed, never
 * collected). After stage 5, scoring runs and the phase branches.
 */
export function applyStage(session, { freeText = '', tailAnswers = {} } = {}, professionsOverride = null) {
  if (session.phase !== 'stages') {
    throw new Error(`applyStage: session phase is '${session.phase}', expected 'stages' (stage 6 goes through applyPerceivedFit)`);
  }
  const def = STAGES[session.stage_index];
  if (!def) throw new Error(`applyStage: no stage at index ${session.stage_index}`);
  if (def.id === 6) throw new Error('applyStage: stage 6 is applied via applyPerceivedFit');

  const validFields = new Map(def.tail.map((t) => [t.field, t]));
  const answersIn = { ...(tailAnswers || {}) };
  // Stage 0 only: fill fields the structured answers left EMPTY from
  // numbers stated explicitly in the free text (fallback — the structured
  // Point A fields remain the source of truth).
  if (def.id === 0 && typeof freeText === 'string' && freeText.trim()) {
    const extracted = extractStage0Numbers(freeText);
    for (const [k, v] of Object.entries(extracted)) {
      if (!isFilled(answersIn[k])) answersIn[k] = v;
    }
  }
  for (const key of Object.keys(answersIn)) {
    const item = validFields.get(key);
    if (!item) {
      throw new Error(`applyStage: unknown tail field '${key}' for stage ${def.id} (${def.slug}); valid fields: ${[...validFields.keys()].join(', ')}`);
    }
    if (item.kind === 'derived') continue; // computed in assemblePerson, never collected
    // Blank means ABSENT, never invalid (audit follow-up, 28.10.2026):
    // a field the person typed into and then ERASED arrives as "" (or
    // whitespace-only, null, or an emptied list). That is a legitimate
    // "no answer", above all for the optional fields (current income,
    // state, target fields) — but the strict validator below threw on
    // it, the whole card died with a generic 400, and the audit's
    // random run lost 19 of 40 sessions to exactly this. A blank value
    // now stores nothing, exactly like a field that was never sent; a
    // REQUIRED field left blank therefore still blocks progression
    // through deriveProgress, the same as one never answered, while
    // non-blank junk is still rejected by the validator as before.
    if (!isFilled(answersIn[key])) { delete session.structured[key]; continue; }
    // Intake validation (V1/V2): clamp or reject against the item's own
    // declared ranges/enums before the value is stored — a coded answer
    // outside its legal range never reaches scoring.
    session.structured[key] = validateTailValue(item, answersIn[key]);
  }

  if (typeof freeText === 'string' && freeText.trim().length > 0) {
    session.transcript.push({ stage: def.id, who: 'user', text: freeText });
  }

  // Required-fields enforcement (gate smalls, 28.10.2026): a stage is
  // only APPLIED when every required item of THIS stage stands filled
  // in the merged answers (what the session already held plus this
  // submission) — the same completeness test deriveProgress uses,
  // pointed at one stage, with the required set read from stages.json
  // itself (an absent `required` flag counts as required, exactly as
  // in deriveProgress; derived items never count). Before this check
  // a stage call with an empty tail was ACCEPTED and merely failed to
  // advance the derived progress: the API said ok while Point A stood
  // empty. A blank required field is "absent" (see the blank rule
  // above), so it lands here as unfilled and the call is rejected —
  // the API layer turns the throw into a clean 400, and the session
  // the client holds is untouched.
  {
    const missing = def.tail
      .filter((t) => t.kind !== 'derived' && t.required !== false)
      .filter((t) => (t.field === 'values_rank'
        ? !normalizeValuesRank(session.structured[t.field])
        : !isFilled(session.structured[t.field])));
    if (missing.length) {
      throw new Error(`applyStage: stage ${def.id} (${def.slug}) is missing required answers: ${missing.map((t) => t.field).join(', ')}`);
    }
  }

  if (def.id < 5) {
    session.stage_index += 1;
    return session;
  }

  // Stage 5 applied -> the data the verdict is built from is complete.
  // Run the deterministic engine. The LLM never touches these numbers.
  // professionsOverride lets server hosts inject a list they loaded
  // themselves (e.g. fetched over HTTP where no site dir exists);
  // default behaviour is unchanged: read the local site files.
  const person = assemblePerson(session);
  const result = scorePerson(person, professionsOverride ?? loadProfessions());
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
export function applyPerceivedFit(session, ratings, professionsOverride = null) {
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
  const professions = professionsOverride ?? loadProfessions();
  // Ratings for professions that do not exist are dropped, never stored
  // (V1 hygiene: a client cannot mint perceived-fit entries for slugs
  // outside the base).
  const knownSlugs = new Set(professions.map((p) => p.slug));
  const cleanRatings = {};
  for (const [slug, rating] of Object.entries(ratings)) {
    if (knownSlugs.has(slug)) cleanRatings[slug] = rating;
  }
  if (Object.keys(cleanRatings).length === 0) {
    throw new Error('applyPerceivedFit: no ratings for professions in the base');
  }
  session.structured.perceived_fit = { ...(session.structured.perceived_fit || {}), ...cleanRatings };
  const person = assemblePerson(session);
  // Stage-6 freeze (audit L9): the re-score may only SELECT from the
  // candidate set the person was shown and rated — the top-3 of the
  // result this stage was presented from. Vetoes remove; nothing new
  // enters. See the freeze block in scoring.mjs.
  const frozen = session.result && Array.isArray(session.result.top3)
    ? session.result.top3.map((c) => c.slug).filter((s) => typeof s === 'string')
    : [];
  if (frozen.length) person.frozen_candidates = frozen;
  const result = scorePerson(person, professions);
  session.person = person;
  session.result = result;
  session.candidates = result.top3;
  session.phase = 'done';
  return session;
}

// ---------------------------------------------------------------------------
// Person assembly — the exact shape scoring.mjs consumes.
// ---------------------------------------------------------------------------

// Stated targets (Matchmaker 2.0 core, 28.10.2026): the specific job
// the person NAMED as their goal (stage 2 free text) — plus,
// defensively, a stated_targets list if a client sends one. Names
// stay RAW here: resolving them against the base is the deterministic
// matcher's job (engine/target-match.mjs), never this layer's and
// never the LLM's. Capped at 3 — a person has a goal, not a catalogue.
function collectStatedTargets(s) {
  const out = [];
  const push = (v) => {
    if (typeof v === 'string' && v.trim() && !out.includes(v.trim())) out.push(v.trim());
  };
  push(s.stated_target);
  if (Array.isArray(s.stated_targets)) for (const v of s.stated_targets) push(v);
  return out.slice(0, 3);
}

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
    max_training_months: num(s.max_training_months),
    current_profession_name: typeof s.current_profession_name === 'string' && s.current_profession_name.trim() ? s.current_profession_name : null,
    // Country/state are NOT carried into the scored person object
    // (audit C6, 27.10.2026 — the README promise: the verdict never
    // turns on where the person lives). They stay in
    // session.structured, where the session keeps them as facts; the
    // object scoring consumes — and the report layer reads — has no
    // country/state fields at all.
    current_income_k: num(s.current_income_k),
    languages: Array.isArray(s.languages) ? s.languages : [],
    values_rank: normalizeValuesRank(s.values_rank),
    autonomy_need: num(s.autonomy_need),
    relatedness_need: num(s.relatedness_need),
    target_fields: Array.isArray(s.target_fields) ? s.target_fields.filter((v) => TARGET_FIELDS.includes(v)) : [],
    stated_target_names: collectStatedTargets(s),
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

const PLAIN_REGISTER = 'REGISTER — plain words only, like talking to a smart friend who is busy: short sentences, zero internal terms. NEVER use these words or forms: RIASEC, CDDQ, cddq, "bands", "evidence", "needs-supplies", category letters (say Top fit / Good fit / Weak fit instead), "in the base", stage numbers, flag names or any code from the JSON. Be honest about risks and weak points — no rose-colored glasses — and end with one concrete next step that makes the reader want to move.';

const REPORT_STRUCTURE = [
  'Write the verdict report in this argued-answer structure, in order:',
  '1. His/her facts, played back plainly (age, current situation, the minimum pay they named, real resources — hours, budget, cushion, documents, health limits).',
  '2. Resources and constraints that shape what is honestly possible — including supports, barriers and red lines.',
  '3. The top candidates (only when the mode allows a verdict): for each, the LOVE range and the POTENTIAL range, each written as a RANGE OF PERCENTAGES (the input gives 0–1 values — convert them: 0.55 becomes 55%, e.g. "LOVE 55–79%"), its fit in plain words (Top fit / Good fit / Weak fit), and the argued reason it fits or strains. Build each section on that candidate\'s "argument" object in the input (why_you / math / but / bridge) — argue from the person\'s own facts, not from adjectives.',
  '4. The honest BUT: what could break this plan, where people usually quit, and every pay warning. Each candidate\'s floor_status is the truth about pay: if it says below_floor, say plainly that typical pay misses the minimum they named and never present that pick as clean; if it says top_tier_only, say it only works at the top-earner tier; if it says top_decile_only, say only roughly the top tenth of earners clear the minimum they named.',
  '5. The jobs to run from (the "bottom3" in the input — the worst measured fits for this person): name all of them briefly, worst first. For each, one or two plain sentences on why it is wrong for THIS person, built on its why_not lines and its pay facts — never soften a pay warning here either. Frame the list as protection, not failure: knowing what to run from is half the match, and the matchmaker does not let you marry the wrong career.',
  '6. The 90-day check plan: concrete dated-style steps and what will be known by the check-in.',
  'Hard rules: present every score as a range of percentages (e.g. "55–79%"), NEVER as a decimal fraction, NEVER as a single number and never as one "match" figure. Never invent pay figures, professions or facts that are not in the input JSON. No personality labels, no type names. Warm, plain-spoken, concrete — this is written for the person, not about them.',
  PLAIN_REGISTER,
].join('\n');

const REPORT_STRUCTURE_INSUFFICIENT = [
  'The scoring mode is insufficient_data: there is NO profession verdict, and you must not invent one, hint at one, or rank professions.',
  'Write the report in this structure, in order:',
  '1. His/her facts, played back plainly — what we actually know so far.',
  '2. Why there is no verdict yet, in plain language, using the mode_reason from the input: what is missing or not yet decided. This is honesty, not failure — say so.',
  '3. The exploration plan from the input, presented as the product itself: each step warm, concrete and doable this month, with what it will prove.',
  '4. The 90-day check: what we will know by then that we do not know now, and how the verdict gets built from those facts.',
  'Hard rules: no profession names presented as recommendations, no scores presented as verdicts, no "match %", no personality labels. Warm, plain-spoken, concrete.',
  PLAIN_REGISTER,
].join('\n');

// Appended to REPORT_STRUCTURE only when the deterministic engine picked
// a cushion (result.bridge_pick): the #1 road is slow-money, so the report
// must also name the stable hired job that carries the bills meanwhile.
// Presentation only — the pick and its numbers are already final.
const BRIDGE_NOTE = 'The input also contains "bridge_pick" — a stable hired job chosen as this person\'s cushion, because their #1 road pays slowly at first. After the top-candidates section, add one short section titled "Your cushion". Name the bridge job. Say plainly: the main road pays later, so this job carries the bills meanwhile — it is the floor under the main road, not a second verdict and not a better match. Argue it ONLY from its why_bridge lines, its LOVE/POTENTIAL ranges and its pay facts in the JSON; invent nothing. Keep it to one short paragraph plus the pay figure.';

// Appended to REPORT_STRUCTURE only when the deterministic engine
// picked a side-hustle idea (result.side_hustle_pick): one extra-money
// format offered next to the verdict. Presentation only — the pick,
// its tier and its reasons are already final, and the framing is the
// founder's rule itself: it is NOT a career and must never read as a
// fourth match.
const SIDE_HUSTLE_NOTE = 'The input also contains "side_hustle_pick" — ONE side-hustle idea the engine picked for extra money on the side. After the top-candidates section, add one short section titled "A side-hustle idea". Name it once. Say plainly: nobody hires you into it — it is extra money built sale by sale next to a main job, not a career, not a match and not a verdict. Argue it ONLY from its why_side lines and its figures in the JSON; invent nothing. Two or three sentences, no more.';

export async function generateReport(session, opts = {}) {
  if (!session.result) {
    throw new Error('generateReport: session has no scoring result yet (finish stage 5 first)');
  }
  const person = session.person || assemblePerson(session);
  const insufficient = session.result.mode === 'insufficient_data';

  // Key structured facts only. No name/gender fields exist in this data;
  // country/state are deliberately not sent to the report writer either —
  // the verdict never turns on them. User-typed strings are sanitised
  // before they enter the prompt (audit C5): flattened, capped, and
  // carried as JSON data values, never as prompt structure.
  const facts = {
    door: person.door,
    age: person.age,
    age_band: person.age_band,
    current_profession_name: person.current_profession_name ? sanitizeUserText(person.current_profession_name, 120) : null,
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
    energy_themes: Array.isArray(person.energy_themes) ? person.energy_themes.map((t) => sanitizeUserText(t, 60)) : [],
    barriers: person.barriers,
    red_lines: person.red_lines,
    mirror_confirmed: person.mirror_confirmed,
    perceived_fit: person.perceived_fit,
    cddq_type: person.cddq_type,
    completeness: person.completeness,
  };

  const input = JSON.stringify({ result: session.result, facts }, null, 2);
  let instructions = insufficient
    ? REPORT_STRUCTURE_INSUFFICIENT
    : (REPORT_STRUCTURE
      + (session.result && session.result.bridge_pick ? '\n' + BRIDGE_NOTE : '')
      + (session.result && session.result.side_hustle_pick ? '\n' + SIDE_HUSTLE_NOTE : ''));
  if (opts && typeof opts.verifyFeedback === 'string' && opts.verifyFeedback.trim()) {
    // Correction pass (verification layer, engine/verify.mjs): the
    // previous draft failed the checker's audit; the mismatches are
    // listed verbatim and ONLY those get fixed — same structure, same
    // facts, nothing new invented to fill the holes.
    instructions += [
      '',
      'CORRECTION PASS: a checker compared your previous draft of this report against the checked job data and the person\'s own answers, and found the problems below. Rewrite the FULL report, fixing exactly these problems and changing nothing else. Where a figure or claim is wrong, remove it or replace it with the exact figure or fact from the input JSON — never invent a replacement.',
      opts.verifyFeedback.trim(),
    ].join('\n');
  }
  const { text } = await metaRespond({
    model: MODELS.report,
    instructions,
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

// ---------------------------------------------------------------------------
// Verified report — the Agents-101 checker pattern (engine/verify.mjs).
// The Wonder draft is verified BEFORE anyone sees it: every figure
// against the base/scoring/person's own numbers, every claim about the
// person against their verbatim answers. One failed check buys exactly
// ONE regeneration with the mismatch list as feedback. A second failure
// does not buy a third draft: the unsupported sentences are cut (when
// what remains is still a real letter) and the report goes out UNSIGNED
// — the verdict screen shows the honest line instead of the signature.
// The outcome is logged on session.verification either way:
//   { status: 'passed'|'failed'|'error', signed, attempts, sanitized,
//     claims_status, issues[], drift[], checked_at }
// deps ({reportGenerator, claimChecker}) exist for unit tests only.
// ---------------------------------------------------------------------------
export async function generateVerifiedReport(session, professions = null, deps = {}) {
  const gen = deps.reportGenerator || ((s, o) => generateReport(s, o));
  const verifyOpts = { professions, claimChecker: deps.claimChecker };

  let text = await gen(session, {});
  let v = await verifyReport(session, text, verifyOpts);
  let attempts = 1;
  let sanitized = false;

  if (!v.ok && v.status === 'failed' && v.claimsStatus === 'ok') {
    try {
      const retry = await gen(session, { verifyFeedback: buildVerifyFeedback(v) });
      const v2 = await verifyReport(session, retry, verifyOpts);
      text = retry;
      v = v2;
      attempts = 2;
    } catch { /* keep the first draft and its verdict — a failed retry changes nothing */ }
  }

  if (!v.ok && v.status === 'failed') {
    const badSentences = [...v.numberIssues, ...v.claimIssues].map((i) => i.sentence).filter(Boolean);
    const cut = removeSentences(text, badSentences);
    if (cut.removed > 0 && cut.text.trim().length >= 200) {
      text = cut.text;
      sanitized = true;
    }
  }

  session.report = text;
  session.verification = {
    status: v.ok ? 'passed' : v.status,
    signed: !!v.ok,
    attempts,
    sanitized,
    claims_status: v.claimsStatus,
    ...(v.claimError ? { error: v.claimError } : {}),
    issues: [
      ...v.numberIssues.map((i) => `figure: ${i.token} — ${i.detail}`),
      ...v.claimIssues.map((i) => `claim: ${i.detail}`),
    ].slice(0, 12),
    drift: v.drift || [],
    checked_at: new Date().toISOString(),
  };
  return text;
}

// ---------------------------------------------------------------------------
// The matchmaker's visible checklist — what she checks, in plain words,
// derived from the session's existing stage machine (display only; the
// flow never changes). States: 'done' | 'current' | 'todo'.
// ---------------------------------------------------------------------------
const CHECKLIST_DEFS = [
  { key: 'answers', label: 'Your answers — where you stand: the facts, your pay floor, the time you have' },
  { key: 'story', label: 'Your pattern — what you tried before, and why you walked away' },
  { key: 'wants', label: 'What you want from a working day' },
  { key: 'blockers', label: 'Your blockers — papers, health, hard lines' },
  { key: 'market', label: 'The market check — real pay against your floor, and the AI risk' },
  { key: 'trial', label: 'The first date — one real Tuesday in each top job' },
];

export function buildChecklist(session) {
  const state = { answers: 'todo', story: 'todo', wants: 'todo', blockers: 'todo', market: 'todo', trial: 'todo' };
  if (session) {
    const phase = session.phase;
    if (phase === 'cddq') {
      state.answers = 'current';
    } else if (phase === 'stages') {
      const i = session.stage_index || 0;
      state.answers = i >= 1 ? 'done' : 'current';
      state.story = i >= 2 ? 'done' : (i === 1 ? 'current' : 'todo');
      state.wants = i >= 5 ? 'done' : (i >= 2 ? 'current' : 'todo');
      state.blockers = i >= 4 ? 'done' : (i === 3 ? 'current' : 'todo');
      state.market = i >= 5 ? 'current' : 'todo';
    } else if (phase === 'stage6') {
      state.answers = 'done'; state.story = 'done'; state.wants = 'done'; state.blockers = 'done';
      state.market = 'done';
      state.trial = 'current';
    } else if (phase === 'done') {
      state.answers = 'done'; state.story = 'done'; state.wants = 'done'; state.blockers = 'done';
      state.market = 'done'; // the check ran — its answer may be "not enough data yet"
      // With no verdict there was no first date; the exploration plan
      // keeps it open instead of pretending it happened.
      state.trial = session.result && session.result.mode === 'insufficient_data' ? 'todo' : 'done';
    }
  }
  return CHECKLIST_DEFS.map((d) => ({ key: d.key, label: d.label, state: state[d.key] }));
}

export default {
  createSession,
  applyCddq,
  stagePrompt,
  applyStage,
  applyPerceivedFit,
  assemblePerson,
  generateReport,
  generateVerifiedReport,
  buildChecklist,
  serializeSession,
  deserializeSession,
};
