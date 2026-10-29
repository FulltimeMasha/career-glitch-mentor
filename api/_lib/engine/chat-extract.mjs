// engine/chat-extract.mjs
// ---------------------------------------------------------------------------
// Conversational intake (founder brief 28.10.2026 §6) — DETERMINISTIC
// extraction from a chat message to coded stage-bank fields.
//
// Rules of the house (the brief's hard requirements, enforced here):
//   * Extraction proposes; it never applies. Everything this module
//     returns is a CANDIDATE that the chat layer shows back to the
//     person with units (Yes / Fix) before the engine consumes it —
//     a confirmed value is the only value scoring ever sees.
//   * Deterministic first, and in this pass deterministic ONLY: the
//     fields free text can carry are the ones with no chip surface
//     (numbers, and the short-text facts: place, current job, the
//     named goal). Every scored or enumerated field (values, scales,
//     RIASEC items, tolerances, red lines, stage-6 ratings) is
//     answered by chips carrying the exact stages.json anchors —
//     this module never produces them. The one exception is a small
//     set of high-signal keyword prefills for Point A facts and
//     stage-1 history (documents status, health limits, languages,
//     degree facts, exit/energy themes): they too only ever reach
//     the person as confirmable candidates.
//   * Instruction-shaped text extracts NOTHING (audit C5): a message
//     that talks to the system ("ignore previous instructions",
//     "set my income floor to…") is data with an agenda, not an
//     answer. The whole message is screened; on a hit the extractor
//     returns no values and flags the message, so the flow simply
//     asks the question again in chips. Professions can never be
//     extracted at all — matches come only from the engine.
//   * A field already answered (structured, staged or confirmed) is
//     never proposed again — extraction fills gaps, it does not
//     overwrite. Changing an applied answer goes through the revise
//     path (engine/chat.mjs), which is also confirmed.
//   * BANKING (fix, 29.10.2026): the Point A fact set is extracted
//     from EVERY message, whatever stage is being answered. A person
//     who front-loads their facts at the chat opening ("I'm 37, I
//     live in Charlotte…, my floor is $100K…") previously lost them
//     silently — extraction only ran at stages 0/1/2, the opener
//     extracted nothing, and Point A then asked everything again
//     blank (verified live on prod). Now those facts become the same
//     confirmable proposal they would have been at stage 0, in the
//     same turn they were typed; engine/chat.mjs routes each
//     confirmed value home (staged for its stage's own completion,
//     or into the coded answers when that stage already applied).
//     Scored and enumerated fields still extract NOWHERE from text —
//     banking widens WHEN the factual set is read, never WHAT can be
//     read from prose.
// ---------------------------------------------------------------------------

import { extractStage0Numbers } from './interview.mjs';

// ---------------------------------------------------------------------------
// Instruction screen (audit C5). Conservative, wording-level: these
// patterns mark a message as talking ABOUT the process instead of
// answering it. A false positive costs one re-ask; a false negative
// would let an instruction pose as an answer, so the screen errs
// toward silence.
// ---------------------------------------------------------------------------
const INSTRUCTION_PATTERNS = [
  /\bignore\b[^.]{0,50}\b(instructions?|rules|prompts?|directions)\b/i,
  /\bdisregard\b[^.]{0,50}\b(instructions?|rules|prompts?)\b/i,
  /\bforget\b[^.]{0,40}\b(instructions?|rules|prompts?)\b/i,
  /\bsystem prompt\b/i,
  /\bdeveloper mode\b/i,
  /\bjailbreak\b/i,
  /\bpretend\s+you\s+are\b/i,
  /\b(set|change|raise|lower|increase|decrease|make|fix)\s+my\s+(income|floor|budget|pay|salary|score|scores|age|hours|cushion|rating|match)\b/i,
  /\boverride\b[^.]{0,40}\b(score|scores|rules|engine|filters?|verdict)\b/i,
  /\brecommend\b[^.]{0,40}\bno matter what\b/i,
];

export function looksLikeInstruction(text) {
  const t = String(text || '');
  return INSTRUCTION_PATTERNS.some((re) => re.test(t));
}

// ---------------------------------------------------------------------------
// Place facts: US states and a country-alias table. Country/state are
// session-level facts (audit C6 — never scored); the forms stored are
// the plain display forms a person would write.
// ---------------------------------------------------------------------------
const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado',
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho',
  'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana',
  'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota',
  'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada',
  'New Hampshire', 'New Jersey', 'New Mexico', 'New York',
  'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon',
  'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington',
  'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia',
];
const US_STATE_ABBR = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina',
  ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee',
  TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'District of Columbia',
};
const stateFrom = (s) => {
  const t = String(s || '').trim();
  if (!t) return null;
  const byName = US_STATES.find((n) => n.toLowerCase() === t.toLowerCase());
  if (byName) return byName;
  if (/^[A-Z]{2}$/.test(t)) return US_STATE_ABBR[t] || null;
  return null;
};

const COUNTRY_ALIASES = new Map(Object.entries({
  'us': 'United States', 'usa': 'United States', 'u.s.': 'United States',
  'u.s.a.': 'United States', 'united states': 'United States',
  'united states of america': 'United States', 'america': 'United States',
  'uk': 'United Kingdom', 'u.k.': 'United Kingdom', 'united kingdom': 'United Kingdom',
  'britain': 'United Kingdom', 'england': 'United Kingdom',
  'canada': 'Canada', 'mexico': 'Mexico', 'germany': 'Germany', 'france': 'France',
  'spain': 'Spain', 'italy': 'Italy', 'portugal': 'Portugal', 'ireland': 'Ireland',
  'netherlands': 'Netherlands', 'belgium': 'Belgium', 'switzerland': 'Switzerland',
  'austria': 'Austria', 'poland': 'Poland', 'ukraine': 'Ukraine', 'belarus': 'Belarus',
  'russia': 'Russia', 'romania': 'Romania', 'greece': 'Greece', 'turkey': 'Turkey',
  'israel': 'Israel', 'uae': 'UAE', 'india': 'India', 'pakistan': 'Pakistan',
  'bangladesh': 'Bangladesh', 'philippines': 'Philippines', 'vietnam': 'Vietnam',
  'china': 'China', 'japan': 'Japan', 'south korea': 'South Korea', 'korea': 'South Korea',
  'australia': 'Australia', 'new zealand': 'New Zealand', 'brazil': 'Brazil',
  'argentina': 'Argentina', 'colombia': 'Colombia', 'venezuela': 'Venezuela',
  'nigeria': 'Nigeria', 'kenya': 'Kenya', 'ghana': 'Ghana', 'ethiopia': 'Ethiopia',
  'south africa': 'South Africa', 'egypt': 'Egypt', 'morocco': 'Morocco',
  'iran': 'Iran', 'iraq': 'Iraq', 'afghanistan': 'Afghanistan', 'nepal': 'Nepal',
  'sri lanka': 'Sri Lanka', 'indonesia': 'Indonesia', 'thailand': 'Thailand',
}));
const countryFrom = (s) => COUNTRY_ALIASES.get(String(s || '').trim().toLowerCase()) || null;

function parsePlace(text) {
  const out = {};
  const m = String(text).match(/\b(?:i live in|i'm living in|im living in|i am living in|living in|i live|i'm based in|based in|i reside in|residing in)\s+([^.;]{2,70})/i);
  if (m) {
    let place = m[1].replace(/\s+/g, ' ').trim().replace(/,$/, '');
    place = place.split(/\s+(?:with|where|and i)\s+/i)[0].trim();
    const parts = place.split(',').map((s) => s.trim()).filter(Boolean);
    while (parts.length) {
      const last = parts[parts.length - 1];
      const c = countryFrom(last);
      if (c) { if (!out.country) out.country = c; parts.pop(); continue; }
      const st = stateFrom(last);
      if (st) {
        if (!out.state) out.state = st;
        if (!out.country) out.country = 'United States';
        parts.pop(); continue;
      }
      break;
    }
  }
  if (!out.state) {
    const sm = String(text).match(/\bstate of\s+([A-Za-z ]{2,30})/i);
    if (sm) { const st = stateFrom(sm[1]); if (st) { out.state = st; if (!out.country) out.country = 'United States'; } }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Current profession (stage 0, optional text fact): "I'm a …", "I work
// as a …", "I run/own …". The capture is a candidate — the confirm
// card shows it verbatim before it is used, and the engine resolves
// it against the base itself (findProfessionByName).
// ---------------------------------------------------------------------------
const PROFESSION_STOPWORDS = new Set(['married', 'single', 'here', 'ready', 'looking', 'not', 'just', 'originally', 'from', 'based', 'interested', 'about', 'over', 'under']);
function cleanProfessionCapture(raw) {
  let v = String(raw || '').replace(/\s+/g, ' ').trim();
  v = v.split(/\s+(?:and i|where|since|for the last|with)\s+/i)[0].trim();
  v = v.replace(/^(?:a|an|the)\s+/i, '').trim();
  if (v.length < 3 || v.length > 60) return null;
  const first = v.split(' ')[0].toLowerCase();
  if (PROFESSION_STOPWORDS.has(first) || /^\d/.test(v)) return null;
  return v;
}
function parseCurrentProfession(text) {
  const t = String(text);
  let m = t.match(/\bi(?:'m| am)\s+an?\s+([A-Za-z][^.,;]{1,60})/i);
  if (m) { const v = cleanProfessionCapture(m[1]); if (v) return v; }
  m = t.match(/\bi\s+work\s+as\s+an?\s+([A-Za-z][^.,;]{1,60})/i);
  if (m) { const v = cleanProfessionCapture(m[1]); if (v) return v; }
  m = t.match(/\bi\s+(?:run|own|manage|operate)\s+(?:my own\s+|a\s+|an\s+|the\s+)?([A-Za-z][^.,;]{1,60})/i);
  if (m) { const v = cleanProfessionCapture(m[1]); if (v) return v; }
  return null;
}

// ---------------------------------------------------------------------------
// Point A keyword prefills (stage 0): documents status, health limits,
// languages, degree facts. High-signal phrases only — a miss costs a
// chip tap; a wrong hit is caught by the confirm card either way.
// ---------------------------------------------------------------------------
function parseDocumentsOk(lower) {
  if (/\bundocumented\b/.test(lower) || /\b(can't|cannot|can not) work legally\b/.test(lower)
    || /\bno (papers|documents|work permit)\b/.test(lower) || /\bno work (authorisation|authorization)\b/.test(lower)
    || /\bdon't have (any )?(papers|documents|a work permit)\b/.test(lower)) return 'no';
  if (/\bpapers are (only |still )?(partial|incomplete|in process)\b/.test(lower)
    || /\bdocuments are (only )?(partial|incomplete)\b/.test(lower)
    || /\bpartial(ly)? documented\b/.test(lower) || /\bsome (papers|documents) (are )?(missing|pending|in process)\b/.test(lower)
    || /\bmy (papers|documents) are in process\b/.test(lower) || /\bwork permit is (pending|in process)\b/.test(lower)) return 'partial';
  if (/\bpapers are (fine|ok|okay|in order|sorted|all set|good|valid)\b/.test(lower)
    || /\bdocuments are (fine|ok|okay|in order|sorted|valid)\b/.test(lower)
    || /\bfully documented\b/.test(lower) || /\blegally (allowed|authorised|authorized) to work\b/.test(lower)
    || /\bi have (all )?(my )?(papers|documents|work permit)\b/.test(lower)) return 'yes';
  return null;
}

function parseHealthLimits(lower) {
  const hits = [];
  if (/\b(bad|chronic|injured) back\b/.test(lower) || /\bback (pain|problems?|issues?|injury)\b/.test(lower)
    || /\bknee (pain|problems?|issues?|injury)\b/.test(lower) || /\bshoulder (pain|problems?|issues?)\b/.test(lower)
    || /\b(can't|cannot|can not) lift\b/.test(lower) || /\bno heavy lifting\b/.test(lower)
    || /\blifting (limit|restriction|problems?)\b/.test(lower)) hits.push('physical');
  if (/\bvoice (problems?|issues?|strain|damage|loss)\b/.test(lower) || /\bvocal (problems?|strain|damage)\b/.test(lower)
    || /\b(can't|cannot) talk (all day|for long|much)\b/.test(lower) || /\bthroat (problems?|issues?)\b/.test(lower)) hits.push('voice');
  if (/\bcolou?r ?blind(ness)?\b/.test(lower) || /\bvision (problems?|issues?|loss)\b/.test(lower)
    || /\bpoor (vision|eyesight)\b/.test(lower) || /\beyesight (problems?|issues?)\b/.test(lower)) hits.push('vision_color');
  if (/\bhearing (loss|problems?|issues?)\b/.test(lower) || /\bhard of hearing\b/.test(lower) || /\bdeaf\b/.test(lower)) hits.push('hearing');
  if (/\bstamina\b/.test(lower) || /\b(can't|cannot) stand (all day|for long|long)\b/.test(lower)
    || /\b(tire|tired|exhausted) (quickly|fast|easily)\b/.test(lower) || /\bget tired (quickly|fast|easily)\b/.test(lower)) hits.push('stamina');
  if (hits.length) return hits;
  if (/\bno health limits\b/.test(lower) || /\bno (physical )?limits\b/.test(lower)
    || /\bno restrictions\b/.test(lower) || /\bnothing (wrong|limiting|stopping me)\b/.test(lower)) return ['none'];
  return null;
}

function parseLanguages(lower) {
  const out = [];
  if (/\benglish\b/.test(lower)) out.push('en');
  if (/\bspanish\b/.test(lower)) out.push('es');
  if (/\brussian\b/.test(lower)) out.push('ru');
  return out.length ? out : null;
}

const DEGREE_FIELDS = [
  [/\bengineering\b|\bengineer degree\b/, 'engineering'],
  [/\bnursing\b|\bnurse degree\b/, 'nursing'],
  [/\bdentistry\b|\bdental (degree|school)\b/, 'dentistry'],
  [/\bpharmacy\b|\bpharmacist degree\b/, 'pharmacy'],
  [/\bmedicine\b|\bmedical (degree|school)\b/, 'medicine'],
  [/\blaw (degree|school)\b|\bj ?d degree\b|\bllb\b|\bjuris\b/, 'law'],
  [/\baccounting\b|\bbusiness (degree|school)\b|\beconomics (degree)?\b|\bfinance degree\b/, 'accounting_business'],
  [/\beducation (degree)?\b|\bteaching degree\b/, 'education'],
  [/\bcomputer (science|science degree)\b|\bsoftware (degree|engineering degree)\b|\bit degree\b|\binformatics\b/, 'it_computing'],
  [/\barchitecture\b|\barchitect degree\b/, 'architecture'],
];
function parseDegree(text, lower) {
  const out = {};
  const hasDegreeWord = /\b(degree|diploma|bachelor|master|ph\.?d|doctorate|associate)\b/.test(lower);
  const fieldHit = DEGREE_FIELDS.find(([re]) => re.test(lower));
  if (fieldHit) out.degree_field = fieldHit[1];
  // Country the degree was earned in + foreign status.
  const cm = String(text).match(/\bdegree\b[^.]{0,45}?\bfrom\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)/);
  let degreeCountry = null;
  if (cm) degreeCountry = countryFrom(cm[1]) || cm[1].trim();
  if (degreeCountry) out.degree_country = degreeCountry;
  if (/\bno degree\b/.test(lower) || /\bnever (got|earned|finished) a degree\b/.test(lower) || /\bdropped out\b/.test(lower)) {
    out.degree_status = 'none';
    delete out.degree_field; delete out.degree_country;
    return out;
  }
  if (hasDegreeWord || fieldHit) {
    if (degreeCountry) out.degree_status = degreeCountry === 'United States' ? 'us_degree' : 'foreign_degree';
    else if (/\b(foreign|international|overseas) (degree|diploma)\b/.test(lower)) out.degree_status = 'foreign_degree';
    else if (/\b(us|american|u\.s\.) degree\b/.test(lower) || /\bdegree from (a |the )?(us|usa|united states)\b/.test(lower)) out.degree_status = 'us_degree';
  }
  if (hasDegreeWord || fieldHit || out.degree_status) {
    if (/\bbachelor/.test(lower) || /\bundergraduate degree\b/.test(lower)) out.degree_level = 'bachelor';
    else if (/\bmaster/.test(lower)) out.degree_level = 'master';
    else if (/\bph\.?d\b/.test(lower) || /\bdoctorate\b/.test(lower) || /\bdoctoral\b/.test(lower)) out.degree_level = 'doctorate_professional';
    else if (/\bassociate/.test(lower)) out.degree_level = 'associate';
  }
  if (/\bwork/.test(lower)) {
    const ym = lower.match(/\bfor\s+(\d{1,2})\s+years?\b/) || lower.match(/(\d{1,2})\s+years?\s+(?:of\s+)?(?:experience\s+)?in the field\b/);
    if (ym) { const v = Number(ym[1]); if (v >= 0 && v <= 60) out.degree_years = v; }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stage 1: attempts counts + exit / energy keyword prefills.
// ---------------------------------------------------------------------------
function parseStage1(lower) {
  const out = {};
  let m = lower.match(/(\d{1,2})\s+(?:serious\s+)?(?:attempts?|tries|ventures)\b/);
  if (!m) m = lower.match(/\b(?:started|began|tried)\s+(\d{1,2})\b/);
  if (m) { const v = Number(m[1]); if (v >= 0 && v <= 99) out.attempts_started = v; }
  m = lower.match(/\b(?:finished|completed|saw through)\s+(\d{1,2})\b/);
  if (m) { const v = Number(m[1]); if (v >= 0 && v <= 99) out.attempts_finished = v; }
  const exits = [
    [/\bmoney (ran out|dried up)\b|\bran out of money\b|\bdidn't pay\b|\bnot enough money\b|\bpay (was|never)\b|\bcouldn't earn\b/, 'money'],
    [/\bdrained\b|\bburn(ed|t)? ?out\b|\bno energy\b|\bexhausting\b|\bkilled my energy\b|\bran out of energy\b/, 'energy'],
    [/\b(boss|manager|people in charge|management)\b/, 'boss'],
    [/\bmarket (moved|died|changed|dropped|shifted)\b|\bdemand (dropped|vanished|died)\b/, 'market'],
    [/\b(bored|boring|routine|monotonous)\b|\bwent flat\b/, 'boredom'],
    [/\ba mix\b|\bbit of everything\b|\ball of (the above|those)\b/, 'mixed'],
    [/\bnever (left|quit|started)\b|\bfirst (real )?(attempt|job|time)\b/, 'none_yet'],
  ];
  let bestExit = null; let bestIdx = Infinity;
  for (const [re, v] of exits) { const mm = lower.match(re); if (mm && mm.index < bestIdx) { bestIdx = mm.index; bestExit = v; } }
  if (bestExit) out.exit_pattern = bestExit;
  const themes = [
    [/\b(people|helping (people|others|clients|customers)|clients|customers|patients)\b/, 'people'],
    [/\b(building|build things|making things|built)\b/, 'building'],
    [/\b(problem|puzzles?|figuring|solving)\b/, 'problem_solving'],
    [/\b(creative|creating|design(ing)?)\b/, 'creative'],
    [/\b(teaching|explaining|coaching|mentoring)\b/, 'teaching'],
    [/\b(numbers|spreadsheets|data)\b/, 'numbers'],
    [/\b(outdoors|outside|fresh air)\b/, 'outdoors'],
    [/\b(selling|sales|closing deals)\b/, 'selling'],
  ];
  const th = themes.filter(([re]) => re.test(lower)).map(([, v]) => v);
  if (th.length) out.energy_themes = th;
  return out;
}

// ---------------------------------------------------------------------------
// Stage 2: the named goal. Labelled statements first; a short bare
// message IS the goal ("registered nurse" typed on its own) — either
// way it lands on the confirm card before the engine ever sees it,
// and the deterministic matcher (engine/target-match.mjs) resolves it
// against the base, never this layer.
// ---------------------------------------------------------------------------
function parseStatedTarget(text) {
  const t = String(text);
  const m = t.match(/\b(?:aiming (?:at|for)|my (?:dream job|goal|target) is|dream job is|goal is|target is|i want to (?:be|become|work as)|i'd like to (?:be|become)|i hope to (?:be|become))\s+(?:an?\s+|the\s+)?([A-Za-z][^.,;]{1,60})/i);
  if (m) {
    const v = m[1].replace(/\s+/g, ' ').trim().replace(/^(?:a|an|the)\s+/i, '')
      .replace(/\s+(?:one day|someday|some day|eventually|in the future|next|please)$/i, '').trim();
    if (v.length >= 2) return v;
  }
  const whole = t.replace(/\s+/g, ' ').trim();
  if (whole.length >= 2 && whole.length <= 80 && !/\d/.test(whole) && !/[?!]/.test(whole)) return whole.replace(/[.\s]+$/, '');
  return null;
}

// ---------------------------------------------------------------------------
// Entry point. `stageId` is the stages.json stage the session is
// answering NOW (0..5), or 'cddq'. `have` is the set of fields already
// answered anywhere (structured ∪ staged ∪ this call's chips) —
// extraction fills gaps only. Returns { values, instructionLike }.
//
// The stage's own extractor runs first (history at stage 1, the named
// goal at stage 2); then the Point A fact set is BANKED from the same
// message whatever the stage (see the banking rule above). The two
// sets are field-disjoint, and the gap rule keeps either from ever
// re-proposing an answered field.
// ---------------------------------------------------------------------------
export function extractChatAnswers(stageId, rawText, have = new Set()) {
  const text = String(rawText || '');
  if (!text.trim()) return { values: {}, instructionLike: false };
  if (looksLikeInstruction(text)) return { values: {}, instructionLike: true };
  const lower = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  const out = {};
  const put = (field, v) => { if (v !== null && v !== undefined && !have.has(field)) out[field] = v; };

  if (stageId === 1) {
    const s1 = parseStage1(lower);
    for (const [k, v] of Object.entries(s1)) put(k, v);
  } else if (stageId === 2) {
    put('stated_target', parseStatedTarget(text));
  }
  // Banking: the Point A facts are read from EVERY message — the
  // opener, the scored stages, the mirror. Everything scored or
  // enumerated (values, scales, RIASEC items, tolerances, red lines,
  // stage-6 ratings) still arrives by chips only: no parser below
  // can produce those fields.
  const nums = extractStage0Numbers(text);
  for (const [k, v] of Object.entries(nums)) put(k, v);
  const place = parsePlace(text);
  put('country', place.country); put('state', place.state);
  put('current_profession_name', parseCurrentProfession(text));
  put('documents_ok', parseDocumentsOk(lower));
  put('health_limits', parseHealthLimits(lower));
  put('languages', parseLanguages(lower));
  const deg = parseDegree(text, lower);
  for (const [k, v] of Object.entries(deg)) put(k, v);
  return { values: out, instructionLike: false };
}
