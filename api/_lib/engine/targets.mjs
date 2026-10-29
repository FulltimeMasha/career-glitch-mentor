// engine/targets.mjs
// ---------------------------------------------------------------------------
// STATED-TARGET EVALUATION (Matchmaker 2.0 core, brief 28.10.2026
// §5.1): every job the person NAMED as their goal is evaluated FIRST
// and gets its own card in the result — whether or not it can be
// proposed. The card carries the base verdict, the person's own
// category for it, its floor status WITH the path when the path is
// what clears it, and — when the goal is ruled out — the exact filter
// that ruled it out, by name. No silent drops, no generic wording.
//
// One-way satellite of scoring.mjs (same pattern as side-hustle.mjs):
// scoring hands over the scored results and the phrase tables; this
// module never imports scoring. Matching is target-match.mjs —
// deterministic server code, no LLM anywhere in the chain.
// ---------------------------------------------------------------------------

import { matchStatedTarget } from './target-match.mjs';
import { ladderChains, ladderCard } from './ladders.mjs';

// Human names for the machine filters that can rule a target out.
// The card names the filter — "the no-nights line you set", not
// "some criteria were not met".
const FILTER_NAMES = {
  base_verdict_no: 'the market verdict (our base says NO to starting this job)',
  training_red_line: 'your own training-length limit',
  public_voice_red_line: 'your no-public-voice line',
  kids_red_line: 'your no-children line',
  nights_red_line: 'your no-nights line',
  relocation_red_line: 'your no-relocation line',
  physical_limit_gate: 'the physical limit you named',
  age_gate: 'a legal age gate for this licence',
  perceived_fit_veto: 'your own "not mine" at the real-Tuesday check',
  below_floor: 'your income floor, with no pay path over it',
  documents_gate: 'the documents gate (you said you cannot be licensed right now)',
  voice_gate: 'the voice limit you named as a health fact',
  not_a_career: 'the career rule (a side hustle is not a job anyone hires you into)',
  category_d: 'a factual gate (documents or a stated health limit)',
};

export function buildTargetEvaluation(person, results, professions, helpers) {
  const names = Array.isArray(person && person.stated_target_names) ? person.stated_target_names : [];
  if (!names.length) return [];
  const { blockPhrases = {} } = helpers || {};
  const profBySlug = new Map((professions || []).map((p) => [p.slug, p]));
  const resultBySlug = new Map((results || []).map((r) => [r.slug, r]));
  const topSlugs = new Set(helpers && helpers.topSlugs ? helpers.topSlugs : []);

  const cards = [];
  for (const requested of names) {
    const m = matchStatedTarget(requested, professions || []);
    if (!m.matched) {
      cards.push({
        requested,
        matched: false,
        slug: null,
        name: null,
        note: 'No exact match for this name exists in the checked base — it was not silently swapped for a different job.',
        nearest_field: m.nearest_field,
      });
      continue;
    }
    const prof = profBySlug.get(m.slug);
    const r = resultBySlug.get(m.slug);
    if (!prof || !r) continue; // cannot happen: the matcher reads the same list
    const ruledOut = [];
    const addBlock = (filter) => {
      if (!filter || ruledOut.some((b) => b.filter === filter)) return;
      ruledOut.push({ filter, name: FILTER_NAMES[filter] || filter, detail: blockPhrases[filter] || null });
    };
    addBlock(r.top_block);
    if (r.category === 'D') {
      if ((r.flags || []).includes('documents_gate')) addBlock('documents_gate');
      if ((r.flags || []).includes('voice_gate')) addBlock('voice_gate');
      if (!ruledOut.length) addBlock('category_d');
    }
    if (r.floor_status === 'below_floor') addBlock('below_floor');
    if (prof.kind === 'side_hustle') addBlock('not_a_career');

    const seatable = !r.top_block && r.category !== 'D' && r.floor_status !== 'below_floor' && prof.kind !== 'side_hustle';
    const ladder = ladderCard(prof, profBySlug);
    cards.push({
      requested,
      matched: true,
      matched_via: m.via,
      slug: prof.slug,
      name: prof.name,
      verdict: prof.verdict ?? null,
      category: r.category,
      love: r.love,
      potential: r.potential,
      pay_k: r.payK,
      training_months: r.training_months,
      floor_status: r.floor_status,
      floor_path: r.floor_path || null,
      ruled_out_by: ruledOut,
      seatable,
      in_top3: topSlugs.has(prof.slug),
      ladder,
      entry_step: ladder.entry_steps.length ? ladder.entry_steps[0] : null,
    });
  }
  return cards;
}

export default buildTargetEvaluation;

// ---------------------------------------------------------------------------
// applyTargetAnchor — the SELECTION half of the stated-target rule
// (the evaluation half is buildTargetEvaluation above; both live here
// so scoring.mjs stays under the deploy upload cap — the same reason
// pg.js exists). Mutates ctx.top3 / ctx.usedFamilies in place and
// returns { slugs, info }: the protected target seats and the record
// the set reason reads. ctx: { person, list, results, selectionPool,
// sortable, top3, usedFamilies, bridgeAnchorSlug, profBySlug, frozen }.
export function applyTargetAnchor(ctx) {
  const { person, list, results, selectionPool, sortable, top3, usedFamilies, bridgeAnchorSlug, profBySlug, frozen } = ctx;
// ---- Stated-target anchor (Matchmaker 2.0 core, brief §5.1). A job
// the person NAMED as their goal (stage 2 → person.stated_target_names,
// matched deterministically by target-match.mjs) is evaluated first —
// its card is target_evaluation in the return — and when the person's
// own lines allow it, it is PRESENT in the three: presence, never a
// promotion, exactly like the direction anchor below. When the named
// job itself is ruled out, the seat goes to the nearest seatable rung
// of its OWN ladder — the next rungs up first (the named road,
// continued), then the closest rung below — because a ladder is the
// honest form of a blocked goal: the seated card carries the whole
// ladder, first step included. When no rung can be proposed either,
// nothing is forced and the target card says which filter ruled the
// goal out. Skipped under the stage-6 freeze, like every selection
// pass: the rated set is closed by definition.
const targetAnchoredSlugs = new Set();
let targetAnchorInfo = null;
if (!frozen) {
  const targetNames = Array.isArray(person.stated_target_names) ? person.stated_target_names : [];
  if (targetNames.length) {
    targetAnchorInfo = { anchored: [] };
    const resultFor = (slug) => results.find((r) => r.slug === slug);
    const seatable = (r) => !!r && selectionPool.includes(r) && r.floor_status !== 'below_floor';
    const seat = (cand, requested, via) => {
      if (top3.length >= 3) {
        const byWeakness = top3
          .filter((r) => r.slug !== bridgeAnchorSlug && !targetAnchoredSlugs.has(r.slug))
          .sort((a, b) => sortable.indexOf(b) - sortable.indexOf(a));
        const victim = byWeakness.find((r) => r.family === cand.family) || byWeakness[0];
        if (!victim) return false;
        top3.splice(top3.indexOf(victim), 1);
        usedFamilies.delete(victim.family);
      }
      top3.push(cand);
      usedFamilies.add(cand.family);
      top3.sort((a, b) => {
        if (a.slug === bridgeAnchorSlug) return -1;
        if (b.slug === bridgeAnchorSlug) return 1;
        return sortable.indexOf(a) - sortable.indexOf(b);
      });
      targetAnchoredSlugs.add(cand.slug);
      cand.flags.push('target_anchor');
      return true;
    };
    for (const requested of targetNames) {
      const m = matchStatedTarget(requested, list);
      if (!m.matched) continue;
      const targetProf = profBySlug.get(m.slug);
      if (!targetProf) continue;
      const targetResult = resultFor(m.slug);
      if (targetResult && top3.includes(targetResult)) {
        targetAnchoredSlugs.add(m.slug); // ranked in on merit — protect the seat
        continue;
      }
      if (seatable(targetResult)) {
        if (seat(targetResult, requested, 'named_target')) {
          targetResult.argument.why_you.unshift(`You named ${targetProf.name} itself as the job you are aiming at — it passed every line you set, so it stands in your three at its honest grade, not a promoted one.`);
          targetAnchorInfo.anchored.push({ requested, slug: m.slug, name: targetProf.name, via: 'named_target' });
        }
        continue;
      }
      // The named door is shut: walk its ladder for a seatable rung.
      const rungSlugs = [];
      for (const chain of ladderChains(targetProf, profBySlug)) {
        for (let i = 1; i < chain.length; i++) if (!rungSlugs.includes(chain[i].slug)) rungSlugs.push(chain[i].slug);
      }
      const entry = Array.isArray(targetProf.entry_steps) ? targetProf.entry_steps : [];
      for (let i = entry.length - 1; i >= 0; i--) if (!rungSlugs.includes(entry[i].slug)) rungSlugs.push(entry[i].slug);
      for (const slug of rungSlugs) {
        const cand = resultFor(slug);
        if (!cand || top3.includes(cand) || !seatable(cand)) continue;
        if (seat(cand, requested, 'ladder_rung')) {
          cand.argument.why_you.unshift(`You named ${targetProf.name} as the job you are aiming at. That exact door is shut by your own lines — so this seat goes to ${cand.name}, a rung of its own ladder that your lines do allow. The whole ladder, first step included, is printed on the card.`);
          targetAnchorInfo.anchored.push({ requested, slug, name: cand.name, via: 'ladder_rung' });
        }
        break;
      }
    }
  }
}
  return { slugs: targetAnchoredSlugs, info: targetAnchorInfo };
}

// ---------------------------------------------------------------------------
// Direction-field machinery + block-reason phrases, moved out of
// scoring.mjs (Matchmaker 2.0 core, 28.10.2026) for one reason only:
// scoring.mjs sits at the deploy upload cap (~95KB per file), and
// this pass's target machinery had to live somewhere. These tables
// are the vocabulary of "the field the person named" and "the filter
// that ruled a door out" — the same subject as the target cards
// below. scoring.mjs imports them back and re-exports the two names
// it used to export (TARGET_FIELDS, professionField, professionFamily).
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Profession families for the top-3 diversity rule. A family is the base
// category, EXCEPT the creator economy, which the base splits across
// 'online' and 'creative' while being one job wearing many hats (streaming,
// courses, UGC, content strategy…). At most ONE profession per family may
// appear in a top-3 — three wrappers of the same job are not three options.
// ---------------------------------------------------------------------------
const CREATOR_CLUSTER = new Set([
  'streamer-content-creator', 'online-course-creator', 'ugc-creator',
  'content-strategist', 'copywriter', 'podcast-producer', 'video-editor',
  'brand-strategist', 'videographer', 'voice-actor', 'photographer',
  'wedding-photographer',
]);

export function professionFamily(prof) {
  if (!prof) return 'other';
  if (CREATOR_CLUSTER.has(prof.slug)) return 'creator';
  return prof.category || `solo:${prof.slug}`;
}

export const FAMILY_LABELS = {
  creator: 'online content creation',
  online: 'online and digital work',
  health: 'healthcare',
  trades: 'the trades',
  creative: 'creative work',
  beauty: 'beauty',
  food: 'food',
  people: 'working with people',
  transport: 'transport',
  business: 'business',
};

// ---------------------------------------------------------------------------
// FIELD CLUSTERS for the DIRECTION ANCHOR (founder decision, 27.10.2026).
// Stage 2 asks the person which fields they are seriously aiming at
// (person.target_fields, values below). Membership of a profession in a
// field comes from data the profession already carries: its base
// category for the clean categories, the creator cluster for creator
// work, and an explicit override map for the professions whose category
// misfiles their field (the 'people', 'online' and 'business' buckets
// mix fields by construction — care roles sit in 'people', professions
// practised online sit in 'online'). The override map is editorial and
// reviewed by hand, the same way the verdicts are.
// ---------------------------------------------------------------------------
export const TARGET_FIELDS = [
  'health', 'trades', 'tech', 'creative', 'business',
  'education', 'transport', 'food', 'beauty', 'public_service',
];

export const DIRECTION_FIELD_LABELS = {
  health: 'healthcare',
  trades: 'the trades, construction and engineering',
  tech: 'tech and IT',
  creative: 'creative and media work',
  business: 'business and finance',
  education: 'education, teaching and coaching',
  transport: 'logistics and transport',
  food: 'hospitality and food',
  beauty: 'beauty and personal care',
  public_service: 'public service and safety',
};

const FIELD_OVERRIDES = {
  // 'people' → healthcare: care and therapy roles filed under 'people'.
  'psychologist-therapist': 'health', 'substance-abuse-counselor': 'health',
  'marriage-and-family-therapist': 'health', 'rehabilitation-counselor': 'health',
  'school-psychologist': 'health', 'community-health-worker': 'health',
  'child-life-specialist': 'health', 'aba-therapist-kids': 'health',
  'social-worker': 'health', 'elder-care-companion-pro': 'health',
  // 'people' → education: teaching, instruction and coaching roles.
  'school-teacher': 'education', 'preschool-teacher': 'education',
  'special-education-teacher': 'education', 'school-counselor': 'education',
  'private-tutor-in-person': 'education',
  'esl-adult-literacy-teacher': 'education', 'career-and-technical-education-teacher': 'education',
  'music-instructor': 'education', 'dance-instructor': 'education',
  'swim-instructor': 'education', 'driving-instructor': 'education',
  'corporate-trainer': 'education', 'sports-coach': 'education',
  'fitness-trainer': 'education', 'yoga-pilates-instructor': 'education',
  'life-coach': 'education', 'wellness-coach': 'education',
  // 'people' → public service.
  'firefighter': 'public_service', 'police-officer': 'public_service',
  'probation-officer': 'public_service', 'emergency-management-director': 'public_service',
  // 'online' → creative: design and media/marketing work (the rest of
  // 'online' defaults to tech below).
  'ux-ui-designer': 'creative', 'web-designer': 'creative', 'game-designer': 'creative',
  'motion-designer-3d-artist': 'creative', 'seo-specialist': 'creative',
  'ppc-paid-ads-specialist': 'creative', 'smm-manager': 'creative',
  'crm-email-marketer': 'creative', 'pr-specialist': 'creative',
  // 'online' → business: professions practised online, not tech work.
  'accountant': 'business', 'enrolled-agent-tax-pro': 'business',
  'bookkeeper-advisory': 'business', 'financial-analyst': 'business',
  'insurance-agent': 'business', 'mortgage-broker': 'business',
  'b2b-sales-rep': 'business', 'recruiter': 'business', 'hr-specialist': 'business',
  'project-manager': 'business', 'operations-manager': 'business',
  'e-commerce-manager': 'business', 'real-estate-agent': 'business',
  'luxury-real-estate-agent': 'business', 'business-consultant': 'business',
  'customer-success-manager': 'business', 'market-researcher': 'business',
  'virtual-assistant': 'business', 'actuary': 'business',
  // 'online' → health / education / trades, or no cluster at all.
  'medical-coder': 'health', 'health-informatics-specialist': 'health',
  'online-tutor': 'education', 'instructional-designer': 'education',
  'mechanical-engineer': 'trades', 'electrical-engineer': 'trades',
  'translator-interpreter': null, 'paralegal': null, 'grant-writer': null,
  // 'business' → health: a salaried role inside healthcare delivery
  // (owner/operator businesses keep the business field — their work is
  // running a company, whatever sector it sells into).
  'medical-health-services-manager': 'health',
  // 'creative' → hospitality / public service.
  'event-planner': 'food', 'wedding-planner': 'food',
  'urban-and-regional-planner': 'public_service',
};

const CATEGORY_FIELDS = {
  health: 'health', trades: 'trades', creative: 'creative', transport: 'transport',
  food: 'food', beauty: 'beauty', business: 'business', online: 'tech',
  // 'people' has NO default: its members join a field only via
  // FIELD_OVERRIDES above — the bucket genuinely mixes fields.
};

/** The direction-anchor field a profession belongs to, or null. */
export function professionField(prof) {
  if (!prof) return null;
  if (Object.prototype.hasOwnProperty.call(FIELD_OVERRIDES, prof.slug)) return FIELD_OVERRIDES[prof.slug];
  if (CREATOR_CLUSTER.has(prof.slug)) return 'creative';
  return CATEGORY_FIELDS[prof.category] ?? null;
}

// Plain phrases for why in-field candidates were ruled out — used when
// the direction anchor cannot fire because every door into the named
// field is blocked by the person's own lines.
export const BLOCK_REASON_PHRASES = {
  base_verdict_no: 'carried a hard NO from the market base',
  training_red_line: 'needed training longer than the limit you set',
  public_voice_red_line: 'crossed your no-public-voice line',
  kids_red_line: 'crossed your no-children line',
  nights_red_line: 'crossed your no-nights line',
  relocation_red_line: 'crossed your no-relocation line',
  physical_limit_gate: 'collided with the physical limit you named',
  age_gate: 'sat behind a legal age limit',
  perceived_fit_veto: 'got your own "not mine"',
  below_floor: 'paid under the minimum you set, with no checked top-earner figure clearing it',
};

