#!/usr/bin/env node
// scripts/build_target_aliases.mjs
// ---------------------------------------------------------------------------
// Builds api/_lib/data/target-aliases.json — the DETERMINISTIC corpus
// the stated-target matcher (api/_lib/engine/target-match.mjs) resolves
// a person's named job against: for every profession in the base, the
// O*NET alternate titles and sampled reported titles of ITS OWN matched
// SOC occupation (O*NET 30.2, data/onet/db_30_2_text). The SOC links
// themselves are the hand-reviewed import mapping — this script never
// invents a link, it only reads titles for links that already exist.
//
// Run from the repo root:  node scripts/build_target_aliases.mjs
// ---------------------------------------------------------------------------
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildProfessions, ROADMAP_FILE_NAMES } from '../api/_lib/engine/professions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const profData = JSON.parse(readFileSync(join(ROOT, 'professions.json'), 'utf8'));
const roadmapData = ROADMAP_FILE_NAMES.map((f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8')));
const professions = buildProfessions(profData, roadmapData);

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function titlesBySoc(file) {
  const map = new Map();
  const lines = readFileSync(join(ROOT, 'data/onet/db_30_2_text', file), 'utf8').split('\n');
  const header = lines[0].split('\t');
  const socIdx = header.findIndex((h) => /code/i.test(h));
  const titleIdx = header.findIndex((h) => /title/i.test(h));
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const soc = (cols[socIdx] || '').trim();
    const title = (cols[titleIdx] || '').trim();
    if (!soc || !title) continue;
    if (!map.has(soc)) map.set(soc, new Set());
    map.get(soc).add(title);
  }
  return map;
}

const alternate = titlesBySoc('Alternate Titles.txt');
const reported = titlesBySoc('Sample of Reported Titles.txt');

const out = {};
let withAliases = 0;
for (const p of professions) {
  if (!p.onet_soc) continue;
  const own = new Set([norm(p.name), norm(p.onet_title || '')]);
  const titles = new Set();
  for (const src of [alternate, reported]) {
    for (const t of src.get(p.onet_soc) || []) {
      const n = norm(t);
      if (!n || own.has(n)) continue;
      // People name a job in a few words: hyperspecific survey variants
      // ("Cardiac Care Unit Nurse (CCU Nurse)") are corpus noise for a
      // stated-target matcher, and the bundle ships per-file size caps.
      if (n.length > 45) continue;
      titles.add(n);
    }
  }
  // Shortest first — the names people actually type — capped per slug.
  const list = [...titles].sort((a, b) => a.length - b.length || (a < b ? -1 : 1)).slice(0, 25);
  if (list.length) { out[p.slug] = list; withAliases++; }
}

// Sharded write (same pattern as onet-import): the deploy upload path
// caps a single file, so shards stay under ~85 KB compact each.
const dataDir = join(ROOT, 'api/_lib/data');
const slugs = Object.keys(out).sort();
const shards = [];
let cur = {};
let curBytes = 2;
for (const slug of slugs) {
  const entryBytes = JSON.stringify(slug).length + JSON.stringify(out[slug]).length + 1;
  if (curBytes + entryBytes > 85000 && Object.keys(cur).length) {
    shards.push(cur); cur = {}; curBytes = 2;
  }
  cur[slug] = out[slug]; curBytes += entryBytes;
}
if (Object.keys(cur).length) shards.push(cur);
shards.forEach((shard, i) => {
  // Compact: the pretty form of a full shard crosses the deploy
  // per-file upload cap; this is a machine corpus, not a hand file.
  writeFileSync(join(dataDir, `target-aliases-${String(i + 1).padStart(2, '0')}.json`), JSON.stringify(shard) + '\n');
});
const total = Object.values(out).reduce((a, b) => a + b.length, 0);
console.log(`target-aliases: ${withAliases} professions, ${total} titles, ${shards.length} shard(s)`);
