// Result extras (Matchmaker 2.0 extension, brief §5.4-5.6) — deterministic
// decorations computed AFTER scoring from session.structured (the C6 data:
// country/state/degree answers live only in the session and never enter the
// person object or the scores). One function, called at every point where a
// result is produced, attaches:
//   result.bridge_evaluation — the foreign-degree route (bridge-eval.mjs)
//   pay_state / pay_state_k  — the person's state median (OEWS May 2024)
//                              on top-3 cards, the target card and every
//                              ladder / floor-path step that resolves to a
//                              profession with an OEWS row
//   programs[]               — real local programs on the first ladder step
//                              where a hand-collected cluster exists
//   love_pct / potential_pct — the canonical rounded display percentages
//                              of each card's score bands (scoring.bandPct),
//                              so the letter prints the card's own figures
// Scoring is never touched here; nothing in this file can move a verdict.
import { buildBridgeEvaluation, professionFieldKey } from './bridge-eval.mjs';
import { statePayFor, normalizeState, stateName, STATE_PAY_SOURCE } from './state-pay.mjs';
import { programsForStep } from './programs.mjs';
import { bandPct } from './scoring.mjs';

function attachStatePayToStep(step, bySlug, state) {
  if (!step || !step.slug) return;
  const prof = bySlug.get(step.slug);
  if (!prof) return;
  const sp = statePayFor(prof.onet_soc, state);
  if (sp) step.pay_state_k = sp.median_k;
}

function attachLadderExtras(ladder, bySlug, state) {
  if (!ladder || typeof ladder !== 'object') return;
  for (const key of ['entry_steps', 'next_steps']) {
    const steps = Array.isArray(ladder[key]) ? ladder[key] : [];
    for (const step of steps) attachStatePayToStep(step, bySlug, state);
  }
  const first = Array.isArray(ladder.entry_steps) ? ladder.entry_steps[0] : null;
  if (first && !first.programs) {
    const programs = programsForStep(first.slug, state);
    if (programs) first.programs = programs;
  }
}

function attachFloorPathExtras(floorPath, bySlug, state) {
  if (!floorPath || !Array.isArray(floorPath.steps)) return;
  for (const step of floorPath.steps) attachStatePayToStep(step, bySlug, state);
}

function attachCardExtras(card, bySlug, state) {
  if (!card || typeof card !== 'object') return;
  // Canonical display percentages for the score bands (scoring.bandPct):
  // the letter writer copies love_pct / potential_pct verbatim, so the
  // letter's ranges match the card's Chemistry figures digit for digit.
  if (card.love) card.love_pct = bandPct(card.love);
  if (card.potential) card.potential_pct = bandPct(card.potential);
  const prof = card.slug ? bySlug.get(card.slug) : null;
  if (prof) {
    const sp = statePayFor(prof.onet_soc, state);
    if (sp) { card.pay_state = sp; card.pay_state_k = sp.median_k; }
  }
  attachLadderExtras(card.ladder, bySlug, state);
  attachFloorPathExtras(card.floor_path, bySlug, state);
}

// session: the interview session ({ structured, result }); professions: the
// loaded base (array of profession objects). Mutates session.result in place
// and returns it. Safe to call more than once on the same result.
export function decorateResult(session, professions) {
  const result = session && session.result;
  if (!result || typeof result !== 'object') return result;
  const structured = session.structured && typeof session.structured === 'object' ? session.structured : {};
  const state = structured.state;
  const bySlug = new Map();
  for (const p of Array.isArray(professions) ? professions : []) {
    if (p && p.slug) bySlug.set(p.slug, p);
  }

  // State header: which state the figures below are for (display + tests).
  const code = normalizeState(state);
  if (code) {
    result.state_pay = { state: code, name: stateName(code), source: STATE_PAY_SOURCE };
  }

  for (const card of Array.isArray(result.top3) ? result.top3 : []) attachCardExtras(card, bySlug, state);
  for (const card of Array.isArray(result.bottom3) ? result.bottom3 : []) attachCardExtras(card, bySlug, state);
  if (result.bridge_pick) attachCardExtras(result.bridge_pick, bySlug, state);
  if (result.side_hustle_pick) attachCardExtras(result.side_hustle_pick, bySlug, state);
  // target_evaluation is an ARRAY of stated-target cards (targets.mjs).
  const targetCards = Array.isArray(result.target_evaluation) ? result.target_evaluation : [];
  for (const card of targetCards) attachCardExtras(card, bySlug, state);

  // Bridge evaluation for a foreign degree. The target list for the
  // field-match note: the stated target(s) first, then the top-3 careers.
  const targetSlugs = [];
  for (const card of targetCards) if (card && card.slug) targetSlugs.push(card.slug);
  for (const card of Array.isArray(result.top3) ? result.top3 : []) if (card && card.slug) targetSlugs.push(card.slug);
  const bridge = buildBridgeEvaluation(structured, targetSlugs, (slug) => {
    const prof = bySlug.get(slug);
    return prof ? professionFieldKey(prof) : null;
  });
  if (bridge) result.bridge_evaluation = bridge;
  return result;
}
