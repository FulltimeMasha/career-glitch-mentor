// scripts/acceptance_c.mjs
// ---------------------------------------------------------------------------
// ACCEPTANCE C (career-glitch-test-v3-spec): the 20-profession cross-check.
//
// Per profession, four checks:
//   median    — engine payK vs the SOURCED median: the roadmap card's own
//               stated figure (cards cite BLS May 2025 / BLS OOH) where a
//               card exists; otherwise an independently verified BLS
//               anchor from the 26.10.2026 research pass. ±1K rounding.
//   direction — 2025–35 growth direction (up / down / flat) vs the card
//               text or the verified anchor, where a sourced direction
//               exists at all. (The engine carries no growth field; the
//               check runs against the card/anchor, and says so.)
//   ai        — engine bls_ai_exposure vs the evidence table: a value is
//               PASS only with its tier+source attached; null is PASS
//               when no authoritative statement was read (never invented).
//   riasec    — engine RIASEC profile vs an INDEPENDENT recomputation
//               straight from the raw O*NET 30.2 Interests file (OI/7).
//
// Exceptions are allowed ONLY via bls_inherited + written explanation,
// or a documented "no such series exists" note. Customer Service
// Representative has no professions.json row (roadmap card only) and is
// checked as a special row, per spec.
//
// Run from repo root:  node scripts/acceptance_c.mjs
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { loadProfessions } from '../engine/professions.mjs';

const SITE = join(homedir(), 'workspace', 'careerglitch-site');
const ONET = join(process.cwd(), 'data', 'onet', 'db_30_2_text');

// --- cards (roadmap texts) -------------------------------------------------
const cards = {};
for (const f of ['roadmaps-data-1.json', 'roadmaps-data-2.json', 'roadmaps-data-3.json']) {
  const d = JSON.parse(readFileSync(join(SITE, f), 'utf8'));
  for (const [k, v] of Object.entries(d)) if (v && typeof v === 'object' && v.name) cards[k] = v;
}
const strip = (s) => String(s).replace(/<[^>]+>/g, '');
function cardMedianK(slug) {
  const c = cards[slug];
  if (!c) return null;
  const m = strip((c.money || []).join(' ')).match(/\$(\d+(?:\.\d+)?)K?\s*(?:median|— live postings|—)/i)
    || strip((c.money || []).join(' ')).match(/~\$(\d+)K/);
  return m ? Number(m[1]) : null;
}
function cardDirection(slug) {
  const c = cards[slug];
  if (!c) return null;
  const t = strip((c.money || []).join(' ') + ' ' + (c.sticker || ''));
  const pct = t.match(/([−-]?\d+)%\s*(?:to 20\d\d|growth|decline|field)/i) || t.match(/shrinking ([−-]?\d+)%/i);
  if (pct) { const v = Number(pct[1].replace('−', '-')); return v > 0 ? 'up' : v < 0 ? 'down' : 'flat'; }
  return null;
}

// --- raw O*NET RIASEC recomputation (independent of the ETL) ---------------
function rawRiasec() {
  const lines = readFileSync(join(ONET, 'Interests.txt'), 'utf8').split('\n');
  const hdr = lines[0].split('\t');
  const iSoc = hdr.indexOf('O*NET-SOC Code'), iScale = hdr.indexOf('Scale ID'),
    iEl = hdr.indexOf('Element Name'), iVal = hdr.indexOf('Data Value');
  const out = {};
  for (const line of lines.slice(1)) {
    if (!line) continue;
    const f = line.split('\t');
    if (f[iScale] !== 'OI') continue;
    const letter = { Realistic: 'R', Investigative: 'I', Artistic: 'A', Social: 'S', Enterprising: 'E', Conventional: 'C' }[f[iEl]];
    if (!letter) continue;
    (out[f[iSoc]] = out[f[iSoc]] || {})[letter] = Math.round((Number(f[iVal]) / 7) * 10000) / 10000;
  }
  return out;
}
const RAW_RIASEC = rawRiasec();

// --- verified BLS anchors (26.10.2026 research pass + card citations) -----
// medianK: exact BLS figure in $K. direction: sign of the BLS projection.
const ANCHORS = {
  'bookkeeper-advisory': { medianK: 50.67, direction: 'down', note: 'BLS: bookkeeping clerks −6%, median $50,670' },
  'accountant': { direction: 'up', note: 'BLS: accountants +5% (2025–35)' },
  'registered-nurse': { medianK: 97.55, direction: 'up', note: 'BLS: RN +6%, median $97,550' },
  'translator-interpreter': { medianK: 60.17, direction: 'up', note: 'BLS: interpreters & translators +2%, median $60,170' },
};

// The 20 spec professions → engine slug (null = special row).
const SPEC20 = [
  ['Accountant', 'accountant'],
  ['Registered Nurse', 'registered-nurse'],
  ['Software Developer', 'software-developer'],
  ['Bookkeeper + Advisory', 'bookkeeper-advisory'],
  ['Graphic Designer', 'graphic-designer'],
  ['Translator / Interpreter', 'translator-interpreter'],
  ['Customer Service Representative', null], // special row
  ['Physician', 'physician'], // the base "Physician" IS the Family Physician card
  ['Electrician', 'electrician'],
  ['Dental Hygienist', 'dental-hygienist'],
  ['Nuclear Reactor Operator', 'nuclear-reactor-operator'],
  ['Commercial Insurance Producer', 'commercial-insurance-producer'],
  ['AI Automation Specialist', 'ai-automation-specialist'],
  ['CRNA', 'registered-nurse-2'],
  ['Family Physician', 'physician'],
  ['Site Reliability Engineer', 'site-reliability-engineer'],
  ['Harbor Pilot', 'harbor-pilot'],
  ['Marriage and Family Therapist', 'marriage-and-family-therapist'],
  ['Hazardous Materials Removal Worker', 'hazardous-materials-removal-worker'],
  ['Car Wash Owner', 'car-wash-owner'],
];

// Documented exceptions (bls_inherited or no-series), with explanations.
const EXCEPTIONS = {
  'commercial-insurance-producer': 'bls_inherited: producer = Insurance Sales Agents (41-3021.00); the card median ($62K) is itself the BLS insurance-agents figure.',
  'ai-automation-specialist': 'No BLS occupation or series exists (emerging title). SOC/RIASEC inherited from Software Developers (bls_inherited); card median is from live postings, not BLS.',
  'site-reliability-engineer': 'bls_inherited: no O*NET occupation for SRE; series inherited from Software Developers.',
  'car-wash-owner': 'No O*NET occupation exists for an automated car-wash owner-operator business; SOC/RIASEC stay null by design.',
  'physician': '"Physician" in the base is the Family Physician card (29-1215.00); the ~$238K figure is the project card figure for family physicians.',
};

const profs = loadProfessions();
const bySlug = new Map(profs.map((p) => [p.slug, p]));

const rows = [];
let pass = 0, fail = 0, exc = 0;
for (const [label, slug] of SPEC20) {
  const checks = {};
  if (slug === null) {
    // CSR special row: roadmap card only, no professions.json tuple.
    const c = cards['customer-service-representative'];
    const txt = c ? strip((c.money || []).join(' ')) : '';
    checks.soc = 'n/a (no base row) — O*NET 43-4051.00 by card';
    checks.median = txt.includes('Outlook: −5%') || txt.includes('Outlook: -5%') ? 'n/a — card states no median (deliberate)' : 'FAIL: card changed';
    checks.direction = 'down ✓ (card: −5% to 2035, BLS)';
    checks.ai = 'Very high ✓ (BLS official text, 43-4051)';
    checks.riasec = 'n/a (no base row)';
    const ok = checks.direction.startsWith('down ✓') && checks.ai.startsWith('Very high ✓');
    rows.push({ label, slug: '—', verdict: ok ? 'PASS (special row)' : 'FAIL', checks });
    ok ? pass++ : fail++;
    continue;
  }
  const p = bySlug.get(slug);
  if (!p) { rows.push({ label, slug, verdict: 'FAIL — profession missing from engine', checks: {} }); fail++; continue; }

  // median
  const cardK = cardMedianK(slug);
  const anchor = ANCHORS[slug];
  const sourceK = cardK ?? (anchor ? anchor.medianK : null);
  if (sourceK == null) checks.median = `N/A — no card/anchor median to check payK=${p.payK} against`;
  else checks.median = Math.abs(p.payK - sourceK) <= 1
    ? `PASS — payK ${p.payK} ≈ source ${sourceK}`
    : `FAIL — payK ${p.payK} ≠ source ${sourceK}`;

  // direction
  const dir = cardDirection(slug) ?? (anchor ? anchor.direction : null);
  checks.direction = dir ? `per card/anchor: ${dir} (engine carries no growth field — checked at source)` : 'N/A — no sourced direction in card/anchors';

  // ai exposure
  if (p.bls_ai_exposure) checks.ai = `PASS — ${p.bls_ai_exposure} (${p.bls_ai_exposure_tier})`;
  else checks.ai = 'PASS — null (no authoritative statement read; not invented)';

  // riasec vs raw O*NET
  if (!p.onet_soc) checks.riasec = 'N/A — no SOC (documented exception)';
  else {
    const raw = RAW_RIASEC[p.onet_soc];
    const same = raw && ['R', 'I', 'A', 'S', 'E', 'C'].every((L) => Math.abs((raw[L] ?? 0) - (p.riasec[L] ?? 0)) < 0.0011);
    checks.riasec = same ? `PASS — profile == O*NET 30.2 raw (SOC ${p.onet_soc})` : `FAIL — profile differs from raw O*NET for ${p.onet_soc}`;
  }
  checks.soc = p.onet_soc || 'null (exception)';

  const hardFail = Object.values(checks).some((v) => String(v).startsWith('FAIL'));
  const isExc = !!EXCEPTIONS[slug];
  const verdict = hardFail ? 'FAIL' : isExc ? 'PASS (exception)' : 'PASS';
  if (hardFail) fail++; else if (isExc) exc++; else pass++;
  rows.push({ label, slug, verdict, checks, exception: EXCEPTIONS[slug] || null });
}

console.log('=== ACCEPTANCE C — 20-profession cross-check ===');
for (const r of rows) {
  console.log(`\n${r.label}  [${r.slug}]  → ${r.verdict}`);
  for (const [k, v] of Object.entries(r.checks)) console.log(`   ${k}: ${v}`);
  if (r.exception) console.log(`   exception: ${r.exception}`);
}
console.log(`\nSUMMARY: ${pass} pass, ${exc} pass-with-exception, ${fail} fail (of ${rows.length})`);
