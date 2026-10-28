// engine/playground-days.mjs
// ---------------------------------------------------------------------------
// Canonical Jobs Playground days. Founder decision (2026-10-27): a
// profession's day is generated ONCE (bulk run through the real
// generator — Spark from the profession's real task list, deterministic
// template where the generator falls back) and then served VERBATIM to
// everyone: the same bytes for every visitor, no per-person generation
// at request time, ever.
//
// Storage: JSON shards in ../data/ next to the O*NET import shards —
// the upload path caps a single file, so the days ship chunked as
// playground-days-NN.json, each a plain object:
//   { "<slug>": { "episodes": [ ...6 episodes... ], "pay_k": 98 }, ... }
// Loading mirrors professions.mjs readOnetImport(): module-relative
// data dir first, cwd candidates after (serverless hosts). Absent
// shards → an empty store; the caller then serves the deterministic
// template day (the path for professions added after the bulk run).
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cache = null;

function dataDirs() {
  const dirs = [];
  try { dirs.push(fileURLToPath(new URL('../data/', import.meta.url))); } catch { /* no module url */ }
  try { dirs.push(join(process.cwd(), 'data')); } catch { /* no cwd */ }
  try { dirs.push(join(process.cwd(), 'api', '_lib', 'data')); } catch { /* no cwd */ }
  return dirs;
}

export function loadPlaygroundDays() {
  if (cache) return cache;
  const merged = {};
  for (const d of dataDirs()) {
    try {
      if (!existsSync(d)) continue;
      const names = readdirSync(d).filter((n) => /^playground-days-\d+\.json$/.test(n)).sort();
      if (!names.length) continue;
      for (const n of names) {
        const shard = JSON.parse(readFileSync(join(d, n), 'utf8'));
        if (shard && typeof shard === 'object') Object.assign(merged, shard);
      }
      if (Object.keys(merged).length) break;
    } catch { /* not this dir — try the next */ }
  }
  cache = merged;
  return cache;
}

/**
 * getStoredPlaygroundDay(slug) → { episodes, pay_k } | null
 * The canonical stored day for a profession, exactly as generated in
 * the bulk run. Null when the profession has no stored day (added
 * after the run) or the stored entry is malformed.
 */
export function getStoredPlaygroundDay(slug) {
  const days = loadPlaygroundDays();
  const d = days[slug];
  if (!d || !Array.isArray(d.episodes) || d.episodes.length !== 6) return null;
  return { episodes: d.episodes, pay_k: typeof d.pay_k === 'number' ? d.pay_k : null };
}

export default getStoredPlaygroundDay;
