// engine/verify.mjs
// ---------------------------------------------------------------------------
// Career Glitch Matchmaker — REPORT VERIFICATION LAYER.
//
// Pattern taken from the Meta Agents 101 workshop (27.10.2026): a fluent
// agent with no checker overclaims — in the workshop's own Session-2 audit
// the agent's memo FAILED because 4 of 5 conclusions were written wider
// than their citations. So the Wonder report is never shown raw: it first
// passes a checker that lives OUTSIDE the writer and that the writer
// cannot argue with.
//
// Two audits, both grounded in primary sources only:
//   1. NUMBERS (pure code, no LLM). Every figure in the report that
//      carries a unit — $ amounts, $K, %, 0.xx score decimals, months,
//      years — must match a checked value: the deterministic result
//      (pay / top-quartile / training / LOVE+POTENTIAL band edges, all
//      straight from the profession base), the person's own stated facts
//      (floor, current pay, budget, cushion, age), or a figure the person
//      themselves used in their own free-text answers. Anything else is
//      an unsupported figure. Separately, the result's own pay/training
//      figures are cross-checked against the profession base rows and
//      any disagreement is logged as data drift (a data-team signal —
//      the report faithfully repeating the scoring is not the report's
//      fault, so drift is recorded, not counted as a report failure).
//   2. CLAIMS ABOUT THE PERSON (one Spark call). Every statement the
//      report makes about the person — their history, resources,
//      feelings, family, skills — must be supported by their verbatim
//      free-text answers or their structured facts. Generic career
//      advice is not a claim. The checker returns the offending sentence
//      verbatim so a failed report can be corrected precisely.
//
// The orchestration (generate -> verify -> ONE regeneration with the
// exact mismatches as feedback -> verify again -> on a second failure,
// cut the unsupported sentences or show the report unsigned) lives in
// interview.mjs (generateVerifiedReport). A report is "signed" by the
// matchmaker only when verification passes; the outcome is logged on
// session.verification either way.
// ---------------------------------------------------------------------------

import { metaRespond, MODELS } from './llm.mjs';

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

// ---------------------------------------------------------------------------
// Sentence splitting (shared by the audit and the sentence cutter, so an
// issue's sentence can always be found again in the text).
// ---------------------------------------------------------------------------
export function splitSentences(text) {
  // Protect decimal points (0.55) so they are not read as sentence ends.
  const guarded = String(text).replace(/(\d)\.(\d)/g, '$1$2');
  const parts = [];
  const re = /[^.!?\n]+[.!?]*["')\]]*/g;
  let m;
  while ((m = re.exec(guarded)) !== null) {
    const s = m[0].replace(//g, '.').trim();
    if (s) parts.push(s);
  }
  return parts;
}

const normSentence = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();

/** Remove the given sentences from the text (paragraph-aware). */
export function removeSentences(text, badSentences) {
  const bad = new Set((badSentences || []).map(normSentence).filter(Boolean));
  if (!bad.size) return { text, removed: 0 };
  let removed = 0;
  const paras = String(text).split(/\n\n+/).map((p) => {
    const sents = splitSentences(p);
    if (sents.length <= 1) {
      if ((sents.length === 1 && bad.has(normSentence(sents[0]))) || bad.has(normSentence(p))) {
        removed += 1;
        return '';
      }
      return p;
    }
    const kept = sents.filter((s) => !bad.has(normSentence(s)));
    removed += sents.length - kept.length;
    return kept.join(' ');
  }).filter((p) => p.trim().length > 0);
  return { text: paras.join('\n\n'), removed };
}

// ---------------------------------------------------------------------------
// Figure extraction. Only unit-carrying figures are audited — bare counts
// ("3 jobs", "step 2") are far too noisy to police and are not where
// invented data hides.
// Types: moneyK ($K), moneyDollar ($1,200 / $850), percent, decimal
// (0.55 score-style), months, years.
// ---------------------------------------------------------------------------
export function extractFigures(text) {
  const claims = [];
  const spans = [];
  const overlaps = (a, b) => spans.some(([x, y]) => a < y && b > x);
  let m;

  // Ranges first: "0.50–0.80", "$45–60K", "50–80%", "3–6 months".
  const rangeRe = /(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)\s?([kK%]|months?|years?)?/g;
  while ((m = rangeRe.exec(text)) !== null) {
    const unit = (m[3] || '').toLowerCase();
    const v1 = parseFloat(m[1]);
    const v2 = parseFloat(m[2]);
    let type = null;
    if (unit === '%') type = 'percent';
    else if (unit === 'k') type = 'moneyK';
    else if (unit.startsWith('month')) type = 'months';
    else if (unit.startsWith('year')) type = 'years';
    else if (!unit && v1 <= 1 && v2 <= 1 && (m[1].includes('.') || m[2].includes('.'))) type = 'decimal';
    if (!type) continue; // unitless counts/steps — not audited
    spans.push([m.index, m.index + m[0].length]);
    claims.push({ type, value: v1, raw: m[0] });
    claims.push({ type, value: v2, raw: m[0] });
  }

  // Money: "$120K", "$120,000", "$850".
  const moneyRe = /\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s?([kK])?/g;
  while ((m = moneyRe.exec(text)) !== null) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    spans.push([m.index, m.index + m[0].length]);
    const raw = parseFloat(m[1].replace(/,/g, ''));
    claims.push(m[2] ? { type: 'moneyK', value: raw, raw: m[0] } : { type: 'moneyDollar', value: raw, raw: m[0] });
  }

  // Bare K figures: "120K a year".
  const bareKRe = /(?<![\d$.,])(\d+(?:\.\d+)?)\s?[kK]\b/g;
  while ((m = bareKRe.exec(text)) !== null) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    spans.push([m.index, m.index + m[0].length]);
    claims.push({ type: 'moneyK', value: parseFloat(m[1]), raw: m[0] });
  }

  // Percents.
  const pctRe = /(\d+(?:\.\d+)?)\s?%/g;
  while ((m = pctRe.exec(text)) !== null) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    spans.push([m.index, m.index + m[0].length]);
    claims.push({ type: 'percent', value: parseFloat(m[1]), raw: m[0] });
  }

  // Score-style decimals (0.55, 1.00). "30.2" cannot match (no word
  // boundary inside it); values > 1 are dropped by the checker.
  const decRe = /\b([01]\.\d{1,2})\b/g;
  while ((m = decRe.exec(text)) !== null) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    spans.push([m.index, m.index + m[0].length]);
    claims.push({ type: 'decimal', value: parseFloat(m[1]), raw: m[0] });
  }

  // Months / years.
  const monthsRe = /(\d+(?:\.\d+)?)\s?-?\s?months?\b/gi;
  while ((m = monthsRe.exec(text)) !== null) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    spans.push([m.index, m.index + m[0].length]);
    claims.push({ type: 'months', value: parseFloat(m[1]), raw: m[0] });
  }
  const yearsRe = /(\d+(?:\.\d+)?)\s?-?\s?years?\b/gi;
  while ((m = yearsRe.exec(text)) !== null) {
    if (overlaps(m.index, m.index + m[0].length)) continue;
    spans.push([m.index, m.index + m[0].length]);
    claims.push({ type: 'years', value: parseFloat(m[1]), raw: m[0] });
  }

  return claims;
}

// ---------------------------------------------------------------------------
// Ground truth: what a figure is allowed to be.
//   * candidate figures from the deterministic result (which is itself
//     built from the profession base — drift vs the base is logged);
//   * the person's own stated facts (floor, current pay, budget,
//     cushion, age, completeness);
//   * figures the person used in their own free-text answers;
//   * the 90-day plan's own months (1–3) and, in insufficient mode, the
//     exploration plan's 6/12-month retest horizon.
// ---------------------------------------------------------------------------
export function buildGroundTruth(session, professions = null) {
  const result = session.result || {};
  const person = session.person || {};
  const res = person.resources || {};
  const cands = [...(result.top3 || []), ...(result.bottom3 || [])];
  if (result.bridge_pick) cands.push(result.bridge_pick);

  const moneyK = new Set();
  const trainingMonths = new Set();
  const scores = new Set();
  for (const c of cands) {
    if (isNum(c.payK)) moneyK.add(c.payK);
    if (isNum(c.pay_top_quartile_k)) moneyK.add(c.pay_top_quartile_k);
    if (isNum(c.training_months)) trainingMonths.add(c.training_months);
    for (const b of [c.love, c.potential]) {
      if (!b) continue;
      for (const v of [b.lo, b.mid, b.hi]) if (isNum(v)) scores.add(v);
    }
  }
  if (isNum(person.income_floor_k)) moneyK.add(person.income_floor_k);
  if (isNum(person.current_income_k)) moneyK.add(person.current_income_k);
  if (isNum(res.budget_k)) moneyK.add(res.budget_k);

  const months = new Set([...trainingMonths, 1, 2, 3]); // plan months 1–3
  if (isNum(res.cushion_months)) months.add(res.cushion_months);
  const insufficient = result.mode === 'insufficient_data';
  if (insufficient) { months.add(6); months.add(12); }

  const years = new Set();
  if (isNum(person.age)) years.add(person.age);
  const percents = new Set();
  const decimals = new Set(scores);
  // NOTE: person.completeness is deliberately NOT an allowed figure —
  // it is an internal measure the report never presents, so a decimal
  // near it (0.99 ≈ 1.0) must not become "supported" by accident.
  for (const s of scores) percents.add(s * 100);

  // Figures from the person's own verbatim answers are grounded by
  // definition — their own numbers about their own life.
  const dollars = new Set();
  for (const t of session.transcript || []) {
    if (!t || t.who !== 'user' || typeof t.text !== 'string') continue;
    for (const f of extractFigures(t.text)) {
      if (f.type === 'moneyK') moneyK.add(f.value);
      else if (f.type === 'moneyDollar') dollars.add(f.value);
      else if (f.type === 'percent') percents.add(f.value);
      else if (f.type === 'decimal') decimals.add(f.value);
      else if (f.type === 'months') months.add(f.value);
      else if (f.type === 'years') years.add(f.value);
    }
  }
  // Yearly $ amounts and their monthly equivalents for every $K figure.
  for (const k of moneyK) {
    dollars.add(k * 1000);
    dollars.add(Math.round((k * 1000) / 12));
  }

  // Data drift: result figures vs the profession base rows.
  const drift = [];
  if (Array.isArray(professions)) {
    const bySlug = new Map(professions.map((p) => [p.slug, p]));
    for (const c of cands) {
      const prof = bySlug.get(c.slug);
      if (!prof) continue;
      if (isNum(c.payK) && isNum(prof.payK) && c.payK !== prof.payK) {
        drift.push(`${c.name}: scoring pay $${c.payK}K vs base $${prof.payK}K`);
      }
      if (isNum(c.training_months) && isNum(prof.training_months) && c.training_months !== prof.training_months) {
        drift.push(`${c.name}: scoring training ${c.training_months} months vs base ${prof.training_months} months`);
      }
    }
  }

  return { moneyK, dollars, percents, decimals, months, years, trainingMonths, drift, insufficient };
}

function figureSupported(gt, claim) {
  const near = (set, v, tol) => {
    for (const x of set) if (Math.abs(v - x) <= tol) return true;
    return false;
  };
  switch (claim.type) {
    case 'moneyK': return near(gt.moneyK, claim.value, 0.6);
    case 'moneyDollar': return near(gt.dollars, claim.value, Math.max(30, claim.value * 0.04));
    case 'percent': return near(gt.percents, claim.value, 1.05);
    case 'decimal': return claim.value <= 1 && near(gt.decimals, claim.value, 0.011);
    case 'months': return near(gt.months, claim.value, 0.01);
    case 'years': return gt.years.has(claim.value)
      || [...gt.trainingMonths].some((t) => t === claim.value * 12)
      || [...gt.months].some((mo) => mo === claim.value * 12);
    default: return true;
  }
}

/** Audit 1 — numbers. Pure code. Returns issue objects with sentences. */
export function auditNumbers(session, text, professions = null, gt = null) {
  const truth = gt || buildGroundTruth(session, professions);
  const issues = [];
  for (const sentence of splitSentences(text)) {
    for (const claim of extractFigures(sentence)) {
      if (!figureSupported(truth, claim)) {
        issues.push({
          kind: 'number',
          token: claim.raw,
          sentence,
          detail: `the figure "${claim.raw}" matches no checked figure (not in the job data, the scoring, or the person's own answers)`,
        });
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Audit 2 — claims about the person (one Spark call, line-format out —
// deliberately NOT JSON: report sentences contain quotes, and a strict
// JSON demand made the checker fail on its own formatting).
// ---------------------------------------------------------------------------
const CLAIM_INSTRUCTIONS = [
  'You are a strict fact-checker for a career report. You did not write the report and you cannot be argued with.',
  'Find every statement the report makes ABOUT THE PERSON — their past, jobs, money, time, documents, health, family, feelings, skills, or what they said they want — that is NOT supported by the sources given to you: their verbatim answers, the structured facts JSON, and the scoring result JSON.',
  'A statement counts as unsupported if the sources do not say it, or if the report states it more strongly or more specifically than the sources do.',
  'Measured answers ARE sources: the structured facts include scale answers the person really gave (autonomy_need and relatedness_need 0–2, riasec interests 0–10, supports 0–2, perceived_fit per job) and the scoring result holds their real score ranges and fit grades per profession. A plain-words restatement of a measured answer or a score is supported; dressing it up as a verbatim quote or a life story the person never told is not.',
  'Do NOT flag: general career advice, market facts, the report\'s opinions or recommendations, or anything the sources do support.',
  'Answer format — plain lines, NO JSON, NO markdown. If nothing is unsupported, answer with the single word NONE. Otherwise one line per unsupported statement, exactly in this shape:',
  'UNSUPPORTED | <what the report claims that the sources do not support> | <the exact sentence from the report, copied word for word>',
].join(' ');

/** The scoring result as a fact source for the claim checker: names,
 *  grades, ranges, pay — but NOT the argument prose (why_you / but /
 *  why_not lines). That prose is exactly what needs independent checking
 *  against the person's answers; handing it to the checker as a source
 *  would make the check circular. */
function slimResultFacts(result) {
  if (!result) return null;
  const slim = (c) => ({
    name: c.name,
    category: c.category,
    verdict: c.verdict ?? null,
    payK: c.payK ?? null,
    pay_top_quartile_k: c.pay_top_quartile_k ?? null,
    training_months: c.training_months ?? null,
    floor_status: c.floor_status ?? null,
    love: c.love ? { lo: c.love.lo, hi: c.love.hi } : null,
    potential: c.potential ? { lo: c.potential.lo, hi: c.potential.hi } : null,
  });
  return {
    mode: result.mode,
    income_floor_k: result.income_floor_k ?? null,
    top: (result.top3 || []).map(slim),
    bottom: (result.bottom3 || []).map(slim),
    cushion: result.bridge_pick ? slim(result.bridge_pick) : null,
  };
}

export async function sparkClaimChecker(session, text) {
  const person = session.person || {};
  const facts = {
    age: person.age ?? null,
    current_profession_name: person.current_profession_name ?? null,
    current_income_k: person.current_income_k ?? null,
    income_floor_k: person.income_floor_k ?? null,
    resources: person.resources ?? null,
    values_rank: person.values_rank ?? null,
    autonomy_need: person.autonomy_need ?? null,
    relatedness_need: person.relatedness_need ?? null,
    supports: person.supports ?? null,
    tolerances: person.tolerances ?? null,
    riasec: person.riasec ?? null,
    attempts_started: person.attempts_started ?? null,
    attempts_finished: person.attempts_finished ?? null,
    exit_pattern: person.exit_pattern ?? null,
    energy_themes: person.energy_themes ?? null,
    barriers: person.barriers ?? null,
    red_lines: person.red_lines ?? null,
    mirror_confirmed: person.mirror_confirmed ?? null,
    perceived_fit: person.perceived_fit ?? null,
    cddq_type: person.cddq_type ?? null,
    completeness: person.completeness ?? null,
  };
  const verbatim = (session.transcript || [])
    .filter((t) => t && t.who === 'user' && typeof t.text === 'string' && t.text.trim())
    .map((t) => `- "${t.text.trim()}"`);
  const input = [
    'REPORT TO CHECK:',
    text,
    '',
    'WHAT THE PERSON ACTUALLY SAID, VERBATIM:',
    verbatim.length ? verbatim.join('\n') : '(no free-text answers)',
    '',
    'STRUCTURED FACTS FROM THEIR ANSWERS (JSON):',
    JSON.stringify(facts),
    '',
    'THE SCORING RESULT — the professions, score ranges and fit grades the report is built on (JSON):',
    JSON.stringify(slimResultFacts(session.result)),
  ].join('\n');
  const { text: out } = await metaRespond({
    model: MODELS.interview,
    instructions: CLAIM_INSTRUCTIONS,
    input,
    // 6000, not the mentor-turn 2500: the input carries a full report
    // plus three source blocks, and the audit of it is long; at 2500
    // the reasoning share ate the whole budget and the response came
    // back "incomplete", and even 4000 proved tight on the deployed
    // host (observed live 27.10 — same failure shape as Day 1).
    maxOutputTokens: 6000,
    reasoning: { effort: 'low' },
  });
  const trimmed = out.trim();
  if (/^NONE\b/i.test(trimmed)) return [];
  const issues = [];
  for (const line of trimmed.split('\n')) {
    const m = line.match(/^\s*UNSUPPORTED\s*\|\s*(.+?)\s*\|\s*(.+?)\s*$/);
    if (m) issues.push({ kind: 'claim', sentence: m[2], detail: m[1] });
  }
  if (!issues.length) {
    // The checker answered in neither of the two allowed shapes — that
    // is an infrastructure failure, not a pass.
    throw new Error(`claim checker returned an unparseable answer: ${trimmed.slice(0, 200)}`);
  }
  return issues;
}

/**
 * Full verification of one report draft.
 * opts: { professions, claimChecker } — claimChecker is injectable for
 * tests; the production default is the Spark checker above.
 * A checker INFRASTRUCTURE failure is reported as claimsStatus 'error'
 * (status 'error' when nothing else failed) — never silently as a pass.
 */
export async function verifyReport(session, text, opts = {}) {
  const gt = buildGroundTruth(session, opts.professions || null);
  const numberIssues = auditNumbers(session, text, opts.professions || null, gt);
  let claimIssues = [];
  let claimsStatus = 'ok';
  let claimError = null;
  const checker = opts.claimChecker || sparkClaimChecker;
  try {
    claimIssues = await checker(session, text);
  } catch (firstErr) {
    // One retry: the checker's failure modes are transient (a response
    // truncated at the token budget, a garbled answer). A checker that
    // merely hiccuped must not cost the report its signature — but a
    // checker that fails twice is an honest 'error', never a pass.
    try {
      claimIssues = await checker(session, text);
    } catch (secondErr) {
      claimsStatus = 'error';
      claimError = secondErr.message;
    }
  }
  const ok = numberIssues.length === 0 && claimIssues.length === 0 && claimsStatus === 'ok';
  return {
    ok,
    status: ok ? 'passed' : (claimsStatus === 'error' && numberIssues.length === 0 ? 'error' : 'failed'),
    numberIssues,
    claimIssues,
    claimsStatus,
    claimError,
    drift: gt.drift,
  };
}

/** The exact mismatch list handed back to the writer for the one retry. */
export function buildVerifyFeedback(v) {
  const lines = [];
  for (const i of (v.numberIssues || []).slice(0, 8)) {
    lines.push(`- Figure problem: "${i.token}" in "${i.sentence}" — ${i.detail}. Remove the figure or replace it with the exact figure from the input JSON.`);
  }
  for (const i of (v.claimIssues || []).slice(0, 8)) {
    lines.push(`- Claim problem: the report says "${i.detail}"${i.sentence ? ` (sentence: "${i.sentence}")` : ''} — the person's answers do not support this. Remove it, or rewrite it to say only what their answers support.`);
  }
  return lines.join('\n');
}

export default { verifyReport, auditNumbers, buildGroundTruth, buildVerifyFeedback, extractFigures, splitSentences, removeSentences, sparkClaimChecker };
