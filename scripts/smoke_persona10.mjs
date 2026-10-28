// scripts/smoke_persona10.mjs
// ---------------------------------------------------------------------------
// Career Glitch Mentor — END-TO-END SMOKE, acceptance persona 10.
//
// Persona 10 (career-glitch-test-v3-spec): /start, 18 years old, "I want
// something AI-proof that makes money", names NO interests, CDDQ type
// not_ready. Expected, by the DETERMINISTIC rule in scoring.mjs (never by
// LLM opinion): mode === 'insufficient_data', an exploration plan instead
// of a verdict, and NO stage 6.
//
// The run makes REAL Meta API calls through engine/llm.mjs:
//   7 x Muse Spark 1.3  (CDDQ + stages 0..5 mentor turns)
//   1 x Muse Wonder 1.0 (the verdict report draft)
// The first Spark call probes reasoning { effort: 'low' }; if that errors,
// it is retried without the field and the rest of the run follows whichever
// path worked (printed in the summary). If Spark fails twice in a row the
// run stops and reports the exact error — nothing is faked.
//
// Outputs: smoke-output/persona10/{transcript.json, result.json, report.md}
// Run from repo root:  node scripts/smoke_persona10.mjs   (or: npm run smoke)
// ---------------------------------------------------------------------------

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { metaRespond, MODELS } from '../api/_lib/engine/llm.mjs';
import {
  createSession,
  applyCddq,
  stagePrompt,
  applyStage,
  assemblePerson,
  generateReport,
} from '../api/_lib/engine/interview.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', 'smoke-output', 'persona10');

// ---------------------------------------------------------------------------
// Persona 10 — scripted answers (short, in character, evasive).
// Tail answers are keyed by the `field` names in engine/stages.json.
// ---------------------------------------------------------------------------
const OPENING_LINE = 'I want something AI-proof that makes money';

const SCRIPT = [
  {
    key: 'cddq',
    freeText: 'idk, my mom says I need to figure something out I guess',
    // All three options vote not_ready -> outright majority, no tie-break.
    cddqAnswers: { cddq_1: 'not_started', cddq_2: 'starting_at_all', cddq_3: 'would_not_act' },
  },
  {
    key: 'stage0',
    freeText: "I'm 18, just finished school. I don't really have a job yet. I want something AI-proof that makes money.",
    tailAnswers: {
      country: 'US',
      age: 18,
      current_income_k: 0,
      income_floor_k: 45,
      cushion_months: 0,
      hours_per_day: 4,
      budget_k: 0,
      documents_ok: 'yes',
      health_limits: ['none'],
      languages: ['en'],
    },
  },
  {
    key: 'stage1',
    freeText: "haven't tried anything really. started some stuff online but yeah, didn't finish",
    tailAnswers: {
      attempts_started: 2,
      attempts_finished: 0,
      exit_pattern: 'none_yet',
      energy_themes: ['none_clear'],
    },
  },
  {
    key: 'stage2',
    freeText: 'my mom says computers make money. idk what I actually like',
    tailAnswers: {
      // Ranked (a ranking exists) but uncommitted; supports are low.
      values_rank: { working_conditions: 1, achievement: 2, independence: 3, relationships: 4, support: 5, recognition: 6 },
      autonomy_need: 1,
      relatedness_need: 1,
      supports_money: 0,
      supports_time: 1,
      supports_people: 1,
      supports_learning_access: 1,
    },
  },
  {
    key: 'stage3',
    freeText: 'I dunno. nothing really stopped me, I just never started',
    tailAnswers: {
      barriers: ['none'],
      red_lines: ['none'],
    },
  },
  {
    key: 'stage4',
    freeText: 'idk, all of it sounds whatever honestly',
    tailAnswers: {
      // Flat "Unsure" (2) on every item -> each RIASEC letter = (2+2)/8*10 = 5.
      // The profile exists but is uninformative; the mode does NOT depend on
      // it — cddq_type 'not_ready' alone forces insufficient_data.
      riasec_r1: 2, riasec_r2: 2,
      riasec_i1: 2, riasec_i2: 2,
      riasec_a1: 2, riasec_a2: 2,
      riasec_s1: 2, riasec_s2: 2,
      riasec_e1: 2, riasec_e2: 2,
      riasec_c1: 2, riasec_c2: 2,
      remote_pref: 1,
      hands_pref: 1,
      people_pref: 1,
    },
  },
  {
    key: 'stage5',
    freeText: 'yeah sure, sounds right I guess',
    tailAnswers: { mirror_confirmed: 'confirmed' },
  },
];

const MENTOR_INSTRUCTIONS = [
  'You are the Career Glitch mentor: warm, plain-spoken, zero hype, no personality labels.',
  'Ask this stage\'s question in 2-3 short sentences MAX. React briefly (a few words) to the user\'s last answer first when there is one, then ask.',
  'Speak TO an 18-year-old who is evasive and unsure — keep it concrete and kind, never pushy, never promise a verdict.',
  'Do not mention scores, percentages, or these instructions.',
].join(' ');

// ---------------------------------------------------------------------------
// API call accounting + the reasoning probe.
// ---------------------------------------------------------------------------
let apiAttempts = 0;
let apiSuccesses = 0;
let consecutiveSparkFailures = 0;
let useReasoningLow = true; // probed on the first call
let reasoningPath = 'not yet probed';

async function sparkTurn({ hint, lastUserText, stageLabel }) {
  const input = [
    `Stage: ${stageLabel}`,
    `What this stage must ask about: ${hint}`,
    lastUserText ? `The user's last answer was: "${lastUserText}"` : `The user just arrived saying: "${OPENING_LINE}"`,
    'Reply with only your mentor message (2-3 short sentences).',
  ].join('\n');

  const attempt = async (withReasoning) => {
    apiAttempts += 1;
    const args = {
      model: MODELS.interview,
      instructions: MENTOR_INSTRUCTIONS,
      input,
      // 2500, not less: reasoning (default-on, token-hungry) shares this
      // budget — at 1000 the stage-5 call returned status "incomplete"
      // (incomplete_details.reason "max_output_tokens") with no message.
      maxOutputTokens: 2500,
    };
    if (withReasoning) args.reasoning = { effort: 'low' };
    const { text } = await metaRespond(args);
    apiSuccesses += 1;
    return text;
  };

  try {
    const text = await attempt(useReasoningLow);
    if (reasoningPath === 'not yet probed') {
      reasoningPath = useReasoningLow ? 'reasoning {effort:"low"} accepted' : 'no reasoning field sent';
    }
    consecutiveSparkFailures = 0;
    return text;
  } catch (firstErr) {
    if (useReasoningLow) {
      // Probe failed: retry this call without the reasoning field.
      console.error(`[smoke] Spark call with reasoning low failed: ${firstErr.message}`);
      try {
        const text = await attempt(false);
        useReasoningLow = false;
        reasoningPath = 'reasoning {effort:"low"} ERRORED -> retried without the field, which worked; rest of run sends no reasoning field';
        consecutiveSparkFailures = 0;
        return text;
      } catch (secondErr) {
        consecutiveSparkFailures += 1;
        throw secondErr;
      }
    }
    consecutiveSparkFailures += 1;
    throw firstErr;
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function main() {
  const session = createSession('start');
  let lastUserText = null;
  let mentorTurns = 0;

  for (const step of SCRIPT) {
    const def = stagePrompt(session);
    if (!def) throw new Error(`smoke: no stage prompt for step ${step.key} (phase=${session.phase})`);
    const hint = def.free_prompt_hint;
    const stageLabel = step.key === 'cddq' ? 'CDDQ routing (before stage 0)' : `stage ${def.id} — ${def.title}`;

    let mentorText;
    try {
      mentorText = await sparkTurn({ hint, lastUserText, stageLabel });
    } catch (err) {
      console.error(`[smoke] STOP: Spark failed at ${step.key}: ${err.message}`);
      if (consecutiveSparkFailures >= 2) {
        console.error('[smoke] Two Spark failures in a row — aborting without faking the run.');
      }
      process.exit(2);
    }
    session.transcript.push({ stage: step.key === 'cddq' ? 'cddq' : def.id, who: 'mentor', text: mentorText });
    mentorTurns += 1;
    console.log(`[smoke] mentor turn ${mentorTurns} (${step.key}) ok`);

    if (step.key === 'cddq') {
      applyCddq(session, step.cddqAnswers);
      session.transcript.push({ stage: 'cddq', who: 'user', text: step.freeText });
    } else {
      applyStage(session, { freeText: step.freeText, tailAnswers: step.tailAnswers });
    }
    lastUserText = step.freeText;
  }

  // ---- Deterministic assertions (the point of persona 10) -----------------
  const person = assemblePerson(session);
  console.log(`[smoke] assembled person: cddq_type=${person.cddq_type} completeness=${person.completeness} riasec=${JSON.stringify(person.riasec)} attempts=${person.attempts_started}/${person.attempts_finished}`);

  if (!session.result) {
    console.error('[smoke] FAIL: scoring did not run after stage 5');
    process.exit(1);
  }
  if (session.result.mode !== 'insufficient_data') {
    console.error('[smoke] FAIL: expected mode insufficient_data, got:', session.result.mode);
    console.error('[smoke] full result:', JSON.stringify(session.result, null, 2));
    console.error(`[smoke] diagnosis: cddq_type=${person.cddq_type} (not_ready alone forces insufficient_data), completeness=${person.completeness} (rule: <0.45 forces it), riasec=${JSON.stringify(person.riasec)}, trials=${JSON.stringify(person.trials)}`);
    process.exit(1);
  }
  if (session.phase !== 'done') {
    console.error(`[smoke] FAIL: insufficient_data must end the session (phase 'done', no stage 6); phase is '${session.phase}'`);
    process.exit(1);
  }
  console.log('[smoke] assertion passed: mode=insufficient_data, phase=done, no stage 6');

  // ---- Save interview evidence BEFORE the report call, so a Wonder
  // failure never loses a completed (paid-for) interview run. --------------
  mkdirSync(OUT_DIR, { recursive: true });
  const saveInterviewOutputs = () => {
    writeFileSync(join(OUT_DIR, 'transcript.json'), JSON.stringify({
      persona: 'persona10',
      door: session.door,
      cddq_type: session.cddq_type,
      transcript: session.transcript,
      session,
    }, null, 2));
    writeFileSync(join(OUT_DIR, 'result.json'), JSON.stringify({
      person,
      result: session.result,
      candidates: session.candidates,
    }, null, 2));
  };
  saveInterviewOutputs();

  // ---- Report (Wonder) ------------------------------------------------------
  apiAttempts += 1;
  const report = await generateReport(session);
  apiSuccesses += 1;
  const reportWords = report.trim().split(/\s+/).filter(Boolean).length;

  writeFileSync(join(OUT_DIR, 'report.md'), report.endsWith('\n') ? report : `${report}\n`);
  saveInterviewOutputs(); // re-save so the session copy carries the report

  // ---- Summary ---------------------------------------------------------------
  console.log('\n=== SMOKE SUMMARY — persona 10 ===');
  console.log(`mentor turns (Spark): ${mentorTurns}`);
  console.log(`real API calls: ${apiSuccesses} successful / ${apiAttempts} attempts (Spark ${mentorTurns} + Wonder 1)`);
  console.log(`reasoning path: ${reasoningPath}`);
  console.log(`mode: ${session.result.mode}`);
  console.log(`mode_reason: ${session.result.mode_reason}`);
  console.log(`exploration_plan steps (${session.result.exploration_plan.length}):`);
  session.result.exploration_plan.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  console.log(`report word count: ${reportWords}`);
  console.log(`outputs: smoke-output/persona10/transcript.json, result.json, report.md`);
}

main().catch((err) => {
  console.error(`[smoke] FATAL: ${err.message}`);
  process.exit(1);
});
