// engine/scoring.mjs
// ---------------------------------------------------------------------------
// Career Glitch Mentor — DETERMINISTIC SCORING ENGINE (Day 1).
// Pure ESM: no I/O, no LLM, no randomness. Same inputs → same outputs.
//
// Implements career-glitch-model-v2.md §2 + career-glitch-test-v3-spec.md:
//   * TWO scores per candidate, never one: LOVE (TWA satisfaction) and
//     POTENTIAL (TWA satisfactoriness). A single "% match" is BANNED by the
//     model — no field named `match` or `percent` exists in the output.
//   * Both scores are BANDS (lo/mid/hi) with a confidence level.
//   * LOVE penalises DEFICIT only — a profession supplying MORE than the
//     person needs is never punished for the surplus (Wiegand et al. 2021).
//   * POTENTIAL has two profiles: /start (interests + trial + feasibility)
//     and /pivot|bridge (directional TransferCapital − ShortageDistance −
//     FeasibilityPenalty over attribute vectors; symmetric distance banned).
//   * Category A/B/C/D per candidate. D comes ONLY from factual gates
//     (documents, user-stated health limits). Perceived fit (stage 6) is a
//     one-way VETO: it can lower a category one step (floor C), never raise.
//   * High LOVE + pay below the person's income floor → exploitation-risk
//     flag; such a candidate can never anchor a direct verdict.
//   * Modes: insufficient_data | bands | direct, per test v3 honesty rules
//     (incl. the <25 rule: no direct verdict on interests alone).
//
// Weights are EDITORIAL Day-1 calibration until the first outcome cohort
// exists (model v2 is explicit about this); they are constants below, not
// hidden inside formulas.
// ---------------------------------------------------------------------------

const clamp01 = (x) => (x == null || Number.isNaN(x) ? null : Math.min(1, Math.max(0, x)));
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// Attrs used for the directional transfer/shortage computation (/pivot, /bridge).
const TRANSFER_ATTRS = ['tech', 'hands', 'people', 'care', 'creat', 'out'];
const VALUE_KEYS = ['achievement', 'independence', 'recognition', 'relationships', 'support', 'working_conditions'];
const RIASEC_KEYS = ['R', 'I', 'A', 'S', 'E', 'C'];

const CATEGORY_RANK = { A: 0, B: 1, C: 2, D: 3 };
const STEP_DOWN = { A: 'B', B: 'C', C: 'C', D: 'D' };

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Weighted mean over present (non-null) parts, weights renormalised. */
function weightedMean(parts, weights) {
  let num = 0;
  let den = 0;
  for (const [key, weight] of Object.entries(weights)) {
    const v = parts[key];
    if (isNum(v)) {
      num += v * weight;
      den += weight;
    }
  }
  return den > 0 ? num / den : null;
}

function countNullParts(parts) {
  return Object.values(parts).filter((v) => !isNum(v)).length;
}

/** Band around a mid value. Half-width: base 0.12, +0.08 if age<25,
 *  +0.06 per missing major component (null part) OF THAT SCORE. */
function band(mid, nullParts, age) {
  if (!isNum(mid)) return { mid: null, lo: null, hi: null };
  let half = 0.12 + 0.06 * nullParts;
  if (isNum(age) && age < 25) half += 0.08;
  return { mid, lo: clamp01(mid - half), hi: clamp01(mid + half) };
}

function confidenceLevel(totalNullParts, completeness) {
  if (totalNullParts >= 2 || (isNum(completeness) && completeness < 0.5)) return 'low';
  if (totalNullParts === 0 && isNum(completeness) && completeness >= 0.8) return 'high';
  return 'medium';
}

/** RIASEC congruence: 1 − mean|diff| between person (0..10 → 0..1) and
 *  profession (0..1). Symmetric congruence is used ONLY here, for interests;
 *  the banned symmetric distance is the skill-distance in /pivot. */
export function riasecCongruence(personRiasec, profRiasec) {
  if (!personRiasec || !profRiasec) return null;
  const diffs = [];
  for (const k of RIASEC_KEYS) {
    if (isNum(personRiasec[k]) && isNum(profRiasec[k])) {
      diffs.push(Math.abs(personRiasec[k] / 10 - profRiasec[k]));
    }
  }
  if (diffs.length === 0) return null;
  return clamp01(1 - diffs.reduce((a, b) => a + b, 0) / diffs.length);
}

/** Deficit-only fit for one need/supply pair: surplus is never penalised. */
const deficitFit = (need, supply) => 1 - Math.max(0, need - supply);

// ---------------------------------------------------------------------------
// LOVE — needs–supplies .40 · SDT .35 · RIASEC .25 (deficit-only mechanics)
// ---------------------------------------------------------------------------
export function loveParts(person, prof) {
  const parts = { needs_supplies: null, sdt: null, riasec: null };

  // needs–supplies: need_i = (7 − rank_i)/6 from the forced 1..6 ranking.
  if (person.values_rank && prof.supplies) {
    const fits = [];
    for (const key of VALUE_KEYS) {
      const rank = person.values_rank[key];
      const supply = prof.supplies[key];
      if (isNum(rank) && isNum(supply)) fits.push(deficitFit((7 - rank) / 6, supply));
    }
    if (fits.length > 0) parts.needs_supplies = fits.reduce((a, b) => a + b, 0) / fits.length;
  }

  // SDT affordances: autonomy + relatedness (competence lives on the
  // POTENTIAL narrative side, per the merged science map §2).
  if (isNum(person.autonomy_need) && isNum(person.relatedness_need) && prof.sdt) {
    const fits = [];
    if (isNum(prof.sdt.autonomy)) fits.push(deficitFit(person.autonomy_need / 2, prof.sdt.autonomy));
    if (isNum(prof.sdt.relatedness)) fits.push(deficitFit(person.relatedness_need / 2, prof.sdt.relatedness));
    if (fits.length > 0) parts.sdt = fits.reduce((a, b) => a + b, 0) / fits.length;
  }

  parts.riasec = riasecCongruence(person.riasec, prof.riasec);
  return parts;
}

// ---------------------------------------------------------------------------
// POTENTIAL /start — interest fit .30 · trial .30 · feasibility .40
// ---------------------------------------------------------------------------

/** Feasibility of the entry path vs the person's stage-0 resources.
 *  Sub-scores (each 0..1, missing ones skipped and renormalised):
 *   - entry_time_ok: runway vs training length. runway_months = cushion +
 *     2·hours_per_day (each daily study hour extends how long a part-time
 *     entry can be sustained — documented Day-1 stub).
 *     entry_time_ok = clamp01(runway / training_months); null if the
 *     profession's training length is unknown.
 *   - budget_ok: entry cost STUB cost_k = training_months × 0.4 ($K per
 *     training month, editorial stub, flagged 'entry_cost_stub');
 *     budget_ok = clamp01(budget_k / cost_k).
 *   - documents_factor: yes → 1, partial → 0.6, no → 0.25. (The hard
 *     documents GATE is separate: no-documents + hard-license = D.) */
function feasibilityStart(person, prof) {
  const res = person.resources || {};
  const subs = { entry_time_ok: null, budget_ok: null, documents_factor: null };

  if (isNum(prof.training_months) && prof.training_months > 0) {
    const cushion = isNum(res.cushion_months) ? res.cushion_months : 0;
    const hours = isNum(res.hours_per_day) ? res.hours_per_day : 0;
    subs.entry_time_ok = clamp01((cushion + 2 * hours) / prof.training_months);
    const costK = prof.training_months * 0.4;
    if (isNum(res.budget_k) && costK > 0) subs.budget_ok = clamp01(res.budget_k / costK);
  }
  if (res.documents_ok === 'yes') subs.documents_factor = 1;
  else if (res.documents_ok === 'partial') subs.documents_factor = 0.6;
  else if (res.documents_ok === 'no') subs.documents_factor = 0.25;

  const present = Object.values(subs).filter(isNum);
  return { value: present.length ? present.reduce((a, b) => a + b, 0) / present.length : null, subs };
}

function potentialStart(person, prof) {
  const trialEntry = (person.trials || []).find((t) => t && t.slug === prof.slug);
  const feas = feasibilityStart(person, prof);
  const parts = {
    interest_fit: riasecCongruence(person.riasec, prof.riasec),
    trial: trialEntry && isNum(trialEntry.score) ? clamp01(trialEntry.score) : null,
    feasibility: feas.value,
  };
  return {
    mid: weightedMean(parts, { interest_fit: 0.3, trial: 0.3, feasibility: 0.4 }),
    parts,
    profile: 'start',
    feasibility_subs: feas.subs,
  };
}

// ---------------------------------------------------------------------------
// POTENTIAL /pivot | /bridge — directional formula (model v2 §2, profile B)
//   potential_mid = clamp01(0.35 + 0.65·TransferCapital
//                            − 0.55·ShortageDistance
//                            − 0.25·FeasibilityPenalty)
//   (Day-1 editorial calibration constants, documented as such in model v2:
//   no validated combining formula exists yet.)
//   TransferCapital  = mean over TRANSFER_ATTRS of min(cur, tgt)/2
//   ShortageDistance = mean over TRANSFER_ATTRS of max(0, tgt − cur)/2
//   FeasibilityPenalty = ShortageDistance × (1 − resource_factor)
//   resource_factor  = mean of clamp01(hours_per_day/4) and
//                      clamp01(budget_k/20)  ($20K = full budget headroom stub)
// ---------------------------------------------------------------------------
export function findProfessionByName(name, professions) {
  if (!name || !Array.isArray(professions)) return null;
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const target = norm(name);
  if (!target) return null;
  const exact = professions.find((p) => norm(p.name) === target);
  if (exact) return exact;
  const containment = professions
    .filter((p) => norm(p.name).includes(target) || target.includes(norm(p.name)))
    .sort((a, b) => Math.abs(norm(a.name).length - target.length) - Math.abs(norm(b.name).length - target.length));
  return containment[0] || null;
}

function potentialPivot(person, prof, professions, flags) {
  const current = findProfessionByName(person.current_profession_name, professions);
  if (!current) {
    // No current vector in the base → /start profile, honestly flagged.
    flags.push('current_profession_not_in_base');
    const start = potentialStart(person, prof);
    return { ...start, profile: 'start_fallback_for_pivot' };
  }
  const transferVals = [];
  const shortageVals = [];
  for (const attr of TRANSFER_ATTRS) {
    const cur = current.attrs ? current.attrs[attr] : null;
    const tgt = prof.attrs ? prof.attrs[attr] : null;
    if (isNum(cur) && isNum(tgt)) {
      transferVals.push(Math.min(cur, tgt) / 2);
      shortageVals.push(Math.max(0, tgt - cur) / 2);
    }
  }
  if (transferVals.length === 0) {
    return { mid: null, parts: { transfer_capital: null, shortage_distance: null, feasibility_penalty: null }, profile: 'pivot' };
  }
  const transfer = transferVals.reduce((a, b) => a + b, 0) / transferVals.length;
  const shortage = shortageVals.reduce((a, b) => a + b, 0) / shortageVals.length;
  const res = person.resources || {};
  const hoursFactor = isNum(res.hours_per_day) ? clamp01(res.hours_per_day / 4) : 0;
  const budgetFactor = isNum(res.budget_k) ? clamp01(res.budget_k / 20) : 0;
  const resourceFactor = (hoursFactor + budgetFactor) / 2;
  const feasibilityPenalty = shortage * (1 - resourceFactor);
  const mid = clamp01(0.35 + 0.65 * transfer - 0.55 * shortage - 0.25 * feasibilityPenalty);
  return {
    mid,
    parts: { transfer_capital: transfer, shortage_distance: shortage, feasibility_penalty: feasibilityPenalty },
    profile: person.door === 'bridge' ? 'bridge' : 'pivot',
    // Directional detail for the report layer (not extra score parts).
    current_profession_slug: current.slug,
  };
}

// ---------------------------------------------------------------------------
// scoreCandidate(person, prof, professions?)
// professions is needed only for the /pivot|bridge current-profession lookup.
// ---------------------------------------------------------------------------
export function scoreCandidate(person, prof, professions = []) {
  const flags = [];
  const res = person.resources || {};
  const healthLimits = Array.isArray(res.health_limits) ? res.health_limits : [];

  // ---- LOVE
  const lParts = loveParts(person, prof);
  const loveMid = weightedMean(lParts, { needs_supplies: 0.4, sdt: 0.35, riasec: 0.25 });
  const love = band(loveMid, countNullParts(lParts), person.age);
  love.parts = lParts;

  // ---- POTENTIAL (profile by door)
  const pot = person.door === 'pivot' || person.door === 'bridge'
    ? potentialPivot(person, prof, professions, flags)
    : potentialStart(person, prof);
  const potential = band(pot.mid, countNullParts(pot.parts), person.age);
  potential.parts = pot.parts;
  potential.profile = pot.profile;
  if (pot.feasibility_subs) potential.feasibility_subs = pot.feasibility_subs;
  if (pot.current_profession_slug) potential.current_profession_slug = pot.current_profession_slug;

  const totalNullParts = countNullParts(lParts) + countNullParts(pot.parts);
  const confidence = confidenceLevel(totalNullParts, person.completeness);

  // ---- Category: factual gates FIRST (the only source of D).
  let category = null;
  if (res.documents_ok === 'no' && prof.attrs && prof.attrs.lic === 2) {
    category = 'D';
    flags.push('documents_gate');
  }
  if (healthLimits.includes('voice') && prof.gates && prof.gates.voice_load) {
    category = 'D';
    flags.push('voice_gate'); // D for this candidate → excluded from top-3
  }
  if (category !== 'D') {
    category = isNum(love.mid) && isNum(potential.mid) && love.mid >= 0.62 && potential.mid >= 0.58
      ? 'A'
      : isNum(love.mid) && isNum(potential.mid) && love.mid >= 0.45 && potential.mid >= 0.45
        ? 'B'
        : 'C';
  }

  // Physical limit: cap at C (not D — the user stated a limit, not a ban).
  if (category !== 'D' && healthLimits.includes('physical') && prof.attrs && prof.attrs.hands === 2) {
    if (CATEGORY_RANK[category] < CATEGORY_RANK.C) category = 'C';
    flags.push('physical_limit');
  }

  // Base-verdict cap: a profession the base itself says NO to is an
  // exit/anti-match candidate for /start and /pivot — capped at C.
  // (/bridge is exempt: bridging INTO a shrinking home-country role can
  // still be the honest bridge; the verdict stays visible on the card.)
  if (category !== 'D' && prof.verdict === 'NO' && (person.door === 'start' || person.door === 'pivot')) {
    if (CATEGORY_RANK[category] < CATEGORY_RANK.C) category = 'C';
    flags.push('base_verdict_no');
  }

  // Inflow competition (card-level fact from model v2 §1в; null in Day-1 data).
  if (prof.inflow_competition_flag) flags.push('inflow_competition');

  // ---- Perceived-fit VETO (stage 6): one step down, floor C, never up.
  const perceived = person.perceived_fit ? person.perceived_fit[prof.slug] : undefined;
  if (perceived === 'not_mine' && category !== 'D') {
    category = STEP_DOWN[category];
    flags.push('perceived_fit_veto');
  }

  // ---- Exploitation risk: high LOVE but pay under the person's floor.
  if (isNum(love.mid) && love.mid >= 0.62 && isNum(prof.payK) && isNum(person.income_floor_k) && prof.payK < person.income_floor_k) {
    flags.push('exploitation_risk');
  }

  return {
    slug: prof.slug,
    name: prof.name,
    category,
    verdict: prof.verdict ?? null,
    payK: isNum(prof.payK) ? prof.payK : null,
    love,
    potential,
    confidence,
    flags,
  };
}

// ---------------------------------------------------------------------------
// Exploration plan for insufficient_data mode — built from what is missing.
// ---------------------------------------------------------------------------
function buildExplorationPlan(person) {
  const steps = [];
  if (person.cddq_type === 'not_ready') {
    steps.push('Start with the coaching block, not the diagnosis: pick ONE small step this week (e.g. shadow one working day, or interview one person in a field you envy) — no deep testing until you actually want to choose.');
  }
  if (!person.riasec) {
    steps.push('Complete the stage-4 job-focused interest items (12 anchored "in this job you would…" items) so interests are measured, not guessed.');
  }
  if (!Array.isArray(person.trials) || person.trials.length === 0) {
    steps.push('Run 2 profession trials — short real-task samples from an actual working day — for the two most plausible directions, and record the scores.');
  }
  if (!isNum(person.completeness) || person.completeness < 0.8) {
    steps.push('Fill the missing stage-0 facts (income floor, cushion in months, documents status, health limits) — scores stay wide bands until the facts are in.');
  }
  if (!(person.supports && Object.values(person.supports).some((v) => isNum(v) && v > 0))) {
    steps.push('Do the supports inventory by name: who gives money, time, backing, learning access — supports predict outcomes better than barriers do.');
  }
  if (isNum(person.age) && person.age < 25) {
    steps.push('Schedule an interest retest in 6–12 months — interests at 18–24 are still moving (stability ≈ .67–.70), so today\'s answer is "your leanings now", not a label.');
  }
  // Pad to a minimum of 4 concrete steps, cap at 6.
  const padding = [
    'Do the stage-6 real-Tuesday check on ONE candidate before committing to anything.',
    'Set a 90-day check-in: whatever you tried by then becomes the data the next verdict is built from.',
  ];
  for (const p of padding) {
    if (steps.length >= 4) break;
    steps.push(p);
  }
  return steps.slice(0, 6);
}

// ---------------------------------------------------------------------------
// scorePerson(person, professions) →
//   { mode, mode_reason, top3, anti_match, results_count, exploration_plan }
// No `match` / `percent` field exists anywhere in this output — by design.
// ---------------------------------------------------------------------------
export function scorePerson(person, professions) {
  const list = Array.isArray(professions) ? professions : [];
  const results = list.map((prof) => scoreCandidate(person, prof, list));

  const sortable = results
    .filter((r) => r.category !== 'D')
    .sort((a, b) => {
      const rankDiff = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
      if (rankDiff !== 0) return rankDiff;
      const sumA = (a.love.mid ?? 0) + (a.potential.mid ?? 0);
      const sumB = (b.love.mid ?? 0) + (b.potential.mid ?? 0);
      if (sumB !== sumA) return sumB - sumA;
      return a.slug < b.slug ? -1 : 1; // deterministic tie-break
    });
  const top3 = sortable.slice(0, 3);
  const topSlugs = new Set(top3.map((r) => r.slug));

  // Anti-match: the NO-verdict profession the person's interests fit BEST
  // (that is exactly what makes it dangerous) — never one already in top-3.
  let antiMatch = null;
  if (person.riasec) {
    let best = -1;
    for (const prof of list) {
      if (prof.verdict !== 'NO' || topSlugs.has(prof.slug)) continue;
      const cong = riasecCongruence(person.riasec, prof.riasec);
      if (isNum(cong) && cong > best) {
        best = cong;
        antiMatch = results.find((r) => r.slug === prof.slug) || null;
      }
    }
  }

  // ---- Mode
  const trialsEmpty = !Array.isArray(person.trials) || person.trials.length === 0;
  let mode;
  let modeReason;
  if (person.cddq_type === 'not_ready') {
    mode = 'insufficient_data';
    modeReason = 'CDDQ type is not_ready: the person has not yet decided to choose — coaching and small steps first, no verdict is forced.';
  } else if (isNum(person.completeness) && person.completeness < 0.45) {
    mode = 'insufficient_data';
    modeReason = `Interview completeness ${person.completeness} is below 0.45 — not enough structured facts to score honestly.`;
  } else if (!person.riasec && trialsEmpty) {
    mode = 'insufficient_data';
    modeReason = 'No measured interests (RIASEC) and no profession trials — preferences alone are not a verdict.';
  } else {
    const top = top3[0];
    const topHasTrial = top ? (person.trials || []).some((t) => t && t.slug === top.slug) : false;
    const ageRuleOk = isNum(person.age) && person.age >= 25
      ? true
      : topHasTrial && isNum(person.attempts_finished) && person.attempts_finished >= 1;
    if (
      top &&
      top.category === 'A' &&
      top.confidence === 'high' &&
      !top.flags.includes('exploitation_risk') &&
      ageRuleOk
    ) {
      mode = 'direct';
      modeReason = 'Top candidate is category A with high confidence, no exploitation flag, and the age rule is satisfied (25+, or a measured trial plus a finished attempt).';
    } else {
      mode = 'bands';
      modeReason = 'Scores are reported as bands: the top candidate is not a clean A/high-confidence case, or the <25 evidence rule is not met.';
    }
  }

  return {
    mode,
    mode_reason: modeReason,
    top3,
    anti_match: antiMatch,
    results_count: results.length,
    exploration_plan: mode === 'insufficient_data' ? buildExplorationPlan(person) : [],
  };
}

export default scorePerson;
