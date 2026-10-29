// Build api/_lib/data/state-pay.json from the BLS OEWS May 2024 state file.
//
// Usage: node scripts/build_state_pay.mjs <path-to-state_M2024_dl.xlsx>
// The xlsx ships inside oesm24st.zip at https://www.bls.gov/oes/special-requests/oesm24st.zip
// (BLS blocks plain curl with an Akamai 403; a full browser header set passes.)
//
// Extract: statewide (AREA_TYPE 2), cross-industry (NAICS 000000, I_GROUP
// cross-industry), all-ownership (OWN_CODE 1235), detailed occupations only,
// restricted to the SOC codes the profession base actually uses and to the
// states listed in STATES below. Annual medians/percentiles are taken as
// published; where BLS publishes only an hourly median it is annualized at
// 2,080 hours (the BLS convention) and flagged basis:'hourly'. A '#'
// (top-coded, >= $239,200) median is stored as 239.2 with top_coded:true;
// a '*' (not released) value is omitted - never estimated.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATES = { NC: 'North Carolina', FL: 'Florida' };

const xlsx = process.argv[2];
if (!xlsx) { console.error('usage: node scripts/build_state_pay.mjs <state_M2024_dl.xlsx>'); process.exit(2); }

// SOC set from the engine itself - loadProfessions is the ground truth of
// what the mentor serves (O*NET import shards + editorial overrides merged).
const { default: loadProfessions } = await import(join(ROOT, 'api', '_lib', 'engine', 'professions.mjs'));
const profs = loadProfessions({ siteDir: ROOT });
const socs = new Set();
for (const p of profs) if (p && p.onet_soc) socs.add(String(p.onet_soc).replace(/\.\d+$/, ''));

// The xlsx is read through python3+openpyxl (present on this machine); the
// extractor prints JSON lines: [state, soc, a_median, a_pct25, a_pct75, a_pct90, h_median]
const py = `
import openpyxl, sys, json
wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
ws = wb['state_M2024_dl']
rows = ws.iter_rows(values_only=True)
hdr = [str(c) if c is not None else '' for c in next(rows)]
ix = {name: i for i, name in enumerate(hdr)}
want_states = set(json.loads(sys.argv[2]))
want_socs = set(json.loads(sys.argv[3]))
for r in rows:
    if r[ix['PRIM_STATE']] not in want_states: continue
    if r[ix['NAICS']] != '000000' or r[ix['I_GROUP']] != 'cross-industry': continue
    if str(r[ix['OWN_CODE']]) != '1235' or r[ix['O_GROUP']] != 'detailed': continue
    soc = str(r[ix['OCC_CODE']])
    if soc not in want_socs: continue
    def v(name):
        x = r[ix[name]]
        return None if x is None else x
    print(json.dumps([r[ix['PRIM_STATE']], soc, v('A_MEDIAN'), v('A_PCT25'), v('A_PCT75'), v('A_PCT90'), v('H_MEDIAN')]))
`;
const out = execFileSync('python3', ['-c', py, xlsx, JSON.stringify(Object.keys(STATES)), JSON.stringify([...socs])], { maxBuffer: 64 * 1024 * 1024 }).toString();

function num(x) { const n = Number(x); return Number.isFinite(n) ? n : null; }
function annual(raw) { // returns {k, top} or null when BLS did not release the figure
  if (raw == null || raw === '' || raw === '*') return null;
  if (raw === '#') return { k: 239.2, top: true };
  const n = num(raw);
  return n == null ? null : { k: Math.round(n / 100) / 10 };
}

const states = {};
const coverage = {};
for (const line of out.split('\n')) {
  if (!line.trim()) continue;
  const [st, soc, aMed, a25, a75, a90, hMed] = JSON.parse(line);
  const med = annual(aMed);
  let entry = null;
  if (med) entry = { median_k: med.k, ...(med.top ? { top_coded: true } : {}) };
  else {
    const h = (hMed == null || hMed === '*' || hMed === '#') ? null : num(hMed);
    if (h != null) entry = { median_k: Math.round(h * 2.08 * 10) / 10, basis: 'hourly' };
  }
  if (!entry) continue;
  const p25 = annual(a25), p75 = annual(a75), p90 = annual(a90);
  if (p25) entry.p25_k = p25.k;
  if (p75) entry.p75_k = p75.k;
  if (p90) entry.p90_k = p90.k;
  (states[st] = states[st] || {})[soc] = entry;
  coverage[st] = (coverage[st] || 0) + 1;
}

const doc = {
  source: 'BLS Occupational Employment and Wage Statistics (OEWS), May 2024 state estimates - oesm24st / state_M2024_dl.xlsx (https://www.bls.gov/oes/special-requests/oesm24st.zip)',
  extracted: '2026-10-29',
  base_soc_count: socs.size,
  coverage,
  states,
};
const dest = join(ROOT, 'api', '_lib', 'data', 'state-pay.json');
writeFileSync(dest, JSON.stringify(doc, null, 1) + '\n');
console.log('wrote', dest);
console.log('base SOCs:', socs.size, '| coverage:', JSON.stringify(coverage));
