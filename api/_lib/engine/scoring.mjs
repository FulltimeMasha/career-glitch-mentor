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
//     (documents, user-stated health limits).
//   * HARD EXCLUSIONS from the top-3 (founder QA, 27.10.2026 — supersedes
//     the Day-1 penalty-only treatment): a person's stated red lines
//     (training length, public voice, children, nights), a base-verdict NO,
//     a statutory age gate, a stated physical limit vs a heavy-body job,
//     and a stage-6 'not mine' veto REMOVE a candidate from the top-3
//     before ranking; the slot refills with the next candidate. A stage-6
//     'mine' is the one positive perceived-fit signal: a bounded +0.05
//     LOVE nudge, so a called-mine profession outranks an unmarked equal.
//     See topBlockReason() below.
//   * DIRECTION ANCHOR (founder decision, 27.10.2026): a field the person
//     named as their direction (stage 2 → person.target_fields) holds
//     ONE top-3 seat — the best-ranked in-field candidate that passed
//     every hard gate above. Presence only: no score is ever changed by
//     the anchor, and when every in-field door is blocked the result
//     says what blocked it instead of forcing a pick. See the anchor
//     block in scorePerson() and professionField() below.
//   * High LOVE + pay below the person's income floor → exploitation-risk
//     flag; such a candidate can never anchor a direct verdict.
//   * Modes: insufficient_data | bands | direct, per test v3 honesty rules
//     (incl. the <25 rule: no direct verdict on interests alone).
//
// Weights are EDITORIAL Day-1 calibration until the first outcome cohort
// exists (model v2 is explicit about this); they are constants below, not
// hidden inside formulas.
// ---------------------------------------------------------------------------

// The side-hustle idea (founder's rule, 28.10.2026) lives in its own
// module — this file sits at the deploy per-file size cap. One-way
// import: side-hustle.mjs never imports back; scorePerson hands it
// the scored results plus the small helpers it needs.
import { pickSideHustle } from './side-hustle.mjs';

const clamp01 = (x) => (x == null || Number.isNaN(x) ? null : Math.min(1, Math.max(0, x)));
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

/** "1 month" / "3.5 months" — training and cushion lengths are printed
 *  on the cards verbatim, and "about 1 months" reads as carelessness
 *  (founder QA, 27.10.2026). Every rendered month count goes through
 *  this, never a bare `${n} months`. */
const fmtMonths = (n) => `${n} ${n === 1 ? 'month' : 'months'}`;

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
 *  +0.06 per missing major component (null part) OF THAT SCORE.
 *  The mid itself is clamped to 0..1 (audit V5, 27.10.2026): a coded
 *  input outside its legal range must never push a score negative or
 *  above 1 — the intake validator clamps inputs, and this is the
 *  second, independent line of defence inside the engine. */
function band(mid, nullParts, age) {
  if (!isNum(mid)) return { mid: null, lo: null, hi: null };
  const m = clamp01(mid);
  let half = 0.12 + 0.06 * nullParts;
  if (isNum(age) && age < 25) half += 0.08;
  return { mid: m, lo: clamp01(m - half), hi: clamp01(m + half) };
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
// FIELD CLUSTERS for the DIRECTION ANCHOR (founder decision, 27.10.2026).
// Stage 2 asks the person which fields they are seriously aiming at
// (person.target_fields, values below). Membership of a profession in a
// field comes from data the profession already carries: its base
// category for the clean categories, the creator cluster for creator
// work, and an explicit override map for the professions whose category
// misfiles their field (the 'people', 'online' and 'business' buckets
// mix fields by construction — care roles sit in 'people', professions
// practised online sit in 'online'). The override map is editorial and
// reviewed by hand, the same way the verdicts are.
// ---------------------------------------------------------------------------
export const TARGET_FIELDS = [
  'health', 'trades', 'tech', 'creative', 'business',
  'education', 'transport', 'food', 'beauty', 'public_service',
];

const DIRECTION_FIELD_LABELS = {
  health: 'healthcare',
  trades: 'the trades, construction and engineering',
  tech: 'tech and IT',
  creative: 'creative and media work',
  business: 'business and finance',
  education: 'education, teaching and coaching',
  transport: 'logistics and transport',
  food: 'hospitality and food',
  beauty: 'beauty and personal care',
  public_service: 'public service and safety',
};

const FIELD_OVERRIDES = {
  // 'people' → healthcare: care and therapy roles filed under 'people'.
  'psychologist-therapist': 'health', 'substance-abuse-counselor': 'health',
  'marriage-and-family-therapist': 'health', 'rehabilitation-counselor': 'health',
  'school-psychologist': 'health', 'community-health-worker': 'health',
  'child-life-specialist': 'health', 'aba-therapist-kids': 'health',
  'social-worker': 'health', 'elder-care-companion-pro': 'health',
  // 'people' → education: teaching, instruction and coaching roles.
  'school-teacher': 'education', 'preschool-teacher': 'education',
  'special-education-teacher': 'education', 'school-counselor': 'education',
  'private-tutor-in-person': 'education',
  'esl-adult-literacy-teacher': 'education', 'career-and-technical-education-teacher': 'education',
  'music-instructor': 'education', 'dance-instructor': 'education',
  'swim-instructor': 'education', 'driving-instructor': 'education',
  'corporate-trainer': 'education', 'sports-coach': 'education',
  'fitness-trainer': 'education', 'yoga-pilates-instructor': 'education',
  'life-coach': 'education', 'wellness-coach': 'education',
  // 'people' → public service.
  'firefighter': 'public_service', 'police-officer': 'public_service',
  'probation-officer': 'public_service', 'emergency-management-director': 'public_service',
  // 'online' → creative: design and media/marketing work (the rest of
  // 'online' defaults to tech below).
  'ux-ui-designer': 'creative', 'web-designer': 'creative', 'game-designer': 'creative',
  'motion-designer-3d-artist': 'creative', 'seo-specialist': 'creative',
  'ppc-paid-ads-specialist': 'creative', 'smm-manager': 'creative',
  'crm-email-marketer': 'creative', 'pr-specialist': 'creative',
  // 'online' → business: professions practised online, not tech work.
  'accountant': 'business', 'enrolled-agent-tax-pro': 'business',
  'bookkeeper-advisory': 'business', 'financial-analyst': 'business',
  'insurance-agent': 'business', 'mortgage-broker': 'business',
  'b2b-sales-rep': 'business', 'recruiter': 'business', 'hr-specialist': 'business',
  'project-manager': 'business', 'operations-manager': 'business',
  'e-commerce-manager': 'business', 'real-estate-agent': 'business',
  'luxury-real-estate-agent': 'business', 'business-consultant': 'business',
  'customer-success-manager': 'business', 'market-researcher': 'business',
  'virtual-assistant': 'business', 'actuary': 'business',
  // 'online' → health / education / trades, or no cluster at all.
  'medical-coder': 'health', 'health-informatics-specialist': 'health',
  'online-tutor': 'education', 'instructional-designer': 'education',
  'mechanical-engineer': 'trades', 'electrical-engineer': 'trades',
  'translator-interpreter': null, 'paralegal': null, 'grant-writer': null,
  // 'business' → health: a salaried role inside healthcare delivery
  // (owner/operator businesses keep the business field — their work is
  // running a company, whatever sector it sells into).
  'medical-health-services-manager': 'health',
  // 'creative' → hospitality / public service.
  'event-planner': 'food', 'wedding-planner': 'food',
  'urban-and-regional-planner': 'public_service',
};

const CATEGORY_FIELDS = {
  health: 'health', trades: 'trades', creative: 'creative', transport: 'transport',
  food: 'food', beauty: 'beauty', business: 'business', online: 'tech',
  // 'people' has NO default: its members join a field only via
  // FIELD_OVERRIDES above — the bucket genuinely mixes fields.
};

/** The direction-anchor field a profession belongs to, or null. */
export function professionField(prof) {
  if (!prof) return null;
  if (Object.prototype.hasOwnProperty.call(FIELD_OVERRIDES, prof.slug)) return FIELD_OVERRIDES[prof.slug];
  if (CREATOR_CLUSTER.has(prof.slug)) return 'creative';
  return CATEGORY_FIELDS[prof.category] ?? null;
}

// Plain phrases for why in-field candidates were ruled out — used when
// the direction anchor cannot fire because every door into the named
// field is blocked by the person's own lines.
const BLOCK_REASON_PHRASES = {
  base_verdict_no: 'carried a hard NO from the market base',
  training_red_line: 'needed training longer than the limit you set',
  public_voice_red_line: 'crossed your no-public-voice line',
  kids_red_line: 'crossed your no-children line',
  nights_red_line: 'crossed your no-nights line',
  relocation_red_line: 'crossed your no-relocation line',
  physical_limit_gate: 'collided with the physical limit you named',
  age_gate: 'sat behind a legal age limit',
  perceived_fit_veto: 'got your own "not mine"',
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
//   clears          — typical pay is at or above the floor.
//   top_tier_only   — typical pay is under the floor, but the top 25% clear
//                     it (only when a sourced top-quartile figure exists).
//   top_decile_only — typical pay is under the floor, but the sourced BLS
//                     top-10% threshold clears it (audit V12, 28.10.2026:
//                     the only upper-tail figures in the project are
//                     decile thresholds from three roadmap cards — they
//                     get their own status, never the quartile label).
//   below_floor     — typical pay is under the floor and no sourced figure
//                     shows the top earners clearing it.
//   null            — no floor stated, or no pay figure to compare.
// ---------------------------------------------------------------------------
function floorStatus(person, prof) {
  const floor = person ? person.income_floor_k : null;
  if (!isNum(floor) || !prof || !isNum(prof.payK)) return null;
  if (prof.payK >= floor) return 'clears';
  const tq = isNum(prof.pay_top_quartile_k) ? prof.pay_top_quartile_k : null;
  if (tq != null && tq >= floor) return 'top_tier_only';
  const dec = isNum(prof.pay_top_decile_k) ? prof.pay_top_decile_k : null;
  if (dec != null && dec >= floor) return 'top_decile_only';
  return 'below_floor';
}

/** Spread of a person's measured interests (max − min RIASEC letter,
 *  0..10 scale). The signal-quality gauge: a flat profile (every kind of
 *  day rated about the same) carries almost no information, and scoring
 *  must SAY so instead of printing confident numbers (founder QA,
 *  27.10.2026). Null when interests were never measured. */
export function riasecSpread(personRiasec) {
  if (!personRiasec) return null;
  const vals = RIASEC_KEYS.map((k) => personRiasec[k]).filter(isNum);
  if (vals.length < 4) return null;
  return Math.max(...vals) - Math.min(...vals);
}

// ---------------------------------------------------------------------------
// HARD EXCLUSIONS from the top-3 (founder QA, 27.10.2026). A red line is a
// line, not a suggestion: these filters run BEFORE ranking and a blocked
// candidate can never be proposed as a match. Blocked candidates may still
// appear in the bottom-3 (where being ruled out is the point) — except
// age-gated ones: proposing a legally closed door even as an anti-match
// would waste the person's attention.
// ---------------------------------------------------------------------------

// Professions whose working day is spent WITH children as the subjects.
// (Still a slug set: the base carries no children-contact field yet —
// out of the cause-B scope, which covered nights / public voice /
// relocation / voice load / age.)
export const KIDS_SLUGS = new Set([
  'preschool-teacher', 'aba-therapist-kids', 'nanny-family-assistant-pro',
  'child-life-specialist',
]);
// Cause B (28.10.2026): the public-voice and night slug sets that used
// to live here are RETIRED. Both facts are base fields now —
// prof.public_voice and prof.night_shifts, derived once in
// professions.mjs (O*NET Work Context rule + hand-reviewed editorial
// sets) — and prof.relocation_required joins them: the no_relocation
// red line collected since Day 1 finally has a field to check. A
// second, name-based copy of any of these facts must never grow back
// here or in the gate: one fact, one producer, fields only.

// "No multi-year degree" as a coded red line → a conservative training cap:
// certificate and associate routes (up to a year) stay legal; degree-length
// programmes do not. A structured max_training_months from Point A (when
// the person states one) always wins over this default.
const NO_DEGREE_TRAINING_CAP_MONTHS = 12;

export function trainingCapMonths(person) {
  if (isNum(person.max_training_months)) return person.max_training_months;
  if (Array.isArray(person.red_lines) && person.red_lines.includes('no_degree')) {
    return NO_DEGREE_TRAINING_CAP_MONTHS;
  }
  return null;
}

/** Why a profession must NOT be proposed in this person's top-3 — a short
 *  machine reason, or null when it may be proposed. Pure function of the
 *  person's stated lines and the profession's real fields. */
export function topBlockReason(person, prof) {
  const red = Array.isArray(person.red_lines) ? person.red_lines : [];
  const res = person.resources || {};
  const healthLimits = Array.isArray(res.health_limits) ? res.health_limits : [];
  // Hard rule (all doors): a base-verdict NO is an exit card, never a match.
  if (prof.verdict === 'NO') return 'base_verdict_no';
  const cap = trainingCapMonths(person);
  if (cap != null && isNum(prof.training_months) && prof.training_months > cap) return 'training_red_line';
  if (red.includes('no_public_voice') && prof.public_voice === true) return 'public_voice_red_line';
  if (red.includes('no_kids') && KIDS_SLUGS.has(prof.slug)) return 'kids_red_line';
  if (red.includes('no_nights') && prof.night_shifts === true) return 'nights_red_line';
  if (red.includes('no_relocation') && prof.relocation_required === true) return 'relocation_red_line';
  if (healthLimits.includes('physical') && prof.attrs && prof.attrs.hands === 2) return 'physical_limit_gate';
  if (prof.age_gate && isNum(person.age)) {
    if (isNum(prof.age_gate.max) && person.age > prof.age_gate.max) return 'age_gate';
    if (isNum(prof.age_gate.min) && person.age < prof.age_gate.min) return 'age_gate';
  }
  const perceived = person.perceived_fit ? person.perceived_fit[prof.slug] : undefined;
  if (perceived === 'not_mine') return 'perceived_fit_veto';
  return null;
}

// Plain-language lines for the derived AI-risk band (attrs.ai, 0..2) —
// used on the card whenever no sourced exposure text exists, so the AI
// line NEVER renders empty (founder QA, 27.10.2026). These describe OUR
// task-by-task band honestly; they do not pretend to be a BLS citation.
export const AI_BAND_LINES = {
  0: 'AI risk: low in our task-by-task check of this job — the core work is hands, presence and licence, the parts AI reaches last.',
  1: 'AI risk: medium in our task-by-task check of this job — AI is taking the routine parts; the human core of the work stays.',
  2: 'AI risk: high in our task-by-task check of this job — much of its routine work is exactly what AI is learning to do.',
};

const RIASEC_DAY_THEMES = {
  R: 'working with real things — building, fixing, using your hands',
  I: 'figuring out how things work — data, systems, causes',
  A: 'making original work in your own style',
  S: 'helping, teaching and caring for people',
  E: 'leading people and carrying the result',
  C: 'keeping records, schedules and details exact',
};

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

/** RIASEC profile congruence — the LOVE interest component (fix A,
 *  congruence attempt, 28.10.2026): Pearson correlation between the
 *  person's interest vector and the profession's, mapped r → (r+1)/2.
 *  Holland congruence is a SHAPE match (peaks and valleys); the L1 form
 *  above mostly measures level and compressed every candidate into a
 *  narrow high band, so people with different interests but similar
 *  values received the same ranking and a "fits everyone" measured
 *  profile always won. The mapped correlation is squared: only a real
 *  shape match scores high, a merely non-negative one does not.
 *  (Calibration record, 28.10.2026: squared measured dominance 13.5%
 *  on the preview gate and 19% on prod; sharpening further did NOT
 *  move the crown count down — cubed 7/31, 4th power 8/38, both
 *  Luxury Real Estate Agent — so squared is the calibration this
 *  attempt is recorded with.) A flat
 *  vector on either side carries no shape: congruence is then neutral
 *  0.5 — a flat profession profile wins nothing on interests, for
 *  anyone. (riasecCongruence above stays in service for POTENTIAL's
 *  interest_fit, unchanged.) */
export function riasecProfileCongruence(personRiasec, profRiasec) {
  if (!personRiasec || !profRiasec) return null;
  const xs = [];
  const ys = [];
  for (const k of RIASEC_KEYS) {
    if (isNum(personRiasec[k]) && isNum(profRiasec[k])) {
      xs.push(personRiasec[k] / 10);
      ys.push(profRiasec[k]);
    }
  }
  if (xs.length < 4) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 1e-9 || syy <= 1e-9) return 0.5;
  const cong = (sxy / Math.sqrt(sxx * syy) + 1) / 2; return clamp01(cong * cong);
}

// ---------------------------------------------------------------------------
// Fix A (28.10.2026): stub profiles must not out-score measured ones.
// A stub's vectors are Day-1 derivations from a handful of attrs, and
// the formulas are generous (achievement 1, independence 1…): under
// deficit-only LOVE a stub fits almost everyone. While a profile is a
// stub (supplies_stub || riasec_stub — the regression gate's own
// definition), its supplies are scored as NEUTRAL 0.5 — in the
// needs–supplies fit AND in the SDT affordances (both are supplies of
// the same guessed profile; valueFits below reads through the same
// helpers, so the report's words stay in sync with the score) — and
// scoreCandidate subtracts a flat confidence penalty from both mids.
// Nothing is ever excluded: a stub still fills a slot when no measured
// candidate clears, so the fallback is structural, not a filter rule.
// ---------------------------------------------------------------------------
export const STUB_CONFIDENCE_PENALTY = 0.08;
const WEAK_SUPPLY_PENALTY = 0.2;
const isStubProfile = (prof) => !!(prof && (prof.supplies_stub || prof.riasec_stub));
const effSupply = (prof, key) => (isStubProfile(prof) ? 0.5 : (prof.supplies ? prof.supplies[key] : undefined));
const effSdt = (prof, key) => (isStubProfile(prof) ? 0.5 : (prof.sdt ? prof.sdt[key] : undefined));

// ---------------------------------------------------------------------------
// LOVE — needs–supplies .30 · SDT .35 · RIASEC .35. Values and SDT keep
// deficit-only mechanics; the RIASEC component is profile congruence
// (shape), not a deficit — interests are the layer that differentiates
// people, and at .25 in L1 form it could not (fix A, 28.10.2026).
// ---------------------------------------------------------------------------
export function loveParts(person, prof) {
  const parts = { needs_supplies: null, sdt: null, riasec: null };

  // needs–supplies: need_i = (7 − rank_i)/6 from the forced 1..6 ranking.
  // Needs are clamped into 0..1 before the deficit math (audit V5): an
  // out-of-range rank or need must degrade gracefully, never produce a
  // negative LOVE component.
  if (person.values_rank && prof.supplies) {
    const fits = [];
    let weakTopNeeds = 0;
    for (const key of VALUE_KEYS) {
      const rank = person.values_rank[key];
      const supply = effSupply(prof, key);
      if (isNum(rank) && isNum(supply)) {
        fits.push(deficitFit(clamp01((7 - rank) / 6), supply));
        // Weak-spot penalty (fix A): a MEASURED profile whose supply is
        // at or below neutral (≤ 0.5) on one of the person's top-3 needs
        // is weak exactly where it matters most. Deficit-only math alone
        // let a flat, no-weakness profile (supplies 0.44–0.72 across the
        // board, e.g. Commercial Insurance Producer) fit nearly every
        // ranking and dominate the output. Stubs are exempt here: their
        // supplies are already neutralised above, and a guessed vector
        // is not punished twice for guesses it never made.
        if (!isStubProfile(prof) && rank <= 3 && supply <= 0.5) weakTopNeeds += 1;
      }
    }
    if (fits.length > 0) {
      let ns = fits.reduce((a, b) => a + b, 0) / fits.length;
      if (weakTopNeeds > 0) ns = clamp01(ns - WEAK_SUPPLY_PENALTY * weakTopNeeds);
      parts.needs_supplies = ns;
    }
  }

  // SDT affordances: autonomy + relatedness (competence lives on the
  // POTENTIAL narrative side, per the merged science map §2).
  if (isNum(person.autonomy_need) && isNum(person.relatedness_need) && prof.sdt) {
    const fits = [];
    const sdtAut = effSdt(prof, 'autonomy');
    const sdtRel = effSdt(prof, 'relatedness');
    if (isNum(sdtAut)) fits.push(deficitFit(clamp01(person.autonomy_need / 2), sdtAut));
    if (isNum(sdtRel)) fits.push(deficitFit(clamp01(person.relatedness_need / 2), sdtRel));
    if (fits.length > 0) parts.sdt = fits.reduce((a, b) => a + b, 0) / fits.length;
  }

  // RIASEC component of LOVE = profile congruence. A stub's RIASEC is a
  // formula, not a measurement: scored neutral 0.5, exactly like its
  // supplies — a guessed vector must not differentiate people.
  if (person.riasec && prof.riasec) {
    parts.riasec = isStubProfile(prof) ? 0.5 : riasecProfileCongruence(person.riasec, prof.riasec);
  }
  return parts;
}

// ---------------------------------------------------------------------------
// POTENTIAL /start — interest fit .30 · trial .30 · feasibility .40
// ---------------------------------------------------------------------------

/** Feasibility of the entry path vs the person's stage-0 resources.
 *  Sub-scores (each 0..1, missing ones skipped and renormalised):
 *   - entry_time_ok: runway vs training length. runway_months = the
 *     savings cushion in months, NOTHING else (audit V9, 27.10.2026:
 *     the Day-1 formula added 2·hours_per_day to the cushion, so a
 *     person with a 0-month cushion and 2 daily hours was told their
 *     money would last 4 months — hours are time, not money).
 *     entry_time_ok = clamp01(cushion / eff_months); null if the
 *     profession's training length is unknown.
 *   - budget_ok: entry cost STUB cost_k = eff_months × 0.4 ($K per
 *     training month, editorial stub, flagged 'entry_cost_stub');
 *     budget_ok = clamp01(budget_k / cost_k).
 *   - eff_months = max(training_months, ENTRY_MONTHS_FLOOR) in BOTH
 *     denominators (fix A saturation, 28.10.2026): without the floor a
 *     1-month certificate saturates feasibility (entry_time_ok ≈ 1 and
 *     budget_ok ≈ 1) and beats real 6–24-month paths on feasibility
 *     alone — the mechanism that let Commercial Insurance Producer
 *     (training 1 month) dominate the output. The DISPLAYED training
 *     length is untouched; only the feasibility denominators change.
 *   - documents_factor: yes → 1, partial → 0.6, no → 0.25. (The hard
 *     documents GATE is separate: no-documents + hard-license = D.) */
const ENTRY_MONTHS_FLOOR = 12;

function feasibilityStart(person, prof) {
  const res = person.resources || {};
  const subs = { entry_time_ok: null, budget_ok: null, documents_factor: null };

  if (isNum(prof.training_months) && prof.training_months > 0) {
    const cushion = isNum(res.cushion_months) ? res.cushion_months : 0;
    const effMonths = Math.max(prof.training_months, ENTRY_MONTHS_FLOOR);
    subs.entry_time_ok = clamp01(cushion / effMonths);
    const costK = effMonths * 0.4;
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
const NAME_SYNONYMS = { support: 'service', services: 'service', representative: 'rep', representatives: 'rep', tech: 'technician', trucking: 'truck' };
const NAME_STOPWORDS = new Set(['team', 'lead', 'senior', 'sr', 'junior', 'jr', 'chief', 'head', 'of', 'the', 'and', 'i', 'ii', 'iii', 'iv']);

function nameTokens(s) {
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return norm(s)
    .split(' ')
    .filter(Boolean)
    .map((w) => NAME_SYNONYMS[w] || w)
    .filter((w) => !NAME_STOPWORDS.has(w))
    .map((w) => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
}

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
  if (containment[0]) return containment[0];
  // Token fallback (founder QA, 27.10.2026): real job titles carry seniority
  // words and synonyms the base does not ("Customer support team lead",
  // "Truck Dispatcher"). Match on shared CONTENT tokens: seniority words
  // dropped, support→service, rep→representative, trucking→truck.
  const tt = nameTokens(name);
  if (tt.length === 0) return null;
  let best = null;
  let bestShared = 0;
  let bestDiff = Infinity;
  for (const p of professions) {
    const pt = nameTokens(p.name);
    const shared = tt.filter((w) => pt.includes(w)).length;
    const need = Math.max(2, Math.ceil(0.6 * Math.min(tt.length, pt.length)));
    if (shared < need) continue;
    const diff = Math.abs(pt.length - tt.length);
    if (shared > bestShared || (shared === bestShared && diff < bestDiff)) {
      best = p;
      bestShared = shared;
      bestDiff = diff;
    }
  }
  return best;
}

function potentialPivot(person, prof, professions, flags) {
  const current = findProfessionByName(person.current_profession_name, professions);
  if (!current) {
    // No current vector in the base → /start profile, honestly flagged.
    flags.push('current_profession_not_in_base');
    const start = potentialStart(person, prof);
    return { ...start, profile: 'start_fallback_for_pivot' };
  }
  // Hands-capital credit (ex-mechanic fix, 28.10.2026): the transfer
  // formula reads the person's capital from their CURRENT job title
  // alone. A dispatcher who spent years turning wrenches scores
  // hands = 0, so every hands-on target ate the full shortage charge
  // on that axis (−0.55·shortage − 0.25·feasibilityPenalty ≈ −0.12
  // POTENTIAL) and landed in category C however high its LOVE was —
  // measured trades lost to desk profiles for every hands-on person
  // whose current title is a desk (gate persona "Ex-mechanic" failed
  // on every run: Electrician LOVE .91 sat at rank 43, category C).
  // The person's measured RIASEC R is their hands history in coded
  // form (the 12 "in this job you would…" items): a maxed R means the
  // hands are not a gap to close, they are capital already held.
  // Credit it on the hands axis only, in attr units — ⌊R/5⌋ capped
  // at 2 (R ≥ 10 → 2, R ≥ 5 → 1, below → 0). Every other axis keeps
  // reading the current job exactly as before, and the credit can
  // only raise the effective current-hands, never lower it.
  const handsCredit = person.riasec && isNum(person.riasec.R)
    ? Math.min(2, Math.floor(person.riasec.R / 5))
    : 0;
  const transferVals = [];
  const shortageVals = [];
  for (const attr of TRANSFER_ATTRS) {
    let cur = current.attrs ? current.attrs[attr] : null;
    if (attr === 'hands' && isNum(cur) && handsCredit > cur) cur = handsCredit;
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
      const supply = effSupply(prof, key);
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

  // ---- WHY YOU — this person's own answers, tied to THIS profession's
  // own signals, so two different professions never carry the same
  // green-flag text (founder QA, 27.10.2026: the line was identical
  // boilerplate on all three cards). Most specific signals first.
  const perceivedFitArg = person.perceived_fit ? person.perceived_fit[prof.slug] : undefined;
  if (perceivedFitArg === 'mine') {
    why.push('You pictured one real Tuesday in this job and called it "mine" — your own gut vote counts here.');
  }
  let themeFired = false;
  if (person.riasec && prof.riasec) {
    let bestL = null;
    let bestV = 0;
    for (const k of RIASEC_KEYS) {
      if (isNum(person.riasec[k]) && isNum(prof.riasec[k])) {
        const v = Math.min(person.riasec[k] / 10, prof.riasec[k]);
        if (v > bestV) { bestV = v; bestL = k; }
      }
    }
    if (bestL && bestV >= 0.6) {
      why.push(`Your strongest pull in the day-in-the-job questions was ${RIASEC_DAY_THEMES[bestL]} — and an ordinary day in this job is mostly exactly that.`);
      themeFired = true;
    }
  }
  const tol = person.tolerances || {};
  if (tol.people_pref === 2 && prof.attrs && prof.attrs.people === 2) {
    why.push('You said people are the whole point — here the day is people, face to face, not a screen.');
  }
  if (tol.hands_pref === 2 && prof.attrs && prof.attrs.hands === 2) {
    why.push('You said a screen-only day drains you — this work puts real things in your hands.');
  }
  if (tol.remote_pref === 2 && prof.attrs && prof.attrs.remote === 2) {
    why.push('You want remote with your own hours — this job is done from a laptop, from anywhere.');
  }
  if (Array.isArray(person.languages) && person.languages.includes('es') && prof.attrs && (prof.attrs.people >= 2 || prof.attrs.care >= 2)) {
    why.push('Your Spanish is a working asset here: patients and clients who need help in Spanish are underserved, and employers know it.');
  }
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
  if (!themeFired && love.parts && isNum(love.parts.riasec) && love.parts.riasec >= 0.75) {
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
      why.push(`The entry is realistic on your numbers: about ${fmtMonths(prof.training_months)} of training, and your cushion plus budget cover it.`);
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
  else if (prof.attrs && isNum(prof.attrs.ai) && AI_BAND_LINES[prof.attrs.ai]) math.push(AI_BAND_LINES[prof.attrs.ai]);
  else math.push('AI risk: no checked data for this job yet — we will not invent a number.');
  const tq = isNum(prof.pay_top_quartile_k) ? prof.pay_top_quartile_k : null;
  const dec = isNum(prof.pay_top_decile_k) ? prof.pay_top_decile_k : null;
  if (floor != null && isNum(prof.payK)) {
    if (fs === 'clears') math.push(`Your minimum is $${floor}K — typical pay clears it.`);
    else if (fs === 'top_tier_only') math.push(`Typical pay ($${prof.payK}K) is under your $${floor}K minimum. The top 25% earn about $${tq}K — this only works if you reach that tier.`);
    else if (fs === 'top_decile_only') math.push(`Typical pay ($${prof.payK}K) is under your $${floor}K minimum. Only the top 10% of earners clear it — they earn over $${dec}K — so this only works if you land in that top tenth.`);
    else if (fs === 'below_floor') {
      if (tq != null) math.push(`Typical pay ($${prof.payK}K) is under your $${floor}K minimum — and even the top 25% (about $${tq}K) stay under it.`);
      else if (dec != null) math.push(`Typical pay ($${prof.payK}K) is under your $${floor}K minimum — and even the line where the top 10% of earners starts ($${dec}K) sits under it. Fewer than 1 in 10 in this job clear your minimum.`);
      else math.push(`Typical pay ($${prof.payK}K) is under your $${floor}K minimum, and we have no checked top-earner pay for this job — there is no honest pay ladder to point at.`);
    }
  }
  if (isNum(prof.training_months)) math.push(`Time to get in: about ${fmtMonths(prof.training_months)} of training.`);

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
      if (isNum(res.cushion_months)) {
        but.push(`Training takes about ${fmtMonths(prof.training_months)}, and your cushion is ${fmtMonths(res.cushion_months)} — the money side of the bridge is tight.`);
      } else {
        but.push(`Training takes about ${fmtMonths(prof.training_months)} before it pays, and you have not named a savings cushion that covers it — the money side of the bridge is the risk.`);
      }
    } else if (isNum(s.budget_ok) && s.budget_ok <= 0.5) {
      // The warning must respect the backing the person actually named
      // (audit V11): solid named support funds the stretch — warning
      // about it anyway contradicts their own answers.
      const moneySupport = person.supports && isNum(person.supports.money) ? person.supports.money : null;
      if (moneySupport === 2) {
        // Solid backing named: no budget warning.
      } else if (moneySupport === 1) {
        but.push('The entry costs run ahead of the budget you named — you named some backing, so line that funding up before you start, not during.');
      } else {
        but.push('The entry costs run ahead of the budget you named — the first stretch has to be funded some other way.');
      }
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
    let line = `Training runs about ${fmtMonths(prof.training_months)}`;
    // "At your 0 hours a day" is nonsense text (audit V10): the pace
    // clause exists only when the person actually named study hours.
    if (isNum(res.hours_per_day) && res.hours_per_day > 0) line += `; at your ${res.hours_per_day} hours a day, that is the pace the 90-day plan is built on`;
    bridge.push(line + '.');
    if (isNum(res.cushion_months) && res.cushion_months < prof.training_months) {
      bridge.push(`Your cushion (${fmtMonths(res.cushion_months)}) is shorter than the training — keep some income running next to it.`);
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
    lines.push(`Getting in takes about ${fmtMonths(prof.training_months)} of training before it pays anything — your cushion is ${fmtMonths(res.cushion_months)}, so the money runs out first.`);
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
  const loveMid = weightedMean(lParts, { needs_supplies: 0.3, sdt: 0.35, riasec: 0.35 });
  const love = band(loveMid, countNullParts(lParts), person.age);
  love.parts = lParts;

  // Perceived fit 'mine' (stage 6): a bounded LOVE nudge, applied BEFORE
  // the category is read, so a profession the person called "mine"
  // outranks an unmarked equal (founder QA, 27.10.2026 — amends the
  // Day-1 veto-only rule; 'not mine' still only ever hurts: it removes
  // the candidate from the top-3 entirely, see topBlockReason).
  const perceivedFitNow = person.perceived_fit ? person.perceived_fit[prof.slug] : undefined;
  if (perceivedFitNow === 'mine' && isNum(love.mid)) {
    const reb = band(clamp01(love.mid + 0.05), countNullParts(lParts), person.age);
    love.mid = reb.mid;
    love.lo = reb.lo;
    love.hi = reb.hi;
    flags.push('perceived_fit_mine');
  }

  // ---- POTENTIAL (profile by door)
  const pot = person.door === 'pivot' || person.door === 'bridge'
    ? potentialPivot(person, prof, professions, flags)
    : potentialStart(person, prof);
  const potential = band(pot.mid, countNullParts(pot.parts), person.age);
  potential.parts = pot.parts;
  potential.profile = pot.profile;
  if (pot.feasibility_subs) potential.feasibility_subs = pot.feasibility_subs;
  if (pot.current_profession_slug) potential.current_profession_slug = pot.current_profession_slug;

  // Fix A stub penalty (28.10.2026): a guessed profile carries a flat
  // confidence penalty on BOTH mids — re-ranking only, applied before
  // the category is read (see the note above loveParts). The band is
  // recomputed from the penalised mid, same pattern as the 'mine'
  // nudge, so lo/hi stay consistent with the mid.
  if (isStubProfile(prof)) {
    if (isNum(love.mid)) {
      const reb = band(clamp01(love.mid - STUB_CONFIDENCE_PENALTY), countNullParts(lParts), person.age);
      love.mid = reb.mid;
      love.lo = reb.lo;
      love.hi = reb.hi;
    }
    if (isNum(potential.mid)) {
      const reb = band(clamp01(potential.mid - STUB_CONFIDENCE_PENALTY), countNullParts(pot.parts), person.age);
      potential.mid = reb.mid;
      potential.lo = reb.lo;
      potential.hi = reb.hi;
    }
    flags.push('stub_profile_penalty');
  }

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

  // Base-verdict NO: no longer a mere category cap. A NO is a hard
  // exclusion from the top-3 on EVERY door (founder QA, 27.10.2026);
  // the flag stays for the card/letter surfaces, the exclusion itself
  // lives in topBlockReason and is applied at selection time.
  if (prof.verdict === 'NO') flags.push('base_verdict_no');

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
    kind: prof.kind === 'side_hustle' ? 'side_hustle' : 'career',
    category,
    family: professionFamily(prof),
    verdict: prof.verdict ?? null,
    payK: isNum(prof.payK) ? prof.payK : null,
    pay_top_quartile_k: isNum(prof.pay_top_quartile_k) ? prof.pay_top_quartile_k : null,
    pay_top_decile_k: isNum(prof.pay_top_decile_k) ? prof.pay_top_decile_k : null,
    training_months: isNum(prof.training_months) ? prof.training_months : null,
    outlook: prof.bls_outlook ?? null,
    ai_exposure: prof.bls_ai_exposure ?? null,
    ai_exposure_tier: prof.bls_ai_exposure_tier ?? null,
    ai_exposure_source: prof.bls_ai_exposure_source ?? null,
    ai_risk_band: prof.attrs && isNum(prof.attrs.ai)
      ? (prof.attrs.ai === 0 ? 'low' : prof.attrs.ai === 1 ? 'medium' : 'high')
      : null,
    ai_risk_source: prof.bls_ai_exposure ? 'sourced' : (prof.attrs && isNum(prof.attrs.ai) ? 'base_band' : null),
    top_block: topBlockReason(person, prof),
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

// SIDE-HUSTLE IDEA (founder's rule, 28.10.2026): the pick lives in
// ./side-hustle.mjs (this file is at the deploy size cap) —
// pickSideHustle() below the cushion block in scorePerson.

// ---------------------------------------------------------------------------
// scorePerson(person, professions) →
//   { mode, mode_reason, top3, bottom3, bridge_pick, side_hustle_pick,
//     results_count, exploration_plan }
// bridge_pick is the slow-money cushion (see the block above the return);
// null unless the founder's 27.10.2026 rule fires and a candidate clears.
// No `match` / `percent` field exists anywhere in this output — by design.
// ---------------------------------------------------------------------------
export function scorePerson(person, professions) {
  const list = Array.isArray(professions) ? professions : [];
  const results = list.map((prof) => scoreCandidate(person, prof, list));
  const profBySlug = new Map(list.map((p) => [p.slug, p]));

  // ---- Stub-profile cap (audit L2/L3, 27.10.2026). A profession whose
  // vectors are still Day-1 stub derivations (no O*NET-sourced profile:
  // its supplies/RIASEC are formulas over a handful of tuple attrs, and
  // the formulas are generous — maxed supplies are common) measured
  // 31% of top-3 slots on 18% of the base in the persona panel, with
  // 'Top fit' grades printed on derived numbers. The cap is the
  // report's remedy, honestly framed: a stub profile can be a GOOD fit
  // (B), never a TOP fit (A) — A is reserved for professions measured
  // on sourced data. Selection order does the rest. The cap applies
  // only when the sourced import is actually present in this list;
  // with no sourced data at all there is nothing to reserve A for.
  const anySourced = list.some((p) => Array.isArray(p.data_flags) && p.data_flags.includes('onet_sourced'));
  if (anySourced) {
    for (const r of results) {
      const prof = profBySlug.get(r.slug);
      if (prof && !(prof.data_flags || []).includes('onet_sourced') && r.category === 'A') {
        r.category = 'B';
        r.flags.push('stub_profile_cap');
      }
    }
  }

  // ---- Signal quality (founder QA, 27.10.2026). A flat interest profile
  // is near-zero information: confidence drops a step for everyone, and a
  // fully flat profile with no trials cannot produce a verdict at all.
  const spread = riasecSpread(person.riasec);
  if (spread != null && spread < 2) {
    for (const r of results) {
      if (r.confidence === 'high') r.confidence = 'medium';
      else if (r.confidence === 'medium') r.confidence = 'low';
    }
  }

  // Only candidates that may honestly be PROPOSED: not factually gated
  // (D), not hard-blocked by the person's own lines (top_block), and a
  // CAREER (founder's rule, 28.10.2026): a side hustle is not a job you
  // can be matched into — it never enters the match pools at all. The
  // selection pool, the direction anchor, the bridge anchor and the
  // cushion all draw from `sortable`/`selectionPool`, so this one
  // filter keeps side hustles out of every match surface; they are
  // offered separately, once, as side_hustle_pick below.
  const sortable = results
    .filter((r) => r.category !== 'D' && !r.top_block && (profBySlug.get(r.slug) || {}).kind !== 'side_hustle')
    .sort((a, b) => {
      const rankDiff = CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category];
      if (rankDiff !== 0) return rankDiff;
      // Doors with a current profession (/pivot, /bridge): what the person
      // already does counts — candidates their work transfers INTO
      // outrank equal strangers (founder QA, 27.10.2026: the bridge door
      // proposed zero credential-adjacent roles).
      const tcA = a.potential.parts ? a.potential.parts.transfer_capital : null;
      const tcB = b.potential.parts ? b.potential.parts.transfer_capital : null;
      if (isNum(tcA) && isNum(tcB)) {
        const gA = tcA >= 0.45 ? 1 : 0;
        const gB = tcB >= 0.45 ? 1 : 0;
        if (gA !== gB) return gB - gA;
      }
      const sumA = (a.love.mid ?? 0) + (a.potential.mid ?? 0);
      const sumB = (b.love.mid ?? 0) + (b.potential.mid ?? 0);
      if (sumB !== sumA) return sumB - sumA;
      return a.slug < b.slug ? -1 : 1; // deterministic tie-break
    });

  // ---- Stage-6 freeze (audit L9, 27.10.2026): when this scoring run
  // IS the perceived-fit re-score, the candidate set is FROZEN to the
  // professions the person was actually shown and rated at stage 6
  // (person.frozen_candidates, set by interview.applyPerceivedFit).
  // Before this rule, a veto re-ranked the whole base and the final
  // three could contain professions the person never saw (44% of
  // audited sessions). Under the freeze, vetoes simply remove; the
  // final list is a subset of the rated set and may honestly be
  // shorter than three. Selection (passes, anchors, the cushion pool)
  // draws from selectionPool; measurement (results, bottom-3) stays
  // global — the anti-matches are built from the full base by design.
  const frozenSet = Array.isArray(person.frozen_candidates) && person.frozen_candidates.length
    ? new Set(person.frozen_candidates.filter((s) => typeof s === 'string'))
    : null;
  const selectionPool = frozenSet ? sortable.filter((r) => frozenSet.has(r.slug)) : sortable;

  // ---- Top-3 selection: diversity + income floor, scores never inflated.
  // Pass 1: best-ranked candidates whose family is not yet represented AND
  //         whose typical pay does not fail the person's floor.
  // Pass 2: best-ranked remaining candidates from families still not
  //         represented (a below-floor pick may enter here — its card then
  //         carries the pay warning, never silence).
  // Pass 3 (audit L4): the clearly-best exception — see below the passes.
  // If fewer than 3 families clear the bar, the list is honestly
  // shorter than 3.
  const top3 = [];
  const usedFamilies = new Set();
  // Bridge door anchor: the person's OWN profession, when the base has it
  // and nothing rules it out, is the bridge itself — it takes the first
  // slot and the ranked passes fill around it.
  let bridgeAnchorSlug = null;
  if (person.door === 'bridge') {
    const currentProf = findProfessionByName(person.current_profession_name, list);
    if (currentProf) {
      const self = selectionPool.find((r) => r.slug === currentProf.slug);
      if (self) {
        top3.push(self);
        usedFamilies.add(self.family);
        bridgeAnchorSlug = self.slug;
      }
    }
  }
  for (const pass of [1, 2]) {
    for (const r of selectionPool) {
      if (top3.length >= 3) break;
      if (top3.includes(r) || usedFamilies.has(r.family)) continue;
      if (pass === 1 && r.floor_status === 'below_floor') continue;
      top3.push(r);
      usedFamilies.add(r.family);
    }
  }
  // ---- Direction anchor (founder decision, 27.10.2026): a field the
  // person NAMED as their direction (stage 2, person.target_fields)
  // holds ONE seat in the three. Before this rule, a person who said
  // "back into medicine" was handed three office jobs because the
  // transfer formula only measures distance from the current desk —
  // the stated direction was never a scoring input. The anchor mirrors
  // the bridge anchor: it guarantees PRESENCE, never a promotion. The
  // anchored candidate is the best-ranked in-field candidate that
  // already passed every hard gate (it comes out of `sortable`, so red
  // lines, the training cap, age gates, base-verdict NO and vetoes have
  // all run), and it keeps its true category, fit label, honest BUT and
  // real numbers. Rank order inside the three stays the engine's own
  // (the bridge anchor, when present, keeps slot 1 as before). If no
  // in-field candidate passes the gates, nothing is forced: the result
  // records what blocked the field, and the set reason says so plainly.
  let direction = null;
  {
    const targetFields = (Array.isArray(person.target_fields) ? person.target_fields : [])
      .filter((f) => TARGET_FIELDS.includes(f));
    if (targetFields.length) {
      const fieldOf = (r) => {
        const p = profBySlug.get(r.slug);
        return p ? professionField(p) : null;
      };
      const inField = (r) => targetFields.includes(fieldOf(r));
      direction = { fields: targetFields, anchored_slug: null, blocked_reasons: {} };
      if (!top3.some(inField)) {
        const cand = selectionPool.find((r) => !top3.includes(r) && inField(r));
        if (cand) {
          if (top3.length >= 3) {
            // Displacement: the weakest displaceable pick goes — a
            // same-family one first, so the three stay three different
            // worlds. The bridge anchor is never displaced.
            const byWeakness = top3
              .filter((r) => r.slug !== bridgeAnchorSlug)
              .sort((a, b) => sortable.indexOf(b) - sortable.indexOf(a));
            const victim = byWeakness.find((r) => r.family === cand.family) || byWeakness[0];
            if (victim) {
              top3.splice(top3.indexOf(victim), 1);
              usedFamilies.delete(victim.family);
            }
          }
          top3.push(cand);
          usedFamilies.add(cand.family);
          top3.sort((a, b) => {
            if (a.slug === bridgeAnchorSlug) return -1;
            if (b.slug === bridgeAnchorSlug) return 1;
            return sortable.indexOf(a) - sortable.indexOf(b);
          });
          cand.flags.push('direction_anchor');
          const labels = targetFields.map((f) => DIRECTION_FIELD_LABELS[f]).join(' / ');
          cand.argument.why_you.unshift(`You named ${labels} as the field you are aiming at — this is the strongest door into it that your own lines allow, so it holds a seat in your three even where other jobs scored closer to the work you do now.`);
          direction.anchored_slug = cand.slug;
        } else {
          for (const r of results) {
            if (!inField(r) || !r.top_block) continue;
            // Side hustles are not doors into a field — they are not
            // careers, so their blocks never pad the field's count.
            if ((profBySlug.get(r.slug) || {}).kind === 'side_hustle') continue;
            direction.blocked_reasons[r.top_block] = (direction.blocked_reasons[r.top_block] || 0) + 1;
          }
        }
      }
    }
  }

  // ---- Pass 3 — the clearly-best exception to the family cap
  // (audit L4, 27.10.2026). The Day-1 rule "at most one profession per
  // family, always" discarded clearly-best same-family candidates: a
  // person aiming at medicine could never receive two medical roles,
  // however far ahead they scored. The exception is narrow and fully
  // deterministic: when the three are full, the best EXCLUDED candidate
  // whose family is already seated may displace the weakest
  // displaceable pick — never the bridge anchor, never the direction
  // anchor — only when its LOVE+POTENTIAL sum beats BOTH the victim's
  // sum AND the best still-available other-family candidate's sum by
  // at least FAMILY_DUPLICATE_MARGIN, and it does not fail the income
  // floor where the victim clears it. At most one such swap: a family
  // may hold two seats, never three. Scores are never changed — this
  // is selection, like every pass above. Skipped under the stage-6
  // freeze (the rated set is closed by definition).
  const FAMILY_DUPLICATE_MARGIN = 0.08;
  if (!frozenSet && top3.length === 3) {
    const sumOf = (r) => (r.love.mid ?? 0) + (r.potential.mid ?? 0);
    const seatedFamilies = new Set(top3.map((r) => r.family));
    const dupCand = selectionPool.find((r) => !top3.includes(r) && seatedFamilies.has(r.family));
    if (dupCand) {
      const protectedSlugs = new Set([bridgeAnchorSlug, direction && direction.anchored_slug].filter(Boolean));
      const victim = top3
        .filter((r) => !protectedSlugs.has(r.slug))
        .sort((a, b) => sortable.indexOf(b) - sortable.indexOf(a))[0];
      const bestOtherFamily = selectionPool.find(
        (r) => !top3.includes(r) && r !== dupCand && !seatedFamilies.has(r.family),
      );
      const bar = Math.max(victim ? sumOf(victim) : 0, bestOtherFamily ? sumOf(bestOtherFamily) : 0);
      if (
        victim &&
        sumOf(dupCand) - bar >= FAMILY_DUPLICATE_MARGIN &&
        !(dupCand.floor_status === 'below_floor' && victim.floor_status !== 'below_floor')
      ) {
        top3.splice(top3.indexOf(victim), 1);
        top3.push(dupCand);
        top3.sort((a, b) => {
          if (a.slug === bridgeAnchorSlug) return -1;
          if (b.slug === bridgeAnchorSlug) return 1;
          return sortable.indexOf(a) - sortable.indexOf(b);
        });
      }
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
      .filter((r) => r.category !== 'D' && r.top_block !== 'age_gate' && !topSlugs.has(r.slug) && isNum(r.love.mid) && lovePartsCount(r) >= 2 && (profBySlug.get(r.slug) || {}).kind !== 'side_hustle')
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
  // "Thin" describes the person's ANSWERS (missing fields, flat
  // interests) — never the engine's own confidence bookkeeping.
  const thinSignal =
    (isNum(person.completeness) && person.completeness < 0.8) ||
    (spread != null && spread < 2.5);
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
  } else if (spread != null && spread < 1 && trialsEmpty) {
    // The all-"idk" profile: interests measured but flat — every kind of
    // day rated about the same. There is no signal to rank on, so the
    // honest output is the exploration mode, never a confident top-3.
    mode = 'insufficient_data';
    modeReason = 'Your interest answers came out flat — every kind of working day rated about the same — so there is no real signal to score yet. That is a starting point, not a verdict: the plan below builds the signal.';
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
      modeReason = thinSignal
        ? 'Some answers are still thin, so the scores are ranges, not single numbers — the direction is still clear.'
        : 'The honest answer comes as ranges: your top fits are good, not runaway — each card says exactly where it is strong and where it is not.';
    }
  }
  // Empty final set (audit follow-up, 28.10.2026): every finalist was
  // crossed out — by the stage-6 "not mine" vetoes, or by hard lines
  // the person set — and top3 is honestly empty. The mode reason must
  // say THAT, never the "your top fits are good" line above: there are
  // no fits left to be good.
  if (mode !== 'insufficient_data' && top3.length === 0) {
    modeReason = 'You crossed out every finalist yourself — each one got your "not mine" at the first-date check, or a hard line you set shut its door. No match is left standing, and the matchmaker will not dress that up as one.';
  }

  // ---- "Why these three", in plain words, from the actual picks.
  // The "answers were thin" sentence appears ONLY when the signal was
  // actually measured thin (founder QA, 27.10.2026: it showed always).
  const blockedCount = results.filter((r) => r.top_block && r.top_block !== 'age_gate').length;
  let setReason = null;
  if (mode !== 'insufficient_data') {
    const parts = [];
    if (mode === 'bands' && thinSignal) parts.push('Some answers were thin, so your scores are ranges, not single numbers — the direction is still clear.');
    if (top3.length >= 2) {
      const labels = [...new Set(top3.map((r) => FAMILY_LABELS[r.family] || r.family))];
      if (labels.length === top3.length) {
        parts.push(`These picks are deliberately from different worlds — ${labels.join(', ')} — not three versions of the same job.`);
      } else {
        // A family holds two seats (the clearly-best exception): say so
        // plainly instead of claiming three different worlds.
        const counts = {};
        for (const r of top3) counts[r.family] = (counts[r.family] || 0) + 1;
        const dupFamily = Object.keys(counts).find((f) => counts[f] > 1);
        const dupLabel = FAMILY_LABELS[dupFamily] || dupFamily;
        parts.push(`Two of these picks come from the same world — ${dupLabel} — because on your answers both clearly beat every candidate from the other worlds. A same-world copy that merely tied would not have made it.`);
      }
    }
    if (isNum(person.income_floor_k) && top3.length > 0) {
      const clearCount = top3.filter((r) => r.floor_status === 'clears').length;
      if (clearCount === top3.length) parts.push(`Every one of them clears your $${person.income_floor_k}K minimum on typical pay.`);
      else if (clearCount > 0) parts.push(`${clearCount} of the ${top3.length} clear your $${person.income_floor_k}K minimum on typical pay. The rest are marked on their cards — nothing is hidden.`);
      else parts.push(`None of the strong fits clears your $${person.income_floor_k}K minimum on typical pay — each card says exactly where it lands instead of hiding it.`);
    }
    if (top3.length > 0 && top3.length < 3) parts.push(`Only ${top3.length} job${top3.length === 1 ? '' : 's'} cleared the bar honestly — the list is not padded with copies.`);
    if (blockedCount > 0) parts.push('Some jobs that fit parts of your answers were not proposed at all: they cross a line you set — a red line, a hard NO from our base, or your own "not mine". The matchmaker does not propose what is ruled out.');
    if (direction && direction.anchored_slug) {
      const labels = direction.fields.map((f) => DIRECTION_FIELD_LABELS[f]).join(' / ');
      parts.push(`You named ${labels} as your direction — one of these three is the strongest legal door into it, kept on your list on purpose, at its honest grade.`);
    } else if (direction && Object.keys(direction.blocked_reasons).length > 0) {
      const labels = direction.fields.map((f) => DIRECTION_FIELD_LABELS[f]).join(' / ');
      const reasonText = Object.entries(direction.blocked_reasons)
        .sort((a, b) => b[1] - a[1])
        .map(([reason, n]) => `${n} ${BLOCK_REASON_PHRASES[reason] || 'were ruled out by a line you set'}`)
        .join('; ');
      parts.push(`You named ${labels} as your direction, so every door into it was checked: ${reasonText}. None of them can be proposed honestly under the lines you set — loosen one line and the field comes back.`);
    }
    if (top3.length > 0) parts.push('Next step: pick the one you would try first — the 90-day plan starts there.');
    if (parts.length) setReason = parts.join(' ');
    if (top3.length === 0) {
      // Empty final set (audit follow-up, 28.10.2026): replace the
      // generic parts with the honest state and the way back. The
      // verdict screen shows this text under the empty result, and it
      // is also what the report writer sees — an empty set explained,
      // never a verdict dressed up over nothing.
      setReason = 'Here is exactly what happened: the jobs that reached your final were crossed out by your own answers — your "not mine" calls and the hard lines you set did what you told them to do, and nothing new gets smuggled in to take their place. The way back is yours: start a new match and loosen one thing — one red line, your pay floor, or one "not mine" you gave too fast — and the crossed-out jobs come back into view.';
    }
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
    const pool = selectionPool.filter((r) => {
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
        else whyBridge.push(`Short road in: about ${fmtMonths(pick.training_months)} of training before employers hire.`);
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

  // ---- The side-hustle idea (founder's rule, 28.10.2026): ONE
  // extra-money format next to the verdict — never in the matches
  // above, never in the anti-matches, never the cushion. The pick
  // itself (best LOVE inside the person's own budget/hours limits,
  // threshold-gated, null when nothing clears) is pickSideHustle()
  // in ./side-hustle.mjs; it receives the helpers it needs so the
  // import stays one-way.
  const sideHustleTaken = new Set([...top3, ...bottom3].map((r) => r.slug));
  if (bridgePick) sideHustleTaken.add(bridgePick.slug);
  const sideHustlePick = mode === 'insufficient_data'
    ? null
    : pickSideHustle(person, results, profBySlug, sideHustleTaken, {
        isNum, isStubProfile, valueFits, riasecKeys: RIASEC_KEYS, dayThemes: RIASEC_DAY_THEMES, valueLabels: VALUE_LABELS,
      });

  return {
    mode,
    mode_reason: modeReason,
    income_floor_k: isNum(person.income_floor_k) ? person.income_floor_k : null,
    set_reason: setReason,
    direction: mode === 'insufficient_data' ? null : direction,
    signal: { riasec_spread: spread, thin: thinSignal },
    // Audit L12 (27.10.2026): in insufficient_data mode there IS no
    // top-3 — the API must not return one at all. The picks were
    // computed above only to decide the mode honestly; the exploration
    // plan is the product in this mode, not a shadow shortlist.
    top3: mode === 'insufficient_data' ? [] : top3,
    bottom3: mode === 'insufficient_data' ? [] : bottom3,
    bridge_pick: bridgePick || null,
    side_hustle_pick: sideHustlePick,
    results_count: results.length,
    exploration_plan: mode === 'insufficient_data' ? buildExplorationPlan(person) : [],
  };
}

export default scorePerson;
