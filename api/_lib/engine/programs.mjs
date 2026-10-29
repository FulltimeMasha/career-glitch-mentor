// Real local programs for a ladder's first step (Matchmaker 2.0 extension,
// brief §5.6). Data lives in api/_lib/data/programs.json and is collected by
// hand from the schools' own publications. Only the clusters present in the
// file exist — a step/state with no entry returns null, and the UI shows
// nothing rather than an invented program. Ranking: cheapest first, then
// shortest — by fit for the person; there are no commissions to rank by.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeState } from './state-pay.mjs';

const DATA = JSON.parse(readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'programs.json'), 'utf8'));

// -> up to 3 programs for (step slug, person's state), or null.
export function programsForStep(stepSlug, stateInput) {
  if (!stepSlug) return null;
  const code = normalizeState(stateInput);
  if (!code) return null;
  const list = DATA.steps?.[stepSlug]?.[code];
  if (!Array.isArray(list) || !list.length) return null;
  return [...list]
    .sort((a, b) => (a.cost_k - b.cost_k) || (a.months - b.months))
    .slice(0, 3)
    .map((p) => ({ ...p }));
}
