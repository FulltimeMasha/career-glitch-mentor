// engine/playground.mjs
// ---------------------------------------------------------------------------
// Jobs Playground — "a date before the plan". A playable one-real-day
// preview of ONE profession, built ONLY from that profession's own data:
// the O*NET task list on the profession object (professions.mjs `tasks`,
// null where no clean O*NET match exists) and its attribute vector.
//
// PRESENTATION ONLY — the same rule as the report: the deterministic
// scoring engine owns every number, and nothing here touches it. The
// playground returns six episodes for the person to live through; how
// the day FELT is the user's own tap data, collected and summarised
// client-side. No output of this module moves a verdict, a band or a
// category, ever.
//
// Generation: Muse Spark (the interview model) writes the day from the
// real task list. If Spark is unavailable, rejects the call, or answers
// off-contract — or the profession has no task list at all — a
// deterministic template day is built from the same data instead. The
// feature never dead-ends and never invents a task the job doesn't have.
// ---------------------------------------------------------------------------

import { metaRespond, MODELS } from './llm.mjs';

export const EPISODE_KINDS = ['core', 'routine', 'people', 'craft', 'crisis', 'paperwork'];

// The day's fixed arc for the template path: real work first, people,
// the mandatory routine block after the midpoint, hands-on craft, the
// thing that goes wrong, paperwork to close. Exactly one routine.
const TEMPLATE_ARC = [
  { time: '7:40 AM', kind: 'core' },
  { time: '9:05 AM', kind: 'people' },
  { time: '10:50 AM', kind: 'craft' },
  { time: '12:40 PM', kind: 'routine' },
  { time: '2:30 PM', kind: 'crisis' },
  { time: '4:15 PM', kind: 'paperwork' },
];

const KIND_TITLES = {
  core: 'The core work',
  people: 'People time',
  craft: 'Hands on',
  routine: 'The routine block',
  crisis: 'It goes wrong',
  paperwork: 'The paperwork',
};

// One framing sentence appended to a real task on the template path —
// presentation only, it adds no fact about the job.
const KIND_FRAMING = {
  core: 'This is the work the whole job is built around.',
  people: 'Real people, real reactions — this is the human side of the job, as it actually feels.',
  craft: 'Skilled, hands-on work — the part where being good at it shows.',
  routine: 'The same again tomorrow. This block repeats more than any other part of the job.',
  crisis: 'Unplanned and unavoidable — how the job feels when it pushes back.',
  paperwork: "Nobody's favourite part. It still has to be done, every day.",
};

const PEOPLE_WORDS = /\b(client|clients|customer|customers|patient|patients|student|students|individual|individuals|others|staff|employee|employees|team|public|visitor|visitors|user|users|personnel|person|people)\b/i;
const PAPER_WORDS = /\b(report|reports|record|records|document|documents|documentation|file|files|form|forms|data|schedule|schedules|correspondence|log|logs)\b/i;
const CRISIS_WORDS = /\b(problem|problems|issue|issues|emergency|emergencies|complaint|complaints|malfunction|repair|repairs|inspect|inspections|investigate|resolve|malfunctions|defect|defects)\b/i;

// ---------------------------------------------------------------------------
// Template day — deterministic, built only from the profession's own
// tasks (when it has them) and its attribute vector (when it doesn't).
// ---------------------------------------------------------------------------
function pickTask(tasks, used, re) {
  for (const t of tasks) {
    if (!used.has(t) && re.test(t)) { used.add(t); return t; }
  }
  for (const t of tasks) {
    if (!used.has(t)) { used.add(t); return t; }
  }
  return null;
}

// First unused task that does NOT read as paperwork — for the core and
// craft slots, whose framing promises the work itself, not the write-up.
function pickWorkTask(tasks, used) {
  for (const t of tasks) {
    if (!used.has(t) && !PAPER_WORDS.test(t)) { used.add(t); return t; }
  }
  return pickTask(tasks, used, /$^/);
}

function genericText(kind, prof) {
  const a = prof.attrs || {};
  const name = prof.name;
  switch (kind) {
    case 'core':
      return `You start the main work of a ${name} — the core of the job, done properly, start to finish. No audience and no shortcut: this is the thing everything else in the day supports. ${KIND_FRAMING.core}`;
    case 'people':
      return (a.people || 0) >= 1
        ? `People need things from you — questions, help, decisions. You deal with them one at a time, the way this job always does. ${KIND_FRAMING.people}`
        : `A quiet stretch: mostly you and the work. Human contact in this job is the exception, not the rule — long solo runs are the normal texture of the day. ${KIND_FRAMING.people}`;
    case 'craft':
      if ((a.hands || 0) >= 1) return `Hands-on time. You make, fix or adjust the real thing in front of you — the part of the job you can touch, and the part where skill is visible. ${KIND_FRAMING.craft}`;
      if ((a.tech || 0) >= 1) return `Tools-and-systems time: you work the equipment and the screens of the trade until the thing in front of you does what it should. ${KIND_FRAMING.craft}`;
      return `Focused work time — the skilled part of the day, where doing it well is the whole point. ${KIND_FRAMING.craft}`;
    case 'routine':
      return `The same block as yesterday: the repeating tasks that never make the brochure. You do them again, carefully, because skipping them is exactly how mistakes happen. ${KIND_FRAMING.routine}`;
    case 'crisis':
      return `Something goes wrong — it always does, some days. A problem lands on you that was in nobody's plan, and sorting it out is now your job. ${KIND_FRAMING.crisis}`;
    case 'paperwork':
      return `End of day: notes, records, the write-up of everything you did. The work isn't finished until it's written down. ${KIND_FRAMING.paperwork}`;
    default:
      return `You do the work of a ${name}. ${KIND_FRAMING.core}`;
  }
}

// The game layer on the template path: ONE canned choice (someone asks
// for something extra — agree / decline politely / offer an alternative)
// and ONE canned 'phrase' trial (the professional check-in reply). Both
// are generic on purpose: the template path has no task detail to draw
// on, so it invents no job facts — only social moments every job has.
function templateChoice(prof) {
  const peopley = ((prof.attrs || {}).people || 0) >= 1;
  return {
    prompt: peopley
      ? "Someone you're working with asks you to take on one more thing — extra work, on top of everything already in front of you today."
      : "A message lands: could you also take on one more thing today — extra work, on top of everything already in front of you?",
    options: [
      { label: 'Say yes and fit it in', outcome: 'You fit it in. The day runs longer, the work gets done properly — and the person who asked remembers that you said yes.' },
      { label: 'Say no, politely', outcome: 'You say no, and you say why. A short, slightly awkward moment — then the rest of your day stays yours.' },
      { label: 'Offer a smaller version', outcome: "You offer the part you can actually do, and by when. Most days that's accepted — saying yes to everything is how this job burns people out." },
    ],
  };
}

const TEMPLATE_TRIAL = {
  type: 'phrase',
  title: 'The check-in',
  says: "Hey — how's that thing coming along that you were working on?",
  options: [
    "It's on track. I'll flag it straight away if I need help or it slips.",
    'Fine.',
    "Honestly? Don't ask. It's a disaster.",
  ],
  correct: 0,
  explain: 'The professional reply says where things stand and what happens next — short, honest, no drama.',
};

export function templateDay(prof) {
  const tasks = Array.isArray(prof.tasks) ? prof.tasks.filter((t) => typeof t === 'string' && t.trim()) : [];
  const used = new Set();
  const episodes = TEMPLATE_ARC.map(({ time, kind }) => {
    let task = null;
    if (kind === 'people') task = pickTask(tasks, used, PEOPLE_WORDS);
    else if (kind === 'paperwork' || kind === 'routine') task = pickTask(tasks, used, PAPER_WORDS);
    else if (kind === 'crisis') task = pickTask(tasks, used, CRISIS_WORDS);
    else task = pickWorkTask(tasks, used); // core/craft: the work itself first
    const text = task ? `${task} ${KIND_FRAMING[kind]}` : genericText(kind, prof);
    const ep = { time, title: KIND_TITLES[kind], text, kind };
    if (kind === 'people') ep.choice = templateChoice(prof); // canned choice, never on the routine block
    if (kind === 'craft') ep.trial = TEMPLATE_TRIAL; // canned phrase trial, on a different episode
    return ep;
  });
  return { slug: prof.slug, name: prof.name, episodes, pay_k: typeof prof.payK === 'number' ? prof.payK : null, source: 'template' };
}

// ---------------------------------------------------------------------------
// LLM day (Muse Spark) — strict output contract, validated before use.
// Anything off-contract falls back to the template day.
// ---------------------------------------------------------------------------
const DAY_INSTRUCTIONS = [
  'You write a playable "one real day" preview of a profession for a career matchmaker. Warm, plain-spoken, zero hype.',
  'Second person, present tense ("You arrive…", "You sit down…"). Every episode is a small lived moment of 2-4 short sentences.',
  'Build EVERY episode only from the real tasks in the input list: expand one task (or a tight pair) into the moment. Never invent tasks, duties, tools, workplaces, people-types, pay or hours that the task list does not imply.',
  'Exactly 6 episodes, in time order through one workday, each with a time label like "7:40 AM".',
  'Each episode has a kind from this list only: core, routine, people, craft, crisis, paperwork.',
  'Exactly ONE episode has kind "routine" — the boring, repeating block of the job. Make it honestly dull: same as yesterday, same tomorrow. Do not dramatise it.',
  'At most one "crisis" and at most one "paperwork" episode. A title is 2-5 plain words naming the moment.',
  'Plain words only: no internal terms, no scores, no percentages, no personality labels, no promises about the reader\'s future.',
  'DECISIONS: Exactly 2 episodes carry a decision point in a field "choice": {"prompt":"...","options":[{"label":"...","outcome":"..."}]} with 2-3 options. Put one on the crisis episode and the other on a people or core episode — NEVER on the routine episode. The prompt is a real decision moment inside that episode\'s task. Each outcome is 1-2 plain sentences showing what actually happens next if the reader picks it: concrete, honest, no judgement of the reader.',
  'HANDS-ON TRIAL: Exactly 1 episode carries a mini-trial in a field "trial" — pick an episode that is NOT the routine episode, and prefer one that has no choice. Exactly one of these three shapes: {"type":"order","title":"...","items":["step","step","step","step"],"correct":[0,1,2,3],"explain":"..."} — the items are the steps of ONE real task from the list, in a SHUFFLED order, and "correct" lists the item indices in the order the steps really happen; {"type":"spot","title":"...","scenario":"...","options":["...","...","..."],"correct":0,"explain":"..."} — the scenario (2-3 sentences, from the real tasks) describes a situation where one thing is wrong or needs attention first, and exactly one option names it; {"type":"phrase","title":"...","says":"...","options":["...","...","..."],"correct":0,"explain":"..."} — "says" is what a person in the scene says to the reader, the options are three possible replies, exactly one is the professional one. All trial content strictly from the real task list. "explain" is ONE plain sentence.',
  'CHAT: A people or crisis episode MAY carry a field "chat": [{"from":"boss","text":"..."}] — 2-4 short chat messages (from is one of boss, client, colleague, patient, customer) that make the moment a real conversation. When an episode has a chat, its "text" is just the 1-2 sentence scene intro and the chat carries the moment. Use a chat only where a conversation is the natural shape of the task.',
  'Output ONLY a JSON object, no markdown fences, no commentary: {"episodes":[{"time":"7:40 AM","title":"...","text":"...","kind":"core"}]} — with "choice", "trial" and "chat" fields added on the episodes that carry them, exactly as specified above.',
].join(' ');

const CHAT_FROM = ['boss', 'client', 'colleague', 'patient', 'customer'];

// Each validator returns a normalised copy, or null when off-contract.
// Any failure anywhere rejects the whole day (template fallback) — the
// client never has to guess at a half-formed game element.
function validChoice(c) {
  if (!c || typeof c !== 'object') return null;
  const prompt = typeof c.prompt === 'string' ? c.prompt.trim() : '';
  if (!prompt || prompt.length > 240) return null;
  if (!Array.isArray(c.options) || c.options.length < 2 || c.options.length > 3) return null;
  const options = [];
  for (const o of c.options) {
    if (!o || typeof o !== 'object') return null;
    const label = typeof o.label === 'string' ? o.label.trim() : '';
    const outcome = typeof o.outcome === 'string' ? o.outcome.trim() : '';
    if (!label || !outcome || label.length > 90 || outcome.length > 340) return null;
    options.push({ label, outcome });
  }
  return { prompt, options };
}

function validTrial(t) {
  if (!t || typeof t !== 'object') return null;
  const title = typeof t.title === 'string' ? t.title.trim() : '';
  const explain = typeof t.explain === 'string' ? t.explain.trim() : '';
  if (!title || !explain || title.length > 70 || explain.length > 220) return null;
  const strList = (arr, n, max) => Array.isArray(arr) && arr.length === n
    && arr.every((s) => typeof s === 'string' && s.trim() && s.trim().length <= max)
    ? arr.map((s) => s.trim()) : null;
  if (t.type === 'order') {
    const items = strList(t.items, 4, 70);
    if (!items) return null;
    const c = t.correct;
    if (!Array.isArray(c) || c.length !== 4 || c.slice().sort().join(',') !== '0,1,2,3') return null;
    return { type: 'order', title, items, correct: c, explain };
  }
  if (t.type === 'spot' || t.type === 'phrase') {
    const options = strList(t.options, 3, t.type === 'phrase' ? 200 : 140);
    if (!options) return null;
    if (!Number.isInteger(t.correct) || t.correct < 0 || t.correct > 2) return null;
    if (t.type === 'spot') {
      const scenario = typeof t.scenario === 'string' ? t.scenario.trim() : '';
      if (!scenario || scenario.length > 420) return null;
      return { type: 'spot', title, scenario, options, correct: t.correct, explain };
    }
    const says = typeof t.says === 'string' ? t.says.trim() : '';
    if (!says || says.length > 320) return null;
    return { type: 'phrase', title, says, options, correct: t.correct, explain };
  }
  return null;
}

function validChat(chat) {
  if (!Array.isArray(chat) || chat.length < 2 || chat.length > 4) return null;
  const out = [];
  for (const b of chat) {
    if (!b || typeof b !== 'object') return null;
    const from = typeof b.from === 'string' ? b.from.trim().toLowerCase() : '';
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    if (!CHAT_FROM.includes(from) || !text || text.length > 220) return null;
    out.push({ from, text });
  }
  return out;
}

function parseDay(text) {
  if (typeof text !== 'string') return null;
  let raw = text.trim();
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj = null;
  try { obj = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  const eps = obj && Array.isArray(obj.episodes) ? obj.episodes : null;
  if (!eps || eps.length !== 6) return null;
  let routines = 0;
  let choices = 0;
  let trials = 0;
  const out = [];
  for (const e of eps) {
    if (!e || typeof e !== 'object') return null;
    const time = typeof e.time === 'string' ? e.time.trim() : '';
    const title = typeof e.title === 'string' ? e.title.trim() : '';
    const body = typeof e.text === 'string' ? e.text.trim() : '';
    const kind = typeof e.kind === 'string' ? e.kind.trim().toLowerCase() : '';
    if (!time || !title || !body) return null;
    if (!EPISODE_KINDS.includes(kind)) return null;
    if (body.length > 700 || title.length > 80 || time.length > 12) return null;
    if (kind === 'routine') routines += 1;
    const ep = { time, title, text: body, kind };
    if (e.choice != null) {
      const choice = validChoice(e.choice);
      if (!choice || kind === 'routine') return null;
      choices += 1;
      ep.choice = choice;
    }
    if (e.trial != null) {
      const trial = validTrial(e.trial);
      if (!trial || kind === 'routine') return null;
      trials += 1;
      ep.trial = trial;
    }
    if (e.chat != null) {
      const chat = validChat(e.chat);
      if (!chat || (kind !== 'people' && kind !== 'crisis')) return null;
      ep.chat = chat;
    }
    out.push(ep);
  }
  if (routines !== 1) return null;
  if (choices !== 2) return null;
  if (trials !== 1) return null;
  return out;
}

async function llmDay(prof) {
  const tasks = (prof.tasks || []).slice(0, 14);
  const input = [
    `Profession: ${prof.name}`,
    prof.category ? `Category: ${prof.category}` : null,
    'The real tasks of this job (the ONLY source for the day):',
    tasks.map((t, i) => `${i + 1}. ${t}`).join('\n'),
    'Write the day now as the JSON object described in the instructions.',
  ].filter(Boolean).join('\n');

  const attempt = async (withReasoning) => {
    const args = {
      model: MODELS.interview,
      instructions: DAY_INSTRUCTIONS,
      input,
      maxOutputTokens: 5600, // reasoning shares this budget (house lesson); the game layer (choices, a trial, chats) needs the extra room
    };
    if (withReasoning) args.reasoning = { effort: 'low' };
    const { text } = await metaRespond(args);
    return text;
  };

  let text = null;
  try {
    text = await attempt(true);
  } catch {
    text = await attempt(false); // reasoning field rejected — one retry without it
  }
  const episodes = parseDay(text);
  if (!episodes) throw new Error('playground: Spark day failed the output contract');
  return { slug: prof.slug, name: prof.name, episodes, pay_k: typeof prof.payK === 'number' ? prof.payK : null, source: 'llm' };
}

/**
 * generatePlayground(profession) → { slug, name, episodes, pay_k, source }
 * episodes: exactly 6 items { time, title, text, kind }, exactly one
 * kind 'routine'. The game layer rides on the episodes: `choice` on 2 of
 * them (1 on the template path), a `trial` on exactly 1, an optional
 * `chat` on people/crisis episodes — all validated to the same contract
 * on both paths. `pay_k` is the profession's median pay ($K/year) or
 * null. `source` is 'llm' (Spark, from the real task list) or 'template'
 * (deterministic fallback) — reported, never hidden.
 */
export async function generatePlayground(profession) {
  if (!profession || !profession.slug || !profession.name) {
    throw new Error('generatePlayground: a profession with slug and name is required');
  }
  const hasTasks = Array.isArray(profession.tasks) && profession.tasks.some((t) => typeof t === 'string' && t.trim());
  if (hasTasks) {
    try {
      return await llmDay(profession);
    } catch { /* fall through to the deterministic day */ }
  }
  return templateDay(profession);
}

export default generatePlayground;
