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

// ---------------------------------------------------------------------------
// Profession families for the top-3 diversity rule. A family is the base
// category, EXCEPT the creator economy, which the base splits across
// 'online' and 'creative' while being one job wearing many hats (streaming,
// courses, UGC, content strategy…). At most ONE profession per family may
// appear in a top-3 — three wrappers of the same job are not three options.
// ---------------------------------------------------------------------------
const CREATOR_CLUSTER = new Set([
  'streamer-content-creator', 'online-course-creator', 'ugc-creator',
  'content-strategist', 'copywriter', 'podcast-producer', 'video-editor',
  'brand-strategist', 'videographer', 'voice-actor', 'photographer',
  'wedding-photographer',
]);

export function professionFamily(prof) {
  if (!prof) return 'other';
  if (CREATOR_CLUSTER.has(prof.slug)) return 'creator';
  return prof.category || `solo:${prof.slug}`;
}

const FAMILY_LABELS = {
  creator: 'online content creation',
  online: 'online and digital work',
  health: 'healthcare',
  trades: 'the trades',
  creative: 'creative work',
  beauty: 'beauty',
  food: 'food',
  people: 'working with people',
  transport: 'transport',
  business: 'business',
};

// ---------------------------------------------------------------------------
// SLOW-MONEY professions — EDITORIAL classification (founder's rule,
// 27.10.2026). In these professions the income is BUILT, not hired: an
// audience, a client book, a practice, commissions, ownership. There is no
// wage from month one, however good the fit is. When the #1 match is
// slow-money, scorePerson additionally picks ONE very stable HIRED job —
// the cushion (bridge_pick) — that clears the person's own income floor
// from the first paycheck while the main road is being built. Membership
// is by exact profession name in professions.json; review by hand, the
// way the verdicts themselves are reviewed.
// ---------------------------------------------------------------------------
export const SLOW_MONEY_NAMES = new Set([
  'Streamer / Content Creator', 'UGC Creator', 'Online Course Creator',
  'Podcast Producer', 'Real Estate Agent', 'Luxury Real Estate Agent',
  'Insurance Agent', 'Mortgage Broker', 'Copywriter', 'Brand Strategist',
  'Business Consultant', 'Video Editor', 'Grant Writer',
  'Translator / Interpreter', 'Motion Designer / 3D Artist', 'Web Designer',
  'Photographer', 'Wedding Photographer', 'Videographer', 'Tattoo Artist',
  'Illustrator', 'Fashion Designer', 'Voice Actor', 'DJ / Event Host',
  'Jewelry Maker', 'Home Stager', 'Interior Designer', 'Event Planner',
  'Wedding Planner', 'Choreographer', 'Set / Production Designer',
  'Costume Designer', 'Barber', 'Cosmetologist / Hair Stylist',
  'Beauty Salon Owner', 'Spa Owner', 'Makeup Artist', 'Nail Technician',
  'Lash / Brow Artist', 'Permanent Makeup Artist',
  'Personal / Fashion Stylist', 'Body Piercing Artist',
  'Hair Replacement / Wig Specialist', 'Paramedical Tattoo Artist',
  'Scalp Micropigmentation Artist', 'Electrologist', 'Reflexologist',
  'Life Coach', 'Wellness Coach', 'Fitness Trainer',
  'Yoga / Pilates Instructor', 'Dance Instructor', 'Music Instructor',
  'Private Tutor (in person)', 'Speech / Public Speaking Coach',
  'Chiropractor', 'Massage Therapist', 'Nutrition Coach / Dietitian',
  'Doula', 'Farmers Market Producer', 'Food Truck Owner',
  'Bakery / Café Owner', 'Meal-Prep Business Owner', 'Private Chef',
  'Caterer', 'Food Stylist', 'Chocolatier / Candy Maker', 'Coffee Roaster',
  'Owner-Operator Trucking', 'Medical Courier (owner route)',
  'Auto Detailing (mobile/owner)', 'Freight Broker / Agent', 'Yacht Broker',
  'Drone Pilot (commercial)', 'Airbnb Co-host / STR Manager',
  'Amazon FBA Seller', 'Boat Restoration / Flipping', 'Business Broker',
  'Car Flipping', 'Car Wash Owner', 'Cleaning Company Owner',
  'Commercial Insurance Producer', 'Etsy / Digital Products Seller',
  'Franchise Owner (home services)', 'Gym / Fitness Studio Owner',
  'Handyman Company Owner', 'Junk Removal Owner', 'Laundromat Owner',
  'Lawn Care Company Owner', 'Mobile Mechanic (owner)', 'Mobile Pet Groomer',
  'Painting Company Owner', 'Pet Boarding / Daycare Owner',
  'Pet Grooming Salon Owner', 'Photo Booth / Event Rentals Owner',
  'Pressure Washing Owner', 'Print-on-Demand Seller',
  'Real Estate Investor (flips)', 'Real Estate Investor (rentals)',
  'Resale / Flipping Business', 'Self-Storage Owner',
  'Senior Home Care Agency Owner', 'Tutoring Center Owner',
  'Vending / ATM Route Owner', 'Window Cleaning Owner',
  'Childcare Center Owner', 'Dog Trainer', 'Home Organizer (pro)',
  'Personal Financial Advisor', 'Loan Officer', 'Real Estate Appraiser',
  'General Contractor', 'Handyman (solo pro)', 'Furniture Restorer',
  'Home Inspector', 'Landscaper / Lawn Pro', 'House Painter',
]);

/** True when a profession (object with .name, or a bare name) is one of
 *  the slow-money professions above — income built, not a wage. */
export function isSlowMoney(profOrName) {
  if (!profOrName) return false;
  const name = typeof profOrName === 'string' ? profOrName : profOrName.name;
  return typeof name === 'string' && SLOW_MONEY_NAMES.has(name);
}

// ---------------------------------------------------------------------------
// Income-floor status of one candidate vs the person's own stated minimum.
//   clears        — typical pay is at or above the floor.
//   top_tier_only — typical pay is under the floor, but the top 25% clear it
//                   (only when a sourced top-quartile figure exists).
//   below_floor   — typical pay is under the floor and no sourced figure
//                   shows the top earners clearing it.
//   null          — no floor stated, or no pay figure to compare.
// ---------------------------------------------------------------------------
function floorStatus(person, prof) {
  const floor = person ? person.income_floor_k : null;
  if (!isNum(floor) || !prof || !isNum(prof.payK)) return null;
  if (prof.payK >= floor) return 'clears';
  const tq = isNum(prof.pay_top_quartile_k) ? prof.pay_top_quartile_k : null;
  if (tq != null && tq >= floor) return 'top_tier_only';
  return 'below_floor';
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
// Deterministic per-profession ARGUMENT (the argued verdict, spec 25.10).
// Built ONLY from the person's coded answers and real base fields — no
// invented numbers, no generic praise. Plain register throughout (short
// sentences, no internal terms): the UI prints these lines as-is, and the
// written report uses them as its spine. Sections: why_you (the person's
// own answers that drive the pick) · math (pay / outlook / AI / floor /
// training, sourced fields only) · but (the honest weak points, incl. the
// person's own blockers) · bridge (first steps out of their real numbers).
// ---------------------------------------------------------------------------
const VALUE_LABELS = {
  achievement: 'Achievement', independence: 'Independence', recognition: 'Recognition',
  relationships: 'Relationships', support: 'Support', working_conditions: 'Working conditions',
};

const BARRIER_LINES = {
  money: 'Money running out is what stopped you before — this path has to be paced so it does not happen again.',
  time: 'Time is what stopped you before — this only works if the hours you named stay protected.',
  documents: 'Documents stopped you before — step zero below puts that first.',
  health: 'Your health limits shape this path — every step below stays inside them.',
  family_pressure: 'Family pressure has stopped you before — this plan has to be explainable at home, in plain words.',
  fear_of_failure: 'You named fear of failing in public as a blocker — the first steps here are private and cheap, on purpose.',
  skills_gap: 'A skill gap felt impossible before — this entry is broken into small steps for exactly that reason.',
  location: 'Location limited you before — check the real commute and remote options before you commit.',
};

/** Per-value deficit fit for the values the person ranked: [{key, rank, fit}]. */
function valueFits(person, prof) {
  const out = [];
  if (person && person.values_rank && prof && prof.supplies) {
    for (const key of VALUE_KEYS) {
      const rank = person.values_rank[key];
      const supply = prof.supplies[key];
      if (isNum(rank) && isNum(supply)) out.push({ key, rank, fit: deficitFit((7 - rank) / 6, supply) });
    }
  }
  return out;
}

function buildArgument(person, prof, ctx) {
  const { love, potential, category, flags, floor_status: fs } = ctx;
  const res = person.resources || {};
  const why = [];
  const math = [];
  const but = [];
  const bridge = [];
  const floor = isNum(person.income_floor_k) ? person.income_floor_k : null;
  const pct = (x) => Math.round(x * 100);

  // ---- WHY YOU — this person's own answers, not adjectives.
  const fits = valueFits(person, prof).sort((a, b) => a.rank - b.rank);
  for (const f of fits.slice(0, 2)) {
    if (f.fit >= 0.7) why.push(`Your #${f.rank} must-have at work is ${VALUE_LABELS[f.key]} — and this job actually delivers it.`);
  }
  if (love.parts && isNum(love.parts.sdt) && love.parts.sdt >= 0.75) {
    if (isNum(person.autonomy_need) && person.autonomy_need >= 1 && prof.sdt && prof.sdt.autonomy >= 0.6) {
      why.push('You said being told exactly what to do is what kills a job for you — here, the decisions stay with you.');
    } else if (isNum(person.relatedness_need) && person.relatedness_need === 2 && prof.sdt && prof.sdt.relatedness >= 0.6) {
      why.push('People are the point for you — and this job is people, all day, not a screen.');
    }
  }
  if (love.parts && isNum(love.parts.riasec) && love.parts.riasec >= 0.75) {
    why.push('In the "one real day in this job" questions, your answers lined up with this work more than with almost anything else we checked.');
  }
  const trial = (person.trials || []).find((t) => t && t.slug === prof.slug);
  if (trial && isNum(trial.score) && trial.score >= 0.6) {
    why.push(`You already tried a real task from this job and scored ${pct(trial.score)}% — that is a real tryout, not a guess.`);
  }
  if (potential.profile === 'pivot' || potential.profile === 'bridge') {
    const tc = potential.parts && potential.parts.transfer_capital;
    const sd = potential.parts && potential.parts.shortage_distance;
    if (isNum(tc) && isNum(sd) && tc >= sd) why.push('Most of what you already do carries over to this job — it is a step up from where you stand, not a restart from zero.');
  } else if (potential.feasibility_subs) {
    const s = potential.feasibility_subs;
    if (isNum(s.entry_time_ok) && s.entry_time_ok >= 0.8 && isNum(s.budget_ok) && s.budget_ok >= 0.8 && isNum(prof.training_months)) {
      why.push(`The entry is realistic on your numbers: about ${prof.training_months} months of training, and your cushion plus budget cover it.`);
    }
  }
  if (isNum(person.attempts_finished) && isNum(person.attempts_started) && person.attempts_started >= 2 && person.attempts_finished >= Math.ceil(person.attempts_started / 2)) {
    why.push(`You finished ${person.attempts_finished} of the ${person.attempts_started} serious things you started — you close what you start, and this path rewards finishers.`);
  }

  // ---- THE MATH — sourced figures only; gaps are stated, never filled.
  if (isNum(prof.payK)) math.push(`Typical pay: ~$${prof.payK}K a year.`);
  else math.push('We do not have a checked pay figure for this job yet — no number is better than an invented one.');
  if (prof.bls_outlook) math.push(`Jobs outlook: ${prof.bls_outlook}.`);
  if (prof.bls_ai_exposure) math.push(`AI risk: ${prof.bls_ai_exposure} (${prof.bls_ai_exposure_source}).`);
  else math.push('AI risk: no checked data for this job yet — we will not invent a number.');
  const tq = isNum(prof.pay_top_quartile_k) ? prof.pay_top_quartile_k : null;
  if (floor != null && isNum(prof.payK)) {
    if (fs === 'clears') math.push(`Your minimum is $${floor}K — typical pay clears it.`);
    else if (fs === 'top_tier_only') math.push(`Typical pay ($${prof.payK}K) is under your $${floor}K minimum. The top 25% earn about $${tq}K — this only works if you reach that tier.`);
    else if (fs === 'below_floor') {
      if (tq != null) math.push(`Typical pay ($${prof.payK}K) is under your $${floor}K minimum — and even the top 25% (about $${tq}K) stay under it.`);
      else math.push(`Typical pay ($${prof.payK}K) is under your $${floor}K minimum, and we have no checked top-earner pay for this job — there is no honest pay ladder to point at.`);
    }
  }
  if (isNum(prof.training_months)) math.push(`Time to get in: about ${prof.training_months} months of training.`);

  // ---- THE HONEST PART — weak points, incl. the person's own blockers.
  const worst = valueFits(person, prof).filter((f) => f.rank <= 3).sort((a, b) => a.fit - b.fit)[0];
  if (worst && worst.fit <= 0.55) but.push(`The rub: you ranked ${VALUE_LABELS[worst.key]} #${worst.rank}, and this job is weak exactly there — that is the friction you would feel every week.`);
  for (const b of (Array.isArray(person.barriers) ? person.barriers : [])) {
    if (BARRIER_LINES[b]) { but.push(BARRIER_LINES[b]); break; }
  }
  if (fs === 'below_floor') but.push('The pay problem is real: loving a job does not pay rent. Treat this as a maybe, not a plan.');
  if (potential.feasibility_subs) {
    const s = potential.feasibility_subs;
    if (isNum(s.entry_time_ok) && s.entry_time_ok <= 0.5 && isNum(prof.training_months)) {
      but.push(`Training takes about ${prof.training_months} months, and your cushion is ${isNum(res.cushion_months) ? res.cushion_months : 0} months — the money side of the bridge is tight.`);
    } else if (isNum(s.budget_ok) && s.budget_ok <= 0.5) {
      but.push('The entry costs run ahead of the budget you named — the first stretch has to be funded some other way.');
    }
  }
  if (love.parts) {
    if (isNum(love.parts.riasec) && love.parts.riasec <= 0.5) but.push('Part of the daily work here is stuff you rated "not my job" in the day-in-the-job questions.');
    else if (isNum(love.parts.sdt) && love.parts.sdt <= 0.5) but.push('The day-to-day setup fights how you work best — that grinds people down slowly, not loudly.');
  }
  if (flags.includes('perceived_fit_veto')) but.push('You pictured one real Tuesday in this job and said "not mine" — that pulled its grade down. Believe that answer.');
  if (flags.includes('physical_limit')) but.push('You named a physical limit, and this job is heavy on the body — its grade was held down for exactly that reason.');
  if (flags.includes('current_profession_not_in_base')) but.push('Your current job is not in our base yet, so your chances here were scored the starter way.');
  if (category === 'C') but.push('Honest grade: this is the weakest fit of your three. Try it cheap before you believe in it.');

  // ---- FIRST STEPS — the bridge out of the person's real situation.
  if (person.current_profession_name) bridge.push(`Keep ${person.current_profession_name} paying while you switch — it funds the bridge. Do not quit first.`);
  if (res.documents_ok && res.documents_ok !== 'yes' && prof.attrs && prof.attrs.lic >= 1) {
    bridge.push('Step zero: sort out the licence documents — you told us they are not fully in order, and this job needs them.');
  }
  if (isNum(prof.training_months)) {
    let line = `Training runs about ${prof.training_months} months`;
    if (isNum(res.hours_per_day)) line += `; at your ${res.hours_per_day} hours a day, that is the pace the 90-day plan is built on`;
    bridge.push(line + '.');
    if (isNum(res.cushion_months) && res.cushion_months < prof.training_months) {
      bridge.push(`Your cushion (${res.cushion_months} months) is shorter than the training — keep some income running next to it.`);
    }
  }
  bridge.push('First step this week: do one real task from this job — a trial day or a sample project — before you spend a dollar on it.');

  return { why_you: why.slice(0, 3), math, but: but.slice(0, 3), bridge: bridge.slice(0, 3) };
}

/** Why a bottom-3 job is NOT this person — the deciding personal factors,
 *  in plain words, built ONLY from the person's own coded answers and real
 *  base fields: the must-haves this job starves, the day-in-the-life
 *  answers pointing away, the blockers it collides with, the pay test it
 *  fails, and an entry path longer than the cushion behind it. */
function buildWhyNot(person, prof, r) {
  const lines = [];
  const res = person.resources || {};
  const fits = valueFits(person, prof).filter((f) => f.rank <= 3).sort((a, b) => a.fit - b.fit);
  for (const f of fits.slice(0, 2)) {
    if (f.fit <= 0.6) lines.push(`You put ${VALUE_LABELS[f.key]} at #${f.rank} — this job gives you very little of it.`);
  }
  if (r.love.parts && isNum(r.love.parts.riasec) && r.love.parts.riasec <= 0.55) {
    lines.push('Your answers to the "one real day" questions point away from this work, not toward it.');
  }
  if (r.love.parts && isNum(r.love.parts.sdt) && r.love.parts.sdt <= 0.5) {
    lines.push('The daily setup fights how you work best — you would be forcing yourself, every day.');
  }
  if (r.flags && r.flags.includes('physical_limit')) {
    lines.push('You named a physical limit, and this job is heavy on the body — it would fight you every week.');
  }
  if (Array.isArray(person.barriers) && person.barriers.includes('documents') && prof.attrs && prof.attrs.lic >= 1) {
    lines.push('Documents stopped you before, and this job needs a licence — the wall you already hit stands right at the door.');
  }
  if (r.flags && r.flags.includes('perceived_fit_veto')) {
    lines.push('You pictured one real Tuesday in this job and said "not mine" — believe that answer.');
  }
  if (prof.verdict === 'NO') lines.push('The market side agrees: our base says NO to starting this job in 2027.');
  if (r.floor_status === 'below_floor' && isNum(person.income_floor_k) && isNum(prof.payK)) {
    lines.push(`And it fails your own pay test: typical pay ~$${prof.payK}K against your $${person.income_floor_k}K minimum.`);
  }
  if (isNum(prof.training_months) && isNum(res.cushion_months) && prof.training_months > res.cushion_months) {
    lines.push(`Getting in takes about ${prof.training_months} months of training before it pays anything — your cushion is ${res.cushion_months} months, so the money runs out first.`);
  }
  if (!lines.length) lines.push('On your answers, this is simply the weakest fit we measured — nothing in it matches what you asked for.');
  return lines.slice(0, 4);
}

/** The matchmaker's protective closing line on every "run from" card. */
const BOTTOM_CLOSING = 'That is the matchmaker\'s whole job: not letting you marry the wrong career. This door stays closed — on purpose.';

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

  const fs = floorStatus(person, prof);
  return {
    slug: prof.slug,
    name: prof.name,
    category,
    family: professionFamily(prof),
    verdict: prof.verdict ?? null,
    payK: isNum(prof.payK) ? prof.payK : null,
    pay_top_quartile_k: isNum(prof.pay_top_quartile_k) ? prof.pay_top_quartile_k : null,
    training_months: isNum(prof.training_months) ? prof.training_months : null,
    outlook: prof.bls_outlook ?? null,
    ai_exposure: prof.bls_ai_exposure ?? null,
    ai_exposure_tier: prof.bls_ai_exposure_tier ?? null,
    ai_exposure_source: prof.bls_ai_exposure_source ?? null,
    floor_status: fs,
    love,
    potential,
    confidence,
    flags,
    argument: buildArgument(person, prof, { love, potential, category, flags, floor_status: fs }),
  };
}

// ---------------------------------------------------------------------------
// Exploration plan for insufficient_data mode — built from what is missing.
// ---------------------------------------------------------------------------
function buildExplorationPlan(person) {
  const steps = [];
  if (person.cddq_type === 'not_ready') {
    steps.push('Start small, not deep: pick ONE tiny step this week — shadow one working day, or talk to one person in a field you envy. No big testing until you actually want to choose.');
  }
  if (!person.riasec) {
    steps.push('Answer the 12 "in this job you would…" interest questions, so your interests are measured, not guessed.');
  }
  if (!Array.isArray(person.trials) || person.trials.length === 0) {
    steps.push('Try 2 jobs for real — short task samples from an actual working day — in the two most plausible directions, and keep the scores.');
  }
  if (!isNum(person.completeness) || person.completeness < 0.8) {
    steps.push('Fill in the missing facts: your minimum pay, savings cushion in months, documents, health limits. Until then, any score would be a guess.');
  }
  if (!(person.supports && Object.values(person.supports).some((v) => isNum(v) && v > 0))) {
    steps.push('Name your support out loud: who gives you money, time, backing, a way to learn. Support predicts outcomes better than willpower does.');
  }
  if (isNum(person.age) && person.age < 25) {
    steps.push('Book an interest retest in 6–12 months — at your age interests are still moving, so today\'s answer is "what fits you now", not a label for life.');
  }
  // Pad to a minimum of 4 concrete steps, cap at 6.
  const padding = [
    'Do the "one real Tuesday" check on ONE job before you commit to anything.',
    'Set a 90-day check-in: whatever you tried by then becomes the facts the next verdict is built from.',
  ];
  for (const p of padding) {
    if (steps.length >= 4) break;
    steps.push(p);
  }
  return steps.slice(0, 6);
}

// ---------------------------------------------------------------------------
// scorePerson(person, professions) →
//   { mode, mode_reason, top3, bottom3, bridge_pick, results_count,
//     exploration_plan }
// bridge_pick is the slow-money cushion (see the block above the return);
// null unless the founder's 27.10.2026 rule fires and a candidate clears.
// No `match` / `percent` field exists anywhere in this output — by design.
// ---------------------------------------------------------------------------
export function scorePerson(person, professions) {
  const list = Array.isArray(professions) ? professions : [];
  const results = list.map((prof) => scoreCandidate(person, prof, list));
  const profBySlug = new Map(list.map((p) => [p.slug, p]));

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

  // ---- Top-3 selection: diversity + income floor, scores never inflated.
  // Pass 1: best-ranked candidates whose family is not yet represented AND
  //         whose typical pay does not fail the person's floor.
  // Pass 2: best-ranked remaining candidates from families still not
  //         represented (a below-floor pick may enter here — its card then
  //         carries the pay warning, never silence).
  // No pass ever takes a second profession from a family: if fewer than 3
  // families clear the bar, the list is honestly shorter than 3.
  const top3 = [];
  const usedFamilies = new Set();
  for (const pass of [1, 2]) {
    for (const r of sortable) {
      if (top3.length >= 3) break;
      if (top3.includes(r) || usedFamilies.has(r.family)) continue;
      if (pass === 1 && r.floor_status === 'below_floor') continue;
      top3.push(r);
      usedFamilies.add(r.family);
    }
  }
  const topSlugs = new Set(top3.map((r) => r.slug));

  // Bottom-3: the three LEAST suitable professions for this person — the
  // lowest personal fit (the LOVE score decides, not the market verdict)
  // among candidates with real measurement behind them — at least 2 of
  // the 3 LOVE parts present — never a top-3 pick, never a factually
  // gated (D) one, and at most ONE per family, like the top-3: three
  // different kinds of "not you", not three clones. Scores are never
  // inflated or deflated; if fewer than 3 candidates clear the bar, the
  // list is honestly shorter (never padded).
  // Order: worst first. Candidates whose LOVE range still reaches into
  // the #1 pick's range sort AFTER every candidate whose range does not:
  // side by side, "not you" must not look better than "you".
  const bottom3 = [];
  {
    const top1 = top3[0] || null;
    const lovePartsCount = (r) => [r.love.parts.needs_supplies, r.love.parts.sdt, r.love.parts.riasec].filter(isNum).length;
    const overlapsWinner = (r) => !!(top1 && isNum(top1.love.lo) && isNum(r.love.hi) && r.love.hi > top1.love.lo);
    const cands = results
      .filter((r) => r.category !== 'D' && !topSlugs.has(r.slug) && isNum(r.love.mid) && lovePartsCount(r) >= 2)
      .sort((a, b) => {
        const oa = overlapsWinner(a) ? 1 : 0;
        const ob = overlapsWinner(b) ? 1 : 0;
        if (oa !== ob) return oa - ob;
        if (a.love.mid !== b.love.mid) return a.love.mid - b.love.mid;
        const pa = a.potential.mid ?? 0;
        const pb = b.potential.mid ?? 0;
        if (pa !== pb) return pa - pb;
        return a.slug < b.slug ? -1 : 1;
      });
    const usedBottomFamilies = new Set();
    for (const r of cands) {
      if (bottom3.length >= 3) break;
      if (usedBottomFamilies.has(r.family)) continue;
      usedBottomFamilies.add(r.family);
      const prof = profBySlug.get(r.slug);
      bottom3.push({ ...r, why_not: buildWhyNot(person, prof || {}, r), closing: BOTTOM_CLOSING });
    }
  }

  // ---- Mode
  const trialsEmpty = !Array.isArray(person.trials) || person.trials.length === 0;
  let mode;
  let modeReason;
  if (person.cddq_type === 'not_ready') {
    mode = 'insufficient_data';
    modeReason = 'You said you have not decided to choose yet — no verdict gets forced. Small steps first.';
  } else if (isNum(person.completeness) && person.completeness < 0.45) {
    mode = 'insufficient_data';
    modeReason = 'Too many answers are missing to score this honestly.';
  } else if (!person.riasec && trialsEmpty) {
    mode = 'insufficient_data';
    modeReason = 'The interest questions are not answered and no job has been tried yet — liking the idea of a job is not a verdict.';
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
      top.floor_status !== 'below_floor' &&
      ageRuleOk
    ) {
      mode = 'direct';
      modeReason = 'Your top pick is a top fit on full answers, and its typical pay clears your minimum.';
    } else {
      mode = 'bands';
      modeReason = 'Some answers are still thin, so the scores are ranges, not single numbers — the direction is still clear.';
    }
  }

  // ---- "Why these three", in plain words, from the actual picks.
  let setReason = null;
  if (mode !== 'insufficient_data' && top3.length > 0) {
    const parts = [];
    if (mode === 'bands') parts.push('Some answers were thin, so your scores are ranges, not single numbers — the direction is still clear.');
    if (top3.length >= 2) {
      const labels = top3.map((r) => FAMILY_LABELS[r.family] || r.family);
      parts.push(`These picks are deliberately from different worlds — ${labels.join(', ')} — not three versions of the same job.`);
    }
    if (isNum(person.income_floor_k)) {
      const clearCount = top3.filter((r) => r.floor_status === 'clears').length;
      if (clearCount === top3.length) parts.push(`Every one of them clears your $${person.income_floor_k}K minimum on typical pay.`);
      else if (clearCount > 0) parts.push(`${clearCount} of the ${top3.length} clear your $${person.income_floor_k}K minimum on typical pay. The rest are marked on their cards — nothing is hidden.`);
      else parts.push(`None of the strong fits clears your $${person.income_floor_k}K minimum on typical pay — each card says exactly where it lands instead of hiding it.`);
    }
    if (top3.length < 3) parts.push(`Only ${top3.length} job${top3.length === 1 ? '' : 's'} cleared the bar honestly — the list is not padded with copies.`);
    parts.push('Next step: pick the one you would try first — the 90-day plan starts there.');
    setReason = parts.join(' ');
  }

  // ---- The cushion (founder's rule, 27.10.2026): when the #1 match is a
  // slow-money profession, also name ONE very stable HIRED job that
  // carries the bills while the main road is being built. Deterministic,
  // like everything here: the candidate must clear the person's own
  // income floor on typical pay, be quick to enter (≤12 months), carry
  // low AI exposure in the base (attrs.ai ≤ 1), not be a base-verdict NO,
  // fit the person at A/B on their own answers, not be slow-money itself,
  // and not duplicate a top-3 or bottom-3 pick. Among the survivors the
  // engine prefers one sharing the main road's strongest work muscle
  // (hands / people / tech / creat), so the cushion FEEDS the main road
  // instead of competing with it. If nothing clears every bar, the field
  // is null — an honest absence, never a padded pick.
  let bridgePick = null;
  if (mode === 'bands' && top3.length > 0 && SLOW_MONEY_NAMES.has(top3[0].name)) {
    const excludedSlugs = new Set([...top3, ...bottom3].map((r) => r.slug));
    const topProf = profBySlug.get(top3[0].slug);
    const FEED_LABELS = { hands: 'hands-on', people: 'people-facing', tech: 'technical', creat: 'creative' };
    let topAttr = null;
    let topAttrVal = 0;
    if (topProf && topProf.attrs) {
      for (const key of ['hands', 'people', 'tech', 'creat']) {
        const v = topProf.attrs[key];
        if (isNum(v) && v > topAttrVal) { topAttrVal = v; topAttr = key; }
      }
      if (topAttrVal < 1) topAttr = null;
    }
    const feedsMainRoad = (r) => {
      if (!topAttr) return false;
      const prof = profBySlug.get(r.slug);
      return !!(prof && prof.attrs && isNum(prof.attrs[topAttr]) && prof.attrs[topAttr] >= 1);
    };
    const pool = sortable.filter((r) => {
      if (excludedSlugs.has(r.slug)) return false;
      if (r.floor_status !== 'clears') return false;
      if (r.category !== 'A' && r.category !== 'B') return false;
      const prof = profBySlug.get(r.slug);
      if (!prof) return false;
      if (prof.verdict === 'NO') return false;
      if (!isNum(r.training_months) || r.training_months > 12) return false;
      if (!prof.attrs || !isNum(prof.attrs.ai) || prof.attrs.ai > 1) return false;
      if (SLOW_MONEY_NAMES.has(r.name)) return false;
      return true;
    });
    const pick = pool.find(feedsMainRoad) || pool[0] || null;
    if (pick) {
      const prof = profBySlug.get(pick.slug);
      const whyBridge = [];
      if (isNum(pick.payK) && isNum(person.income_floor_k)) {
        whyBridge.push(`Typical pay ~$${pick.payK}K — a wage that clears your $${person.income_floor_k}K minimum from the first paycheck, not from an audience.`);
      }
      if (isNum(pick.training_months)) {
        if (pick.training_months <= 1) whyBridge.push('No long training — employers hire into it directly.');
        else whyBridge.push(`Short road in: about ${pick.training_months} months of training before employers hire.`);
      }
      if (prof && prof.attrs && prof.attrs.lic >= 1) {
        whyBridge.push('Licensed work — employers hire for the license, which keeps the seat stable.');
      }
      if (prof && prof.attrs && prof.attrs.ai === 0) {
        whyBridge.push('AI exposure in our research base: low — this seat is not the kind AI is eating.');
      }
      if (feedsMainRoad(pick) && topAttr) {
        whyBridge.push(`It feeds your main road: both this job and ${top3[0].name} are ${FEED_LABELS[topAttr]} work — the muscle transfers.`);
      }
      whyBridge.push(`It fits you personally, too: ${pick.category === 'A' ? 'Top fit' : 'Good fit'} on your own answers.`);
      bridgePick = { ...pick, why_bridge: whyBridge };
    }
  }

  return {
    mode,
    mode_reason: modeReason,
    income_floor_k: isNum(person.income_floor_k) ? person.income_floor_k : null,
    set_reason: setReason,
    top3,
    bottom3,
    bridge_pick: bridgePick || null,
    results_count: results.length,
    exploration_plan: mode === 'insufficient_data' ? buildExplorationPlan(person) : [],
  };
}

export default scorePerson;
