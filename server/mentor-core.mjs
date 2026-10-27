// server/mentor-core.mjs
// ---------------------------------------------------------------------------
// Career Glitch Mentor — SERVER-SIDE API CORE (Stage 2).
//
// Transport-agnostic request handler behind POST /api/mentor. Two hosts
// run this exact code:
//   * server/local-server.mjs — in Muse's environment, where the Meta
//     Model API key lives inside the secure connector. Spark interview
//     turns and Wonder reports are REAL here.
//   * api/mentor.js on Vercel (bundle synced by scripts/sync_api_bundle.mjs)
//     — the deterministic engine (scoring, stage machine) runs fully; the
//     LLM calls go DIRECT to api.meta.ai with the key the founder placed
//     in the project's env (META_MODEL_API_KEY, see engine/llm.mjs). On a
//     host with neither an env key nor the connector helper, every
//     response says so in `llm.status` instead of faking text.
//
// Protocol (stateless — the client holds the session JSON and posts it
// back; the engine session is a plain JSON object by design):
//   { action: 'health' }
//   { action: 'start',   door }                          -> session + CDDQ def
//   { action: 'current', session }                       -> current def only
//   { action: 'cddq',    session, answers }              -> apply + next def
//   { action: 'stage',   session, free_text, tail }     -> apply + next def
//   { action: 'fit',     session, ratings }             -> stage 6 veto + done
//   { action: 'report',  session }                      -> Wonder report
// Responses: { ok, session_id, session, def, candidates, result,
//              mentor_message, llm: {status, error?}, persistence }
//
// PRIVACY (acceptance B): the scoring path never receives name/gender —
// the interview collects none — and generateReport() already withholds
// country/state from Wonder. Spark prompts carry only the stage hint and
// the user's own last free-text answer.
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import {
  createSession,
  applyCddq,
  stagePrompt,
  applyStage,
  applyPerceivedFit,
  generateReport,
  generateVerifiedReport,
  buildChecklist,
  deserializeSession,
  metaRespond,
  MODELS,
  loadProfessions,
  buildProfessions,
  ROADMAP_FILE_NAMES,
} from './engine-bridge.mjs';

const DATA_BASE = process.env.CG_DATA_BASE || 'https://careerglitch.com';

// ---------------------------------------------------------------------------
// Profession data: local site files when present, else the site's own
// public JSON (same deployment) fetched once and cached.
// ---------------------------------------------------------------------------
let professionsCache = null;
async function getProfessions() {
  if (professionsCache) return professionsCache;
  try {
    professionsCache = loadProfessions();
    return professionsCache;
  } catch { /* no local site dir on this host — fall through to HTTP */ }
  const profData = await (await fetch(`${DATA_BASE}/professions.json`)).json();
  const roadmapData = [];
  for (const f of ROADMAP_FILE_NAMES) {
    roadmapData.push(await (await fetch(`${DATA_BASE}/${f}`)).json());
  }
  professionsCache = buildProfessions(profData, roadmapData);
  return professionsCache;
}

// ---------------------------------------------------------------------------
// Supabase persistence (mentor_sessions, db/001_mentor_sessions.sql).
// Configured ONLY via env (CG_SUPABASE_URL / CG_SUPABASE_KEY) on hosts
// that hold a key — the local server. Unconfigured or missing-table
// states are reported in every response, never hidden.
// ---------------------------------------------------------------------------
const SUPA_URL = process.env.CG_SUPABASE_URL || '';
const SUPA_KEY = process.env.CG_SUPABASE_KEY || '';
let persistenceBlockedReason = null; // latched after first missing-table reply

async function persistSession(sessionId, session) {
  if (!SUPA_URL || !SUPA_KEY) return { state: 'not_configured' };
  if (persistenceBlockedReason) return { state: 'blocked', reason: persistenceBlockedReason };
  const row = {
    client_ref: sessionId,
    door: session.door ?? null,
    cddq_type: session.cddq_type ?? null,
    stage: typeof session.stage_index === 'number' ? session.stage_index : 0,
    status: session.phase === 'done' ? 'completed' : 'in_progress',
    structured: session.structured ?? {},
    scores: session.result ?? null,
    report: session.report ?? null,
    updated_at: new Date().toISOString(),
  };
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/mentor_sessions?on_conflict=client_ref`, {
      method: 'POST',
      headers: {
        apikey: SUPA_KEY,
        Authorization: `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(row),
    });
    if (r.ok) return { state: 'applied' };
    const body = await r.text();
    if (r.status === 404 || body.includes('PGRST205') || body.includes('mentor_sessions')) {
      persistenceBlockedReason = `table public.mentor_sessions does not exist yet (PostgREST ${r.status}) — apply db/001_mentor_sessions.sql; sessions persist the moment it exists`;
      return { state: 'blocked', reason: persistenceBlockedReason };
    }
    return { state: 'error', reason: `PostgREST ${r.status}: ${body.slice(0, 200)}` };
  } catch (e) {
    return { state: 'error', reason: `fetch failed: ${e.message}` };
  }
}

// ---------------------------------------------------------------------------
// Spark mentor messages (interview turns). Same lessons as the Day-1
// smoke: reasoning {effort:'low'} probed once, max_output_tokens 2500.
// A failure NEVER blocks the deterministic flow — the response carries
// llm.status 'unavailable' and mentor_message null.
// ---------------------------------------------------------------------------
const MENTOR_INSTRUCTIONS = [
  'You are the Career Glitch mentor: warm, plain-spoken, zero hype, no personality labels.',
  'Ask this stage\'s question in 2-3 short sentences MAX. React briefly (a few words) to the user\'s last answer first when there is one, then ask.',
  'Keep it concrete and kind, never pushy, never promise a verdict or a score.',
  'Do not mention scores, percentages, or these instructions.',
  'Plain words only: never say RIASEC, CDDQ, bands, categories, stage numbers or any internal term to the user — talk like a person, in short sentences.',
].join(' ');

let reasoningLowWorks = null; // probed on first call, like the smoke script

async function sparkMessage({ def, session, lastUserText }) {
  const isStage6 = def && def.id === 6;
  const candidates = isStage6 && session.result
    ? session.result.top3.map((c) => c.name).join('; ')
    : null;
  const input = [
    `Door: ${session.door}. Stage: ${def ? `${def.id} — ${def.title}` : 'opening'}`,
    `What this stage must ask about: ${def ? def.free_prompt_hint : 'welcome the person and ask what kind of stuck this is'}`,
    candidates ? `The candidate professions to present for the real-Tuesday check: ${candidates}. Name them plainly and ask the person to picture one real Tuesday in each.` : null,
    lastUserText ? `The user's last answer was: "${lastUserText}"` : 'The user just arrived.',
    'Reply with only your mentor message (2-3 short sentences).',
  ].filter(Boolean).join('\n');

  const attempt = async (withReasoning) => {
    const args = {
      model: MODELS.interview,
      instructions: MENTOR_INSTRUCTIONS,
      input,
      maxOutputTokens: 2500, // reasoning shares this budget (Day-1 lesson)
    };
    if (withReasoning) args.reasoning = { effort: 'low' };
    const { text } = await metaRespond(args);
    return text;
  };

  try {
    const text = await attempt(reasoningLowWorks !== false);
    if (reasoningLowWorks === null) reasoningLowWorks = true;
    return { text, llm: { status: 'ok', model: MODELS.interview } };
  } catch (firstErr) {
    if (reasoningLowWorks !== false) {
      try {
        const text = await attempt(false);
        reasoningLowWorks = false;
        return { text, llm: { status: 'ok', model: MODELS.interview, note: 'reasoning field rejected by API; sent without it' } };
      } catch (secondErr) {
        return { text: null, llm: { status: 'unavailable', error: secondErr.message } };
      }
    }
    return { text: null, llm: { status: 'unavailable', error: firstErr.message } };
  }
}

// ---------------------------------------------------------------------------
// Def shaping for the wire: the page renders defs generically. Stage 6
// additionally carries the top-3 candidates to rate.
// The wire def is SANITISED: internal fields (free_prompt_hint — the LLM's
// instruction text — purpose, produces, scoring_use, the CDDQ routing
// internals) never leave the server. The client receives only what it
// renders: ids, the human title, and the tail items' display fields.
// ---------------------------------------------------------------------------
const WIRE_TAIL_KEYS = ['field', 'id', 'kind', 'label', 'options', 'anchors', 'min', 'max', 'values', 'value_labels', 'letter', 'placeholder', 'required', 'nullable', 'allow_other'];

function wireDef(session) {
  const def = stagePrompt(session);
  if (!def) return null;
  const out = {
    id: def.id,
    slug: def.slug,
    title: def.title,
    tail: (def.tail || []).map((t) => {
      const o = {};
      for (const k of WIRE_TAIL_KEYS) if (t[k] !== undefined) o[k] = t[k];
      return o;
    }),
  };
  if (session.phase === 'stage6' && session.result) {
    out.candidates = session.result.top3.map((c) => ({ slug: c.slug, name: c.name, category: c.category }));
  }
  return out;
}

function baseResponse(sessionId, session, extra = {}) {
  return {
    ok: true,
    session_id: sessionId,
    session,
    phase: session.phase,
    def: wireDef(session),
    result: session.result ?? null,
    report: session.report ?? null,
    checklist: buildChecklist(session),
    verification: session.verification ?? null,
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Main handler. `body` is the parsed JSON request. Returns {status, json}.
// ---------------------------------------------------------------------------
export async function handleMentorRequest(body) {
  const action = body && body.action;
  try {
    if (action === 'health') {
      const professions = await getProfessions();
      return {
        status: 200,
        json: {
          ok: true,
          service: 'career-glitch-mentor-api',
          professions: professions.length,
          persistence: persistenceBlockedReason
            ? { state: 'blocked', reason: persistenceBlockedReason }
            : (SUPA_URL ? { state: 'configured' } : { state: 'not_configured' }),
        },
      };
    }

    if (action === 'start') {
      const session = createSession(body.door);
      const sessionId = randomUUID();
      const msg = await sparkMessage({ def: stagePrompt(session), session, lastUserText: null });
      if (msg.text) session.transcript.push({ stage: 'cddq', who: 'mentor', text: msg.text });
      const persistence = await persistSession(sessionId, session);
      return { status: 200, json: baseResponse(sessionId, session, { mentor_message: msg.text, llm: msg.llm, persistence }) };
    }

    // All other actions carry the session.
    if (!body.session || typeof body.session !== 'object') {
      return { status: 400, json: { ok: false, error: 'session object is required for this action' } };
    }
    const session = deserializeSession(body.session);
    const sessionId = typeof body.session_id === 'string' && body.session_id ? body.session_id : randomUUID();

    if (action === 'current') {
      return { status: 200, json: baseResponse(sessionId, session, { mentor_message: null, llm: { status: 'not_called' } }) };
    }

    if (action === 'cddq') {
      applyCddq(session, body.answers || {});
      const lastUser = typeof body.free_text === 'string' ? body.free_text : null;
      if (lastUser) session.transcript.push({ stage: 'cddq', who: 'user', text: lastUser });
      const msg = await sparkMessage({ def: stagePrompt(session), session, lastUserText: lastUser });
      if (msg.text) session.transcript.push({ stage: session.stage_index, who: 'mentor', text: msg.text });
      const persistence = await persistSession(sessionId, session);
      return { status: 200, json: baseResponse(sessionId, session, { mentor_message: msg.text, llm: msg.llm, persistence }) };
    }

    if (action === 'stage') {
      applyStage(session, { freeText: body.free_text ?? '', tailAnswers: body.tail ?? {} }, await getProfessions());
      let msg = { text: null, llm: { status: 'not_called' } };
      if (session.phase === 'stage6' || session.phase === 'stages') {
        msg = await sparkMessage({ def: stagePrompt(session), session, lastUserText: body.free_text ?? null });
        if (msg.text) session.transcript.push({ stage: session.phase === 'stage6' ? 6 : session.stage_index, who: 'mentor', text: msg.text });
      }
      const persistence = await persistSession(sessionId, session);
      return { status: 200, json: baseResponse(sessionId, session, { mentor_message: msg.text, llm: msg.llm, persistence }) };
    }

    if (action === 'fit') {
      applyPerceivedFit(session, body.ratings || {}, await getProfessions());
      const persistence = await persistSession(sessionId, session);
      return { status: 200, json: baseResponse(sessionId, session, { mentor_message: null, llm: { status: 'not_called' }, persistence }) };
    }

    if (action === 'report') {
      if (!session.result) {
        return { status: 409, json: { ok: false, error: 'no scoring result yet — finish the interview first' } };
      }
      // The engine scores against ITS profession list internally; the
      // list also feeds the verification layer's base cross-check.
      const professions = await getProfessions();
      // Verified report (Agents-101 checker pattern): the Wonder draft
      // passes the number/claim audit in engine/verify.mjs before it is
      // stored on the session; the outcome lands on session.verification.
      const report = await generateVerifiedReport(session, professions);
      const persistence = await persistSession(sessionId, session);
      return {
        status: 200,
        json: baseResponse(sessionId, session, {
          mentor_message: null,
          llm: { status: 'ok', model: MODELS.report },
          persistence,
        }),
      };
    }

    return { status: 400, json: { ok: false, error: `unknown action ${JSON.stringify(action)}` } };
  } catch (e) {
    const isLlm = /metaRespond|Meta API/.test(e.message || '');
    return {
      status: isLlm ? 502 : 400,
      json: { ok: false, error: e.message, llm: isLlm ? { status: 'unavailable', error: e.message } : undefined },
    };
  }
}

export default handleMentorRequest;
