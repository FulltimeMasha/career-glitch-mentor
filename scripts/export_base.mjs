#!/usr/bin/env node
// scripts/export_base.mjs
// ---------------------------------------------------------------------------
// Regenerates professions-base.json — the gate's --base input — from the
// repo's own data files (professions.json + roadmaps at the repo root)
// through the engine's real producer (buildProfessions + O*NET import
// merge + cause-B field derivation). The export is a PROJECTION: only
// the fields the gate checks, in the file's established key order.
// Run from the repo root:  node scripts/export_base.mjs
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildProfessions, ROADMAP_FILE_NAMES } from '../api/_lib/engine/professions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const profData = JSON.parse(readFileSync(join(ROOT, 'professions.json'), 'utf8'));
const roadmapData = ROADMAP_FILE_NAMES.map((f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8')));
const professions = buildProfessions(profData, roadmapData);

const rows = professions.map((p) => ({
  slug: p.slug,
  verdict: p.verdict,
  payK: p.payK,
  training_months: p.training_months,
  gates: { voice_load: p.gates.voice_load, physical: p.gates.physical },
  attrs: p.attrs,
  age_gate: p.age_gate,
  night_shifts: p.night_shifts,
  public_voice: p.public_voice,
  relocation_required: p.relocation_required,
  riasec_stub: p.riasec_stub,
  supplies_stub: p.supplies_stub,
}));

writeFileSync(join(ROOT, 'professions-base.json'), JSON.stringify(rows, null, 1) + '\n');
console.log(`professions-base.json: ${rows.length} rows`);
console.log(`  age_gate set: ${rows.filter((r) => r.age_gate).length}`);
console.log(`  night_shifts true: ${rows.filter((r) => r.night_shifts).length}`);
console.log(`  public_voice true: ${rows.filter((r) => r.public_voice).length}`);
console.log(`  relocation_required true: ${rows.filter((r) => r.relocation_required).length}`);
console.log(`  gates.voice_load true: ${rows.filter((r) => r.gates.voice_load).length}`);
