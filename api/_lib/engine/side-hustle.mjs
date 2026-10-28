// ---------------------------------------------------------------------------
// side-hustle.mjs — the ONE extra-money idea next to a verdict
// (founder's rule, 28.10.2026). Lives in its own module because
// scoring.mjs sits at the deploy per-file size cap; scorePerson calls
// pickSideHustle() with the scored results and its own small helpers
// (one-way import — this module never imports scoring back).
//
// A side hustle is never a match: the classification (professions.mjs
// SIDE_HUSTLE_SLUGS) keeps these rows out of the top-3, the bottom-3,
// the cushion and both anchors. But ONE may be offered as an idea.
// The pick is deterministic, like everything in the engine: the best
// LOVE fit among the base's side_hustle rows that the person's OWN
// stated limits allow — a startup-cost tier the named budget covers,
// and at least one spare hour a day when hours were named at all.
// Below the fit threshold, or outside the budget, the pick is null:
// an idea is offered, never pushed. The startup tiers are EDITORIAL
// bands (typical entry cost of the format, reviewed by hand — the
// same kind of table as the classification itself, recorded in
// DATA_PASS_CHANGELOG.md):
//   low  — starts on pocket money (listings, tools, stock on hand)
//   mid  — a first small batch: initial inventory, a first flip car,
//          one equipment rig (≈ $3K of headroom)
//   high — an asset purchase: a boat to restore, machines and a route,
//          a franchise fee, property or a wash/storage/laundromat buy
//          (≈ $15K of headroom — and most people stage even that)
// ---------------------------------------------------------------------------

export const SIDE_HUSTLE_STARTUP_TIER = {
  'etsy-digital-products-seller': 'low', 'print-on-demand-seller': 'low',
  'resale-flipping-business': 'low', 'online-course-creator': 'low',
  'streamer-content-creator': 'low', 'life-coach': 'low', 'wellness-coach': 'low',
  'amazon-fba-seller': 'mid', 'car-flipping': 'mid',
  'photo-booth-event-rentals-owner': 'mid',
  'boat-restoration-flipping': 'high', 'vending-atm-route-owner': 'high',
  'franchise-owner-home-services': 'high', 'laundromat-owner': 'high',
  'self-storage-owner': 'high', 'car-wash-owner': 'high',
  'real-estate-investor-flips': 'high', 'real-estate-investor-rentals': 'high',
};
const SIDE_HUSTLE_STARTUP_MIN_K = { low: 0.5, mid: 3, high: 15 };
const SIDE_HUSTLE_MIN_LOVE = 0.55;

/** Why THIS side format for THIS person — coded answers only, the
 *  same discipline as buildArgument: the strongest shared day-theme
 *  (measured profiles only — a stub's RIASEC is a formula, and a
 *  guessed theme is not a reason), the top must-have it actually
 *  delivers, and the person's own budget and hours, quoted back.
 *  helpers carries scoring.mjs's small utilities so this module
 *  stays import-free. */
function buildWhySide(person, prof, tier, helpers) {
  const { isNum, isStubProfile, valueFits, riasecKeys, dayThemes, valueLabels } = helpers;
  const lines = [];
  const res = person.resources || {};
  if (person.riasec && prof.riasec && !isStubProfile(prof)) {
    let bestL = null;
    let bestV = 0;
    for (const k of riasecKeys) {
      if (isNum(person.riasec[k]) && isNum(prof.riasec[k])) {
        const v = Math.min(person.riasec[k] / 10, prof.riasec[k]);
        if (v > bestV) { bestV = v; bestL = k; }
      }
    }
    if (bestL && bestV >= 0.6) {
      lines.push(`It sits in the part of the working day you rated highest — ${dayThemes[bestL]} — in a format you run yourself, an hour at a time.`);
    }
  }
  const topFit = valueFits(person, prof).sort((a, b) => a.rank - b.rank)[0];
  if (topFit && topFit.rank <= 2 && topFit.fit >= 0.7) {
    lines.push(`Your #${topFit.rank} must-have at work is ${valueLabels[topFit.key]} — this format hands you exactly that, on a schedule you set.`);
  }
  if (isNum(res.budget_k)) {
    if (tier === 'low') lines.push(`It starts for pocket money — well inside the $${res.budget_k}K budget you named, no loan and no leap.`);
    else if (tier === 'mid') lines.push(`The starting costs fit inside the $${res.budget_k}K budget you named — one small batch, not a big bet.`);
    else lines.push(`The starting money is real, and it still fits the $${res.budget_k}K budget you named — most people stage a format like this in, piece by piece.`);
  }
  if (isNum(res.hours_per_day) && res.hours_per_day >= 1) {
    lines.push(`It runs next to a main job, inside the ${res.hours_per_day} spare hour${res.hours_per_day === 1 ? '' : 's'} a day you named — evenings and weekends, not instead of work.`);
  }
  return lines.slice(0, 3);
}

/** The pick itself. `results` are scorePerson's scored candidates
 *  (perceived-fit already applied); `takenSlugs` already carries the
 *  top-3 / bottom-3 / cushion slugs, which the idea never repeats.
 *  The person's own red lines and the factual gates apply to an idea
 *  too (top_block / category D are excluded), and with no budget
 *  named only the pocket-money tier is offered — the engine does not
 *  spend money the person never named. Nothing clears → null. */
export function pickSideHustle(person, results, profBySlug, takenSlugs, helpers) {
  const { isNum } = helpers;
  const res = person.resources || {};
  const budgetK = isNum(res.budget_k) ? res.budget_k : null;
  const hoursNamed = isNum(res.hours_per_day) ? res.hours_per_day : null;
  const pool = results
    .filter((r) => {
      const prof = profBySlug.get(r.slug);
      if (!prof || prof.kind !== 'side_hustle') return false;
      if (takenSlugs.has(r.slug)) return false;
      if (r.category === 'D' || r.top_block) return false;
      if (!isNum(r.love.mid) || r.love.mid < SIDE_HUSTLE_MIN_LOVE) return false;
      if (hoursNamed != null && hoursNamed < 1) return false;
      const tier = SIDE_HUSTLE_STARTUP_TIER[r.slug] || 'mid';
      if (budgetK == null) return tier === 'low';
      return budgetK >= SIDE_HUSTLE_STARTUP_MIN_K[tier];
    })
    .sort((a, b) => {
      if (b.love.mid !== a.love.mid) return b.love.mid - a.love.mid;
      const pa = a.potential.mid ?? 0;
      const pb = b.potential.mid ?? 0;
      if (pb !== pa) return pb - pa;
      return a.slug < b.slug ? -1 : 1; // deterministic tie-break
    });
  const pick = pool[0] || null;
  if (!pick) return null;
  const prof = profBySlug.get(pick.slug);
  const tier = SIDE_HUSTLE_STARTUP_TIER[pick.slug] || 'mid';
  return { ...pick, startup_tier: tier, why_side: buildWhySide(person, prof, tier, helpers) };
}

export default pickSideHustle;
