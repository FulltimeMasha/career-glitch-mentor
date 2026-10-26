// scripts/verify_live_session.mjs
// ---------------------------------------------------------------------------
// END-TO-END LIVE VERIFICATION of the Mentor API (Stage 2).
// Drives one full session over HTTP against a running host:
//   start -> cddq -> stages 0..5 -> stage-6 fit -> Wonder report
// with REAL Spark interview turns and the REAL deterministic engine.
// Persona: 30yo retail associate, complete structured answers, strong
// people/care interests — built to reach a verdict (bands or direct),
// which proves the whole chain. Persona 10 covers the refusal path.
//
//   node scripts/verify_live_session.mjs [baseUrl] [--expect-llm ok|unavailable]
//   baseUrl default http://127.0.0.1:8377
//   --expect-llm unavailable is for hosts without the connector key
//   (Vercel): Spark/Wonder MUST then report llm.status 'unavailable'
//   honestly while the deterministic verdict still completes.
// Outputs: smoke-output/live-session/{transcript.json,result.json,report.md}
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://127.0.0.1:8377').replace(/\/$/, '');
const EXPECT_LLM = (process.argv.find((a) => a.startsWith('--expect-llm=')) || '--expect-llm=ok').split('=')[1];
const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'smoke-output', 'live-session');

async function call(payload) {
  const r = await fetch(`${BASE}/api/mentor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await r.json();
  if (!json.ok) throw new Error(`API ${payload.action} -> HTTP ${r.status}: ${json.error || JSON.stringify(json).slice(0, 300)}`);
  return json;
}

// Per-field answers (engine field names from stages.json).
const ANSWERS = {
  country: 'United States',
  state: 'North Carolina',
  age: 30,
  current_profession_name: 'Retail Sales Associate',
  current_income_k: 38,
  income_floor_k: 40,
  cushion_months: 12,
  hours_per_day: 4,
  budget_k: 20,
  documents_ok: 'yes',
  health_limits: ['none'],
  languages: ['en'],
  attempts_started: 3,
  attempts_finished: 2,
  exit_pattern: 'money',
  energy_themes: ['people', 'teaching'],
  values_rank: ['relationships', 'support', 'working_conditions', 'achievement', 'independence', 'recognition'],
  autonomy_need: 1,
  relatedness_need: 2,
  supports_money: 2,
  supports_time: 2,
  supports_people: 1,
  supports_learning_access: 2,
  barriers: ['money'],
  red_lines: [],
  riasec_r1: 1, riasec_r2: 1,
  riasec_i1: 2, riasec_i2: 2,
  riasec_a1: 1, riasec_a2: 1,
  riasec_s1: 4, riasec_s2: 4,
  riasec_e1: 1, riasec_e2: 1,
  riasec_c1: 3, riasec_c2: 3,
  remote_pref: 1,
  hands_pref: 1,
  people_pref: 2,
  mirror_confirmed: 'confirmed',
};

const FREE_TEXT = {
  cddq: 'I have been in retail for six years and I need a real plan, not vibes.',
  0: 'I am 30, retail associate, about $38K a year. I cannot go below $40K for long. I have a year of cushion, 4 hours a day, and about $20K I can put into switching.',
  1: 'I finished two of the three things I started. I left retail roles when the pay flatlined; the work that gave me energy was training new people.',
  2: 'I envy good nurses — real skill, people actually need them. If success were guaranteed I would go into care work.',
  3: 'Money stopped me before. No red lines besides night shifts forever.',
  4: 'Helping and teaching people is my day. Paperwork is fine. Analysis is okay, building things is not.',
  5: 'Yes, that summary is me.',
};

function fillTail(def) {
  const tail = {};
  for (const item of def.tail || []) {
    if (item.kind === 'derived') continue;
    const f = item.field;
    if (f in ANSWERS) { tail[f] = ANSWERS[f]; continue; }
    const opts = (item.options || []).map((o) => (typeof o === 'object' ? o.value : o));
    if (item.kind === 'choice') tail[f] = opts[0];
    else if (item.kind === 'multichoice') tail[f] = opts.slice(0, 1);
    else if (item.kind === 'scale') tail[f] = item.max;
    else if (item.kind === 'number') tail[f] = item.min ?? 0;
    else if (item.kind === 'rank6') tail[f] = item.values || opts;
    else if (item.kind === 'text_short') tail[f] = 'n/a';
  }
  return tail;
}

function cddqAnswers(def) {
  const out = {};
  for (const item of def.tail || []) {
    const lack = (item.options || []).find((o) => o.votes_for === 'lacks_information');
    out[item.id] = lack ? lack.value : item.options[1].value;
  }
  return out;
}

async function main() {
  const log = [];
  const note = (s) => { console.log(s); log.push(s); };

  const health = await (await fetch(`${BASE}/api/mentor?action=health`)).json();
  note(`health: professions=${health.professions} persistence=${JSON.stringify(health.persistence)}`);
  if (!health.ok) throw new Error('health check failed');

  // --- start (Spark opening) -------------------------------------------
  let r = await call({ action: 'start', door: 'start' });
  const sessionId = r.session_id;
  let session = r.session;
  note(`start: llm=${JSON.stringify(r.llm)} persistence=${JSON.stringify(r.persistence)}`);
  const transcript = [];
  if (EXPECT_LLM === 'ok') {
    if (!r.mentor_message) throw new Error('start: no Spark mentor message (LLM unavailable on this host?)');
    note(`mentor[CDDQ]: ${r.mentor_message.slice(0, 140)}...`);
    transcript.push({ who: 'mentor', stage: 'cddq', text: r.mentor_message });
  } else {
    if (r.llm.status !== 'unavailable' || r.mentor_message) {
      throw new Error(`expected honest llm.status 'unavailable' with no fabricated message, got ${JSON.stringify(r.llm)} / message=${JSON.stringify(r.mentor_message)}`);
    }
    note('start: LLM honestly unavailable on this host (no fabricated message) — continuing with the deterministic flow');
  }

  // --- cddq --------------------------------------------------------------
  r = await call({ action: 'cddq', session_id: sessionId, session, answers: cddqAnswers(r.def), free_text: FREE_TEXT.cddq });
  session = r.session;
  note(`cddq: type=${session.cddq_type} llm=${r.llm.status} next=${r.def ? r.def.id : 'none'}`);
  transcript.push({ who: 'mentor', stage: r.def?.id, text: r.mentor_message });

  // --- stages 0..5 --------------------------------------------------------
  let guard = 0;
  while (session.phase === 'stages' && guard++ < 10) {
    const def = r.def;
    const stageId = def.id;
    r = await call({
      action: 'stage',
      session_id: sessionId,
      session,
      free_text: FREE_TEXT[stageId] || '',
      tail: fillTail(def),
    });
    session = r.session;
    note(`stage ${stageId}: phase=${session.phase} llm=${r.llm.status}${r.result ? ` mode=${r.result.mode}` : ''}`);
    if (r.mentor_message) transcript.push({ who: 'mentor', stage: session.phase === 'stage6' ? 6 : session.stage_index, text: r.mentor_message });
  }
  if (!session.result) throw new Error('no scoring result after stage 5');
  note(`result: mode=${session.result.mode} top3=${session.result.top3.map((c) => `${c.name}[${c.category}]`).join(', ')}`);
  if (session.result.mode === 'insufficient_data') {
    throw new Error(`persona unexpectedly produced insufficient_data: ${session.result.mode_reason}`);
  }

  // --- stage 6: perceived fit ---------------------------------------------
  if (session.phase === 'stage6') {
    const ratings = {};
    r.def.candidates.forEach((c, i) => { ratings[c.slug] = i === 0 ? 'mine' : 'tolerable'; });
    r = await call({ action: 'fit', session_id: sessionId, session, ratings });
    session = r.session;
    note(`fit: phase=${session.phase} persistence=${JSON.stringify(r.persistence)}`);
  }
  if (session.phase !== 'done') throw new Error(`session not done, phase=${session.phase}`);

  // --- report (Wonder) ------------------------------------------------------
  if (EXPECT_LLM !== 'ok') {
    // The report REQUIRES the LLM: the API must refuse honestly (502),
    // never fabricate one.
    const rr = await fetch(`${BASE}/api/mentor`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'report', session_id: sessionId, session }),
    });
    const rj = await rr.json();
    note(`report on LLM-less host: HTTP ${rr.status} ok=${rj.ok} llm=${JSON.stringify(rj.llm)}`);
    if (rj.ok || !rj.llm || rj.llm.status !== 'unavailable') {
      throw new Error('report on an LLM-less host must fail honestly with llm.status unavailable');
    }
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, 'transcript.json'), JSON.stringify({ base: BASE, session_id: sessionId, transcript, session }, null, 2));
    writeFileSync(join(OUT_DIR, 'result.json'), JSON.stringify({ person: session.person, result: session.result }, null, 2));
    note(`\nLIVE SESSION (deterministic path) VERIFIED against ${BASE}`);
    return;
  }
  r = await call({ action: 'report', session_id: sessionId, session });
  session = r.session;
  const report = r.report || session.report;
  note(`report: llm=${JSON.stringify(r.llm)} persistence=${JSON.stringify(r.persistence)}`);
  if (!report || report.length < 400) throw new Error(`report too short or missing (${report ? report.length : 0} chars)`);
  const words = report.trim().split(/\s+/).filter(Boolean).length;
  note(`report words: ${words}`);
  if (/match %|\d+\s*%\s*match/i.test(report)) throw new Error('report contains a banned match %');

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'transcript.json'), JSON.stringify({ base: BASE, session_id: sessionId, transcript, session }, null, 2));
  writeFileSync(join(OUT_DIR, 'result.json'), JSON.stringify({ person: session.person, result: session.result }, null, 2));
  writeFileSync(join(OUT_DIR, 'report.md'), report.endsWith('\n') ? report : `${report}\n`);
  note(`\nLIVE SESSION VERIFIED against ${BASE}`);
  note(`outputs: smoke-output/live-session/{transcript.json,result.json,report.md}`);
}

main().catch((e) => { console.error(`VERIFY FAIL: ${e.message}`); process.exit(1); });
