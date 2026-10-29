// engine/ladders.mjs
// ---------------------------------------------------------------------------
// Career ladders and the floor-as-path rule (Matchmaker 2.0 core,
// brief 28.10.2026 §5). One-way satellite of scoring.mjs, same pattern
// as side-hustle.mjs / empty-plan.mjs: scoring hands this module the
// profession list; nothing here imports scoring back.
//
// A ladder is data on the profession object (produced once in
// professions.mjs): entry_steps[] — the ordered rungs from zero into
// the profession ({slug, training_months, cost_k}); next_steps[] —
// where it grows ({slug}); prerequisites[] — what must be true first
// ({what}). A step whose slug is not in the current list is skipped,
// never invented.
//
// FLOOR-AS-PATH: one rule for every profession (it replaces the old
// median-vs-top-decile asymmetry, under which an RN at $98K died
// against a $100K floor while an insurance producer at $62K lived on
// a sourced $138K top-decile figure). A profession clears the floor
// when ANY of these holds, and the status always names which one:
//   (i)   typical median pay >= floor                    → 'clears'
//   (ii)  its ladder reaches a rung paid >= floor within
//         LADDER_FLOOR_YEARS years of cumulative training
//                                                        → 'clears_via_ladder'
//   (iii) a sourced upper-tail figure (top quartile, else the BLS
//         top-10% threshold) >= floor                   → 'top_tier_only'
//                                                          / 'top_decile_only'
// Otherwise 'below_floor', which never seats in a top-3 (gate smalls).
//
// The ladder leg is computed here because it needs the whole list
// (each rung's pay and training live on the rung's own row).
// ---------------------------------------------------------------------------

export const LADDER_FLOOR_YEARS = 5;

/** Every ladder path upward from `prof`, as chains of rungs with
 *  cumulative training months (entering prof's own training first).
 *  Explores ALL declared next_steps branches, depth-capped,
 *  cycle-safe. The starting profession is rung zero of every chain. */
export function ladderChains(prof, profBySlug) {
  const start = {
    slug: prof.slug, name: prof.name, payK: prof.payK ?? null,
    cumulative_months: typeof prof.training_months === 'number' ? prof.training_months : 0,
  };
  const chains = [];
  const walk = (chain, seen) => {
    chains.push(chain);
    if (chain.length >= 6) return;
    const cur = profBySlug.get(chain[chain.length - 1].slug);
    const next = cur && Array.isArray(cur.next_steps) ? cur.next_steps : [];
    for (const step of next) {
      const p = profBySlug.get(step.slug);
      if (!p || seen.has(p.slug)) continue;
      const months = chain[chain.length - 1].cumulative_months + (typeof p.training_months === 'number' ? p.training_months : 0);
      walk([...chain, { slug: p.slug, name: p.name, payK: p.payK ?? null, cumulative_months: months }], new Set([...seen, p.slug]));
    }
  };
  walk([start], new Set([prof.slug]));
  return chains;
}

/** The floor-as-path ladder leg: the FASTEST ladder path on which a
 *  rung's typical pay reaches the floor, or null when no path reaches
 *  it within LADDER_FLOOR_YEARS. Rung zero is the profession itself —
 *  if its own pay cleared, the caller never asks (status 'clears'). */
export function ladderPathToFloor(floorK, prof, profBySlug) {
  if (typeof floorK !== 'number' || !prof || !profBySlug) return null;
  let best = null;
  for (const chain of ladderChains(prof, profBySlug)) {
    for (let i = 1; i < chain.length; i++) {
      const rung = chain[i];
      if (typeof rung.payK === 'number' && rung.payK >= floorK) {
        if (!best || rung.cumulative_months < best.months_to_floor) {
          best = {
            reaches_floor: true,
            via_slug: rung.slug,
            via_name: rung.name,
            via_pay_k: rung.payK,
            years_to_floor: Math.round((rung.cumulative_months / 12) * 10) / 10,
            months_to_floor: rung.cumulative_months,
            steps: chain.slice(0, i + 1).map((s) => ({ slug: s.slug, name: s.name, pay_k: s.payK, cumulative_months: s.cumulative_months })),
          };
        }
        break; // first reaching rung on this branch is its fastest
      }
    }
  }
  if (best && best.years_to_floor <= LADDER_FLOOR_YEARS) return best;
  return null; // reaches the floor too slowly, or never — no legal path
}

/** Slim ladder block for a result/target card: the profession's own
 *  ladder data with each step resolved against the list (name, real
 *  training months, real pay). Unresolvable steps are dropped. */
export function ladderCard(prof, profBySlug) {
  if (!prof) return { entry_steps: [], next_steps: [], prerequisites: [] };
  const resolve = (s) => {
    const p = profBySlug ? profBySlug.get(s.slug) : null;
    if (!p) return null;
    return {
      slug: p.slug,
      name: p.name,
      training_months: typeof s.training_months === 'number' ? s.training_months : (p.training_months ?? null),
      cost_k: typeof s.cost_k === 'number' ? s.cost_k : null,
      pay_k: p.payK ?? null,
    };
  };
  return {
    entry_steps: (Array.isArray(prof.entry_steps) ? prof.entry_steps : []).map(resolve).filter(Boolean),
    next_steps: (Array.isArray(prof.next_steps) ? prof.next_steps : []).map(resolve).filter(Boolean),
    prerequisites: Array.isArray(prof.prerequisites) ? prof.prerequisites : [],
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Income-floor status of one candidate vs the person's own stated
// minimum — ONE rule for every profession (floor-as-path, Matchmaker
// 2.0 core, brief 28.10.2026 §5.3). The old asymmetry is retired: it
// compared the TYPICAL figure for one job against a TOP-EARNER figure
// for another, so an RN at $98K died against a $100K floor while an
// insurance producer at $62K lived on a sourced $138K decile. Now a
// profession clears the floor when ANY leg holds, and the status
// always names which leg fired:
//   clears          — (i) typical pay is at or above the floor.
//   clears_via_ladder — (ii) typical pay is under the floor, but the
//                     profession's own ladder reaches a rung paid at
//                     or above it within LADDER_FLOOR_YEARS years of
//                     cumulative training (ladders.mjs). The card
//                     prints the path; the rung detail rides on the
//                     result as floor_path.
//   top_tier_only   — (iii) typical pay is under the floor, but the
//                     top 25% clear it (only when a sourced
//                     top-quartile figure exists).
//   top_decile_only — (iii) typical pay is under the floor, but the
//                     sourced BLS top-10% threshold clears it (audit
//                     V12, 28.10.2026: the only upper-tail figures in
//                     the project are decile thresholds from three
//                     roadmap cards — they get their own status,
//                     never the quartile label).
//   below_floor     — no leg holds: typical pay under the floor, no
//                     ladder path over it in time, and no sourced
//                     figure shows the top earners clearing it.
//   null            — no floor stated, or no pay figure to compare.
// ---------------------------------------------------------------------------
export function floorStatus(person, prof, profBySlug) {
  const floor = person ? person.income_floor_k : null;
  if (!isNum(floor) || !prof || !isNum(prof.payK)) return null;
  if (prof.payK >= floor) return 'clears';
  if (profBySlug && ladderPathToFloor(floor, prof, profBySlug)) return 'clears_via_ladder';
  const tq = isNum(prof.pay_top_quartile_k) ? prof.pay_top_quartile_k : null;
  if (tq != null && tq >= floor) return 'top_tier_only';
  const dec = isNum(prof.pay_top_decile_k) ? prof.pay_top_decile_k : null;
  if (dec != null && dec >= floor) return 'top_decile_only';
  return 'below_floor';
}

