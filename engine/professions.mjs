// engine/professions.mjs
// ---------------------------------------------------------------------------
// Profession loader for Career Glitch Mentor (Day-1 hackathon build).
//
// Reads the LIVE Career Glitch site data:
//   <siteDir>/professions.json          { n: [tuples], q: [test questions] }
//   <siteDir>/roadmaps-data-1.json      { <slug>: {name, sticker, money[], …}, byName: {name: slug} }
//   <siteDir>/roadmaps-data-2.json      same shape
//   <siteDir>/roadmaps-data-3.json      same shape, no byName map
// Default siteDir = ~/workspace/careerglitch-site (override via opts.siteDir
// or env CG_SITE_DIR). A frozen copy of the four files lives in the repo at
// data/site-snapshot/ for reference; the loader reads the live files.
//
// professions.json tuple layout (verified against careerglitch-site
// build_test.py `enrich()`: source tuples have 13 fields, enrich() appends
// [studyBand, payK]):
//   [0] name        [1] category   [2] pay (1..3)      [3] ai (0..2, AI-risk band)
//   [4] remote 0..2 [5] lic  0..2  [6] hands 0..2      [7] people 0..2
//   [8] biz 0..1    [9] tech 0..2  [10] out 0..2       [11] care 0..2
//   [12] creat 0..2 [13] studyBand 1..5 (site STUDY_LABELS:
//        1 "1–6 mo", 2 "6–12 mo", 3 "1–2 yrs", 4 "2–4 yrs", 5 "4+ yrs")
//   [14] payK (median pay, $K/year)
//
// HONESTY RULE (model v2 §1в): fields that would come from O*NET / BLS
// imports (onet_soc, bls_*, work_values_extent, abilities_lv, skills_lv,
// license_type, inflow_competition_flag) are NOT in the site data, so they
// stay null and are listed in data_flags. Nothing sourced is invented.
// Everything derived is a documented stub and flagged as such.
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_SITE_DIR = join(homedir(), 'workspace', 'careerglitch-site');

const ROADMAP_FILES = ['roadmaps-data-1.json', 'roadmaps-data-2.json', 'roadmaps-data-3.json'];

// Fields whose values are null because no source exists yet (model v2 §1в).
const UNSOURCED_FIELDS = [
  'onet_soc',
  'bls_inherited',
  'bls_vintage',
  'bls_ai_exposure',
  'work_values_extent',
  'work_values_frozen_date',
  'abilities_lv',
  'skills_lv',
  'inflow_competition_flag',
  'license_type',
];

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const normName = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const slugify = (s) => normName(s).replace(/ /g, '-');

// ---------------------------------------------------------------------------
// Training text → months (midpoint). Roadmap `money` lines look like:
//   "Training: <b>1–6 months</b> · certificate route."
//   "Training: <b>4–5 years</b> · paid apprenticeship…"
//   "Training: <b>weeks</b>" / "<b>~3 years</b>" / "<b>6–18 months</b>"
// ---------------------------------------------------------------------------
export function parseTrainingMonths(moneyLines) {
  if (!Array.isArray(moneyLines)) return null;
  const text = moneyLines.join(' ');
  const m = text.match(/Training:\s*<b>([^<]+)<\/b>/i) || text.match(/Training:\s*([^·<]+)/i);
  if (!m) return null;
  const raw = m[1].trim().toLowerCase();
  if (/^weeks?$/.test(raw)) return 1; // "weeks" ≈ a few weeks → ~1 month stub
  const unit = /year/.test(raw) ? 12 : /week/.test(raw) ? 1 / 4.345 : 1; // default: months
  const nums = [...raw.matchAll(/(\d+(?:\.\d+)?)/g)].map((x) => Number(x[1]) * unit);
  if (nums.length === 0) return null;
  if (nums.length === 1) return nums[0]; // single value or "4+ years" → the stated floor value
  return (nums[0] + nums[1]) / 2; // range midpoint
}

// Fallback when a profession has no matched roadmap text: the site's own
// study band (tuple index 13) → midpoint months of the band's label.
// Bands: 1 "1–6 mo" → 3.5 · 2 "6–12 mo" → 9 · 3 "1–2 yrs" → 18 ·
//        4 "2–4 yrs" → 36 · 5 "4+ yrs" → 54 (stub: midpoint of 48–60).
const STUDY_BAND_MONTHS = { 1: 3.5, 2: 9, 3: 18, 4: 36, 5: 54 };

// ---------------------------------------------------------------------------
// STUB DERIVATIONS (Day-1 editorial calibration — flagged on every object).
// All attrs are 0..2 except pay (1..3) and biz (0..1).
//
// supplies (0..1 per O*NET work value) — what the profession SUPPLIES:
//   achievement       ← 0.5·payBand + 0.5·biz        (results + running your own thing)
//   independence      ← 0.6·remote + 0.4·biz          (own schedule / own boss)
//   recognition       ← 0.6·payBand + 0.4·creat      (status pay + visible work)
//   relationships     ← people                       (people are the work itself)
//   support           ← 0.5·care + 0.5·people         (structured, caring environments)
//   working_conditions← 0.7·(1 − aiRisk) + 0.3·remote (stability + place flexibility)
//   where payBand = (pay−1)/2 and the 0..2 attrs are divided by 2.
//
// sdt (0..1 affordances):
//   autonomy    ← 0.5·remote + 0.5·biz
//   relatedness ← 0.7·people + 0.3·care
//
// riasec (0..1 per letter): category base profile blended 70/30 with an
// attr signal per letter:
//   R ← hands · I ← tech · A ← creat · S ← max(people, care) ·
//   E ← biz · C ← 0.5·tech + 0.5·remote (screen/structured work proxy)
// ---------------------------------------------------------------------------
const RIASEC_CATEGORY_BASE = {
  online:    { R: 0.2, I: 0.7, A: 0.2, S: 0.2, E: 0.3, C: 0.6 },
  trades:    { R: 0.9, I: 0.3, A: 0.1, S: 0.2, E: 0.2, C: 0.3 },
  health:    { R: 0.4, I: 0.5, A: 0.1, S: 0.8, E: 0.1, C: 0.3 },
  business:  { R: 0.2, I: 0.4, A: 0.2, S: 0.3, E: 0.8, C: 0.5 },
  people:    { R: 0.2, I: 0.2, A: 0.4, S: 0.9, E: 0.4, C: 0.3 },
  creative:  { R: 0.3, I: 0.3, A: 0.9, S: 0.2, E: 0.3, C: 0.1 },
  transport: { R: 0.7, I: 0.2, A: 0.1, S: 0.2, E: 0.2, C: 0.4 },
  food:      { R: 0.6, I: 0.2, A: 0.5, S: 0.4, E: 0.3, C: 0.3 },
  beauty:    { R: 0.5, I: 0.1, A: 0.6, S: 0.6, E: 0.3, C: 0.2 },
};
const RIASEC_DEFAULT_BASE = { R: 0.3, I: 0.3, A: 0.3, S: 0.3, E: 0.3, C: 0.3 };

function deriveStubs(attrs, category) {
  const n2 = (v) => (typeof v === 'number' ? v / 2 : 0); // 0..2 → 0..1
  const payBand = typeof attrs.pay === 'number' ? (attrs.pay - 1) / 2 : 0; // 1..3 → 0..1
  const biz = typeof attrs.biz === 'number' ? attrs.biz : 0; // already 0..1

  const supplies = {
    achievement: clamp01(0.5 * payBand + 0.5 * biz),
    independence: clamp01(0.6 * n2(attrs.remote) + 0.4 * biz),
    recognition: clamp01(0.6 * payBand + 0.4 * n2(attrs.creat)),
    relationships: clamp01(n2(attrs.people)),
    support: clamp01(0.5 * n2(attrs.care) + 0.5 * n2(attrs.people)),
    working_conditions: clamp01(0.7 * (1 - n2(attrs.ai)) + 0.3 * n2(attrs.remote)),
  };

  const sdt = {
    autonomy: clamp01(0.5 * n2(attrs.remote) + 0.5 * biz),
    relatedness: clamp01(0.7 * n2(attrs.people) + 0.3 * n2(attrs.care)),
  };

  const base = RIASEC_CATEGORY_BASE[category] || RIASEC_DEFAULT_BASE;
  const riasec = {
    R: clamp01(0.7 * base.R + 0.3 * n2(attrs.hands)),
    I: clamp01(0.7 * base.I + 0.3 * n2(attrs.tech)),
    A: clamp01(0.7 * base.A + 0.3 * n2(attrs.creat)),
    S: clamp01(0.7 * base.S + 0.3 * Math.max(n2(attrs.people), n2(attrs.care))),
    E: clamp01(0.7 * base.E + 0.3 * biz),
    C: clamp01(0.7 * base.C + 0.15 * n2(attrs.tech) + 0.15 * n2(attrs.remote)),
  };

  return { supplies, sdt, riasec };
}

// ---------------------------------------------------------------------------
// Roadmap matching. Priority:
//   1. byName map shipped inside roadmaps-data-1/2 (name → slug), exact.
//   2. Normalised-name equality with a roadmap entry's `name`.
//   3. Suffix match: profession name ENDS WITH the roadmap name
//      ("Accountant" → "Accountant (CPA track)" fails this; handled by 4).
//   4. Containment: normalised profession name contains the roadmap name or
//      vice versa; shortest candidate wins ("Physician" → "Family
//      Physician", not "Physician Assistant" — suffix rule fires first).
// Unmatched roadmap cards (e.g. "Customer Service Representative", which has
// no tuple in professions.json) simply attach to nothing.
// ---------------------------------------------------------------------------
function buildRoadmapIndex(roadmapFilesData) {
  const entries = []; // {slug, name, norm, sticker, money}
  const byName = new Map(); // normName -> slug
  for (const data of roadmapFilesData) {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'byName' && value && typeof value === 'object') {
        for (const [name, slug] of Object.entries(value)) byName.set(normName(name), slug);
        continue;
      }
      if (value && typeof value === 'object' && typeof value.name === 'string') {
        entries.push({
          slug: key,
          name: value.name,
          norm: normName(value.name),
          sticker: typeof value.sticker === 'string' ? value.sticker : null,
          money: Array.isArray(value.money) ? value.money : [],
        });
      }
    }
  }
  const bySlug = new Map(entries.map((e) => [e.slug, e]));
  const byNorm = new Map(entries.map((e) => [e.norm, e]));
  return { entries, byName, bySlug, byNorm };
}

function matchRoadmap(profName, index) {
  const norm = normName(profName);
  const slugFromMap = index.byName.get(norm);
  if (slugFromMap && index.bySlug.has(slugFromMap)) return index.bySlug.get(slugFromMap);
  if (index.byNorm.has(norm)) return index.byNorm.get(norm);
  // suffix: profession ends with roadmap name (e.g. "Family Physician" ← "Physician")
  const suffix = index.entries
    .filter((e) => norm.endsWith(' ' + e.norm))
    .sort((a, b) => b.norm.length - a.norm.length)[0];
  if (suffix) return suffix;
  // containment either way, shortest profession-side distance wins
  const containment = index.entries
    .filter((e) => norm.includes(e.norm) || e.norm.includes(norm))
    .sort((a, b) => Math.abs(a.norm.length - norm.length) - Math.abs(b.norm.length - norm.length))[0];
  return containment || null;
}

function parseVerdict(sticker) {
  if (!sticker) return null;
  const m = sticker.match(/Our take:\s*(YES|NO)\b/i);
  return m ? m[1].toUpperCase() : null;
}

// ---------------------------------------------------------------------------
// buildProfessions(profData, roadmapDataArray) → array of profession stub
// objects (see header comment and the task spec for the exact shape).
// Pure data transform — no I/O — so the Mentor API can build the same
// objects from JSON fetched over HTTP when no local site dir exists
// (serverless hosts). loadProfessions() below is the file-reading wrapper.
// ---------------------------------------------------------------------------
export function buildProfessions(profData, roadmapData) {
  const tuples = Array.isArray(profData) ? profData : profData.n;
  if (!Array.isArray(tuples)) throw new Error('professions.json: expected { n: [...] }');

  const index = buildRoadmapIndex(roadmapData);

  const usedSlugs = new Set();
  return tuples.map((t) => {
    const [name, category, pay, ai, remote, lic, hands, people, biz, tech, out, care, creat, studyBand, payK] = t;
    const attrs = { pay, ai, remote, lic, hands, people, biz, tech, out, care, creat };

    const roadmap = matchRoadmap(name, index);
    const verdict = roadmap ? parseVerdict(roadmap.sticker) : null;

    let slug = roadmap ? roadmap.slug : slugify(name);
    if (usedSlugs.has(slug)) slug = `${slug}-2`;
    usedSlugs.add(slug);

    // training_months: roadmap text first (parsed midpoint), study-band fallback.
    let trainingMonths = roadmap ? parseTrainingMonths(roadmap.money) : null;
    let trainingSource = trainingMonths != null ? 'roadmap_text' : null;
    if (trainingMonths == null && STUDY_BAND_MONTHS[studyBand] != null) {
      trainingMonths = STUDY_BAND_MONTHS[studyBand];
      trainingSource = 'study_band';
    }

    const { supplies, sdt, riasec } = deriveStubs(attrs, category);

    const dataFlags = [
      'supplies_stub', // derived from attrs — see deriveStubs()
      'sdt_stub',
      'riasec_stub',
      ...UNSOURCED_FIELDS, // null: no source data yet
    ];
    if (trainingSource === 'roadmap_text') dataFlags.push('training_months_from_roadmap_text');
    if (trainingSource === 'study_band') dataFlags.push('training_months_from_study_band');
    if (trainingMonths == null) dataFlags.push('training_months');
    if (!roadmap) dataFlags.push('verdict', 'verdict_text', 'roadmap_unmatched');
    else if (verdict == null) dataFlags.push('verdict_unparsed');
    if (!roadmap) dataFlags.push('slug_derived_from_name');

    return {
      slug,
      name,
      category,
      verdict,
      verdict_text: roadmap ? roadmap.sticker : null,
      payK: typeof payK === 'number' ? payK : null,
      attrs,
      training_months: trainingMonths,
      supplies,
      supplies_stub: true,
      sdt,
      riasec,
      riasec_stub: true,
      gates: {
        // voice_load: defined simply for Day 1 — a people-category profession
        // with maximum people-contact is voice-heavy all day (calls, clients,
        // teaching aloud). Used by the factual voice gate in scoring.
        voice_load: category === 'people' && people === 2,
        // physical: maximum hands-on load.
        physical: hands === 2,
      },
      // --- model v2 §1в fields with NO source in the site data: null, flagged.
      onet_soc: null,
      bls_inherited: null,
      bls_vintage: null,
      bls_ai_exposure: null,
      work_values_extent: null,
      work_values_frozen_date: null,
      abilities_lv: null,
      skills_lv: null,
      inflow_competition_flag: null,
      license_type: null,
      data_flags: dataFlags,
    };
  });
}

// ---------------------------------------------------------------------------
// loadProfessions(opts) — file-reading wrapper over buildProfessions().
// Reads the live site dir (default ~/workspace/careerglitch-site).
// ---------------------------------------------------------------------------
export function loadProfessions(opts = {}) {
  const siteDir = opts.siteDir || process.env.CG_SITE_DIR || DEFAULT_SITE_DIR;
  const profData = JSON.parse(readFileSync(join(siteDir, 'professions.json'), 'utf8'));
  const roadmapData = ROADMAP_FILES.map((f) => JSON.parse(readFileSync(join(siteDir, f), 'utf8')));
  return buildProfessions(profData, roadmapData);
}

export const ROADMAP_FILE_NAMES = ROADMAP_FILES;

export default loadProfessions;
