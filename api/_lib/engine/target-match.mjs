// engine/target-match.mjs
// ---------------------------------------------------------------------------
// DETERMINISTIC matching of a person's STATED TARGET — the one specific
// job they named as their goal (stage 2) — against the profession base
// (Matchmaker 2.0 core, brief 28.10.2026 §5.1). Server code only: no
// LLM ever touches this mapping, the same rule as every score in the
// engine. A name that matches nothing is an honest result
// (matched: false + the nearest field), never a silent drop.
//
// Corpus, strongest first:
//   1. the profession's own name in the base;
//   2. its matched O*NET occupation title (onet_title);
//   3. O*NET alternate + sampled reported titles of its own SOC —
//      api/_lib/data/target-aliases-*.json, built offline from the
//      O*NET 30.2 text files by scripts/build_target_aliases.mjs over
//      the hand-reviewed SOC links (never an invented link);
//   4. a small hand table of the abbreviations people actually type
//      (RN, LPN, CNA…) — editorial, listed below in full.
// Matching is exact on the normalised string, then a token-subset
// pass (every token of the shorter side present in the longer), so
// "nurse" alone does NOT mint a match — it is a subset of dozens of
// titles and resolves as ambiguous, i.e. unmatched with a field.
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const normTargetName = (s) => String(s ?? '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Abbreviations people type instead of the full title. Editorial and
// complete as listed — an abbreviation not here simply does not match.
const ABBREVIATIONS = {
  rn: 'registered-nurse',
  lpn: 'lpn-lvn',
  lvn: 'lpn-lvn',
  cna: 'certified-nursing-assistant',
  crna: 'registered-nurse-2',
  np: 'nurse-practitioner',
  pa: 'physician-assistant',
  emt: 'emt-paramedic',
  cdl: 'cdl-truck-driver',
  hvac: 'hvac-technician',
  ux: 'ux-ui-designer',
  cpa: 'accountant',
  bmet: 'biomedical-equipment-technician-bmet',
  bcba: 'board-certified-behavior-analyst-bcba',
  ot: 'occupational-therapist',
  pt: 'physical-therapist',
};

// Editorial canonical alternates for the rows that have NO O*NET
// corpus to draw from (new/specialty rows the import cannot cover):
// the name the occupation is actually called by in the wild. Exact
// normalised keys, complete as listed — recorded as editorial in
// DATA_PASS_CHANGELOG.md (Matchmaker 2.0 core entry). "Nurse Aide" is
// the literal NC title of the CNA row (Nurse Aide I).
const EDITORIAL_ALIASES = {
  'nurse aide': 'certified-nursing-assistant',
  'nurse aide i': 'certified-nursing-assistant',
  'certified nurse aide': 'certified-nursing-assistant',
  'medical spa owner': 'med-spa-owner',
  'medspa owner': 'med-spa-owner',
};

// Field guesses for an unmatched name — the same TARGET_FIELDS
// vocabulary the direction anchor speaks, derived from plain keywords
// in the stated name itself. A guess is labelled a guess on the card.
const FIELD_KEYWORDS = [
  ['health', ['nurse', 'nursing', 'medical', 'doctor', 'physician', 'dental', 'dentist', 'therapist', 'therapy', 'pharmacy', 'pharmacist', 'surgeon', 'surgery', 'clinic', 'hospital', 'patient', 'vet', 'paramedic', 'radiology', 'midwife', 'aesthetic', 'botox', 'injector', 'spa']],
  ['trades', ['electrician', 'plumber', 'plumbing', 'carpenter', 'welder', 'welding', 'hvac', 'mechanic', 'construction', 'mason', 'painter', 'roofing', 'solar', 'wind turbine']],
  ['tech', ['software', 'developer', 'programmer', 'data', 'engineer', 'engineering', 'it ', 'cyber', 'network', 'devops', 'ux', 'designer']],
  ['creative', ['artist', 'actor', 'musician', 'writer', 'photographer', 'filmmaker', 'illustrator', 'animator']],
  ['business', ['sales', 'marketing', 'manager', 'management', 'accountant', 'accounting', 'finance', 'financial', 'broker', 'insurance', 'real estate', 'banker']],
  ['education', ['teacher', 'teaching', 'professor', 'tutor', 'coach', 'instructor']],
  ['transport', ['driver', 'pilot', 'truck', 'captain', 'flight attendant', 'logistics']],
  ['food', ['chef', 'cook', 'baker', 'bartender', 'restaurant', 'barista']],
  ['beauty', ['barber', 'hair', 'makeup', 'nail', 'lash', 'esthetician', 'cosmetolog']],
  ['public_service', ['police', 'officer', 'firefighter', 'lawyer', 'attorney', 'paralegal', 'social worker']],
];

let aliasesCache = null;
function loadAliases() {
  if (aliasesCache) return aliasesCache;
  const dirs = [
    new URL('../data/', import.meta.url),
    new URL('./data/', import.meta.url),
  ];
  try {
    dirs.push(join(process.cwd(), 'api', '_lib', 'data'));
    dirs.push(join(process.cwd(), 'data'));
  } catch { /* no cwd — module-relative dirs only */ }
  for (const d of dirs) {
    try {
      const names = readdirSync(d).filter((n) => /^target-aliases-\d+\.json$/.test(n)).sort();
      if (!names.length) continue;
      const merged = {};
      for (const n of names) Object.assign(merged, JSON.parse(readFileSync(join(d, n), 'utf8')));
      if (Object.keys(merged).length) { aliasesCache = merged; return aliasesCache; }
    } catch { /* not this dir — try the next */ }
  }
  aliasesCache = {};
  return aliasesCache;
}

const tokensOf = (s) => new Set(s.split(' ').filter(Boolean));
const isSubset = (a, b) => { for (const t of a) if (!b.has(t)) return false; return true; };

/**
 * Resolve one stated target name against the base.
 * Returns { matched: true, slug, via } or
 *         { matched: false, nearest_field } — never throws.
 */
export function matchStatedTarget(rawName, professions) {
  const list = Array.isArray(professions) ? professions : [];
  const norm = normTargetName(rawName);
  if (!norm) return { matched: false, nearest_field: null };
  const bySlug = new Map(list.map((p) => [p.slug, p]));

  if (ABBREVIATIONS[norm] && bySlug.has(ABBREVIATIONS[norm])) {
    return { matched: true, slug: ABBREVIATIONS[norm], via: 'abbreviation' };
  }
  if (EDITORIAL_ALIASES[norm] && bySlug.has(EDITORIAL_ALIASES[norm])) {
    return { matched: true, slug: EDITORIAL_ALIASES[norm], via: 'editorial_alias' };
  }

  const aliases = loadAliases();
  // Exact pass over the three corpora, in strength order.
  const corpora = [
    ['base_name', (p) => [normTargetName(p.name)]],
    ['onet_title', (p) => [normTargetName(p.onet_title || '')]],
    ['onet_alternate_title', (p) => aliases[p.slug] || []],
  ];
  for (const [via, titlesOf] of corpora) {
    for (const p of list) {
      if (titlesOf(p).includes(norm)) return { matched: true, slug: p.slug, via };
    }
  }

  // Token-subset pass, two tiers. Tier 1: a corpus title CONTAINS
  // every token the person typed ("nurse practitioner" inside
  // "registered nurse practitioner") — the person used a shorter form
  // of a real title. Tier 2: a corpus title's tokens all sit INSIDE
  // the stated name ("registered nurse" inside "registered nurse
  // bsn") — extra words around a real title. A tier that points at
  // two different professions is ambiguous and honestly matches
  // nothing: a guessed target is worse than an admitted miss.
  const want = tokensOf(norm);
  if (want.size >= 2) {
    for (const mode of ['superset', 'subset']) {
      const hits = new Set();
      for (const [, titlesOf] of corpora) {
        for (const p of list) {
          for (const t of titlesOf(p)) {
            if (!t) continue;
            const have = tokensOf(t);
            if (mode === 'superset' ? (have.size > want.size && isSubset(want, have)) : (have.size >= 2 && have.size < want.size && isSubset(have, want))) {
              hits.add(p.slug);
            }
          }
        }
      }
      if (hits.size === 1) return { matched: true, slug: [...hits][0], via: 'title_tokens' };
    }
  }

  // No honest match. Name the nearest field from the words themselves.
  let nearest = null;
  for (const [field, words] of FIELD_KEYWORDS) {
    if (words.some((w) => norm.includes(w.trim()))) { nearest = field; break; }
  }
  return { matched: false, nearest_field: nearest };
}

export default matchStatedTarget;
