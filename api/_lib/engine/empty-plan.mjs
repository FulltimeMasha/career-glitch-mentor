// engine/empty-plan.mjs
// ---------------------------------------------------------------------------
// Exploration plan for an EMPTY final set in verdict mode (gate
// smalls, 28.10.2026). Every finalist was crossed out — the stage-6
// "not mine" vetoes, the person's own hard lines, the pay floor —
// and no match is left standing. The mode reason says what happened;
// this plan is the way back, built from the nearest coded ground:
// the strongest crossed-out finalist, the closest pay miss, and the
// single line that shut the most doors. Never a dressed-up verdict,
// never padded with a side hustle (a side hustle is not a door back
// into a match — the founder's rule).
//
// Lives outside scoring.mjs for the same reason side-hustle.mjs
// does: scoring.mjs sits at the deploy per-file size cap. One-way
// import: this module never imports scoring back; scorePerson hands
// it the scored results plus the block-reason phrases it needs.
// ---------------------------------------------------------------------------

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

export function buildEmptySetPlan(person, results, { blockPhrases = {} } = {}) {
  const steps = [];
  const careers = (results || []).filter((r) => r.kind !== 'side_hustle');
  const sum = (r) => (r.love.mid ?? 0) + (r.potential.mid ?? 0);
  const vetoed = careers
    .filter((r) => r.top_block === 'perceived_fit_veto')
    .sort((a, b) => sum(b) - sum(a));
  if (vetoed.length) {
    steps.push(`Start with the "not mine" you gave fastest: ${vetoed[0].name} was the strongest finalist you crossed out. Picture one real Tuesday in it once more, slowly — if the no holds, it cost you ten minutes; if it wobbles, that is your first door back.`);
  }
  const payMiss = careers
    .filter((r) => !r.top_block && r.floor_status === 'below_floor')
    .sort((a, b) => sum(b) - sum(a))[0];
  if (payMiss && isNum(person.income_floor_k) && isNum(payMiss.payK)) {
    steps.push(`Look at the closest miss on pay: ${payMiss.name} fits your answers, but typical pay is about $${payMiss.payK}K against the $${person.income_floor_k}K minimum you named, and no checked top-earner figure clears it — so it cannot be proposed as a match. Decide whether that minimum is a survival line or a target; the answer changes what can come back.`);
  }
  const counts = {};
  for (const r of careers) {
    if (r.top_block && r.top_block !== 'perceived_fit_veto') {
      counts[r.top_block] = (counts[r.top_block] || 0) + 1;
    }
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (top) {
    steps.push(`See what your own lines shut: ${top[1]} jobs went out on one line alone — they ${blockPhrases[top[0]] || 'were ruled out by a line you set'}. If that line is a preference rather than a fact, loosening it brings real options back.`);
  }
  steps.push('Try one real task from a job you crossed out — a sample project or a shadow day — before ruling it out for good: a Tuesday you have lived beats a Tuesday you imagined.');
  steps.push('Set a 90-day check-in: whatever you tried by then becomes the facts the next match is built from.');
  return steps.slice(0, 6);
}

export default buildEmptySetPlan;
