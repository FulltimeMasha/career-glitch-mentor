// engine/chat.mjs
// ---------------------------------------------------------------------------
// Conversational intake (founder brief 28.10.2026 §6) — the chat front
// door to the SAME interview the cards drive. One session, one bank
// (stages.json), one deterministic engine: this module only moves
// answers from conversation into session.structured, through the same
// validators (validateTailValue) and the same apply functions
// (applyCddq / applyStage) the card flow uses. It never scores, never
// invents a profession, and never lets an unconfirmed value through:
//
//   chips   — tapped answers carrying exact stages.json anchors. A
//             tap IS the answer (the card flow's semantics), so chips
//             stage directly, still unapplied until the stage is
//             complete and applyStage runs them through validation.
//   text    — free text is extracted deterministically
//             (engine/chat-extract.mjs) into a PENDING proposal. The
//             proposal is shown back with units; only an explicit
//             confirm (or a fix, whose final field set replaces the
//             proposal) moves it into the staged answers. While a
//             proposal is open, no stage completes — the engine can
//             never consume a value the person has not seen.
//             BANKING (fix, 29.10.2026): extraction also reads the
//             Point A fact set from messages sent at ANY stage (a
//             fact dump typed at the CDDQ opening previously vanished
//             — verified live on prod). A confirmed banked value is
//             routed home: staged, when its stage is current or
//             still ahead (that stage's own completion consumes it,
//             exactly as if typed at home); written into the coded
//             answers through the revision machinery, when its stage
//             has already applied (an optional fact volunteered late
//             can never be re-staged — nothing would consume it).
//   revise  — corrections to already-applied answers (the stage-5
//             mirror's "corrected" path): validated writes into
//             structured, with the result recomputed exactly the way
//             the report path recomputes it.
//
// Turn accounting (brief §6): a "turn" is a message — a call carrying
// text, a confirm, a fix or a revise. Chip-only calls are the chat
// equivalent of tapping widgets on a card and do not count. The hard
// cap is 25 turns to a first result; at the cap the packet says so
// and the client offers the classic form, which resumes from the
// same session (progress is derived from the answers, so nothing
// confirmed is ever lost).
//
// Logging (brief §6): session.chat.log records extraction RESULTS —
// {stage, field, value, via} for every value that entered the staged
// or applied answers, and a bare marker for instruction-shaped
// messages. Raw chat text is never written to the log (the transcript
// keeps the conversation itself, as the card flow already does).
// ---------------------------------------------------------------------------

import {
  STAGES_DATA,
  applyCddq,
  applyStage,
  assemblePerson,
  deriveProgress,
  isFilled,
  normalizeValuesRank,
  validateTailValue,
} from './interview.mjs';
import { scorePerson } from './scoring.mjs';
import { decorateResult } from './result-extras.mjs';
import { sanitizeUserText } from './llm.mjs';
import { extractChatAnswers } from './chat-extract.mjs';

export const CHAT_TURN_CAP = 25;

const STAGES = STAGES_DATA.stages;
const CDDQ_ITEMS = STAGES_DATA.cddq_routing.items;
const LOG_CAP = 120;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export function ensureChat(session) {
  if (!session.chat || typeof session.chat !== 'object' || Array.isArray(session.chat)) {
    session.chat = { v: 1, turns: 0, staged: {}, pending: null, log: [], mirror_corrected: false, instruction_flag: false };
  }
  const c = session.chat;
  if (typeof c.turns !== 'number') c.turns = 0;
  if (!c.staged || typeof c.staged !== 'object' || Array.isArray(c.staged)) c.staged = {};
  if (!Array.isArray(c.log)) c.log = [];
  if (c.pending === undefined) c.pending = null;
  return c;
}

function logResult(chat, stageKey, field, value, via) {
  chat.log.push({ s: stageKey, f: field, v: value, via });
  if (chat.log.length > LOG_CAP) chat.log.splice(0, chat.log.length - LOG_CAP);
}

// ---------------------------------------------------------------------------
// Where the session stands, in chat terms.
// ---------------------------------------------------------------------------
function currentSurface(session) {
  const prog = deriveProgress(session);
  if (!prog.cddqDone) {
    return {
      key: 'cddq',
      items: CDDQ_ITEMS.map((it) => ({ field: it.field, id: it.id, kind: it.kind, label: it.prompt, options: it.options })),
    };
  }
  if (prog.stagesAnswered >= 6) return { key: session.phase === 'stage6' ? 'fit' : 'done', items: [] };
  const def = STAGES[prog.stagesAnswered];
  return { key: def.id, def, items: def.tail || [] };
}

const isRequiredItem = (t) => t.kind !== 'derived' && t.required !== false;
const fieldCovered = (session, staged, field) => {
  if (field === 'values_rank') {
    return !!normalizeValuesRank(session.structured[field]) || !!normalizeValuesRank(staged[field]);
  }
  return isFilled(session.structured[field]) || isFilled(staged[field]);
};

function missingRequired(session, surface) {
  const staged = session.chat.staged;
  return surface.items
    .filter(isRequiredItem)
    .filter((t) => !fieldCovered(session, staged, t.field))
    .map((t) => ({ field: t.field, label: t.label || t.field }));
}

// ---------------------------------------------------------------------------
// Confirm-card lines: every proposed value rendered with its unit, so
// what the person confirms is exactly what the engine will use.
// ---------------------------------------------------------------------------
const fmtK = (v) => `$${v}K`;
const MONEY_FIELDS = new Set(['income_floor_k', 'current_income_k', 'budget_k']);
function describeValue(item, value) {
  const label = String(item.label || item.field).split(' — ')[0];
  if (Array.isArray(value)) {
    if (item.kind === 'rank6') {
      const labels = item.value_labels || {};
      return `${label}: ${value.map((k, i) => `${i + 1}. ${labels[k] || k}`).join(' · ')}`;
    }
    const labels = (item.options || []).map((o) => [o.value, o.label]);
    const byVal = new Map(labels);
    return `${label}: ${value.map((v) => byVal.get(v) || v).join(', ')}`;
  }
  if (item.kind === 'choice') {
    const opt = (item.options || []).find((o) => o.value === value);
    const lab = opt ? String(opt.label) : String(value);
    return `${label}: ${lab.length > 90 ? `${lab.slice(0, 90)}…` : lab}`;
  }
  if (typeof value === 'number') {
    if (MONEY_FIELDS.has(item.field)) return `${label}: ${fmtK(value)}`;
    if (item.field === 'age') return `${label}: ${value} years old`;
    if (item.field === 'cushion_months') return `${label}: ${value} month${value === 1 ? '' : 's'} of expenses`;
    if (item.field === 'hours_per_day') return `${label}: ${value} hour${value === 1 ? '' : 's'} a day`;
    if (item.field === 'degree_years') return `${label}: ${value} year${value === 1 ? '' : 's'}`;
    return `${label}: ${value}`;
  }
  return `${label}: ${value}`;
}

// The item definition that owns a field, across every stage — the
// revise path validates against the owning stage's own rules.
function owningItem(field) {
  for (const st of STAGES) {
    const item = (st.tail || []).find((t) => t.field === field) || null;
    if (item) return item;
  }
  return null;
}

// The index of the stage whose tail owns a field, or null when no
// stage owns it (the CDDQ votes — extraction never proposes those,
// so a proposal never needs routing for them). Compared against
// deriveProgress().stagesAnswered it tells whether the field's home
// stage has already been applied.
function homeStageIndex(field) {
  for (let i = 0; i < STAGES.length; i++) {
    if ((STAGES[i].tail || []).some((t) => t.field === field)) return i;
  }
  return null;
}

// Write corrections into the applied answers and, when a result
// already exists, recompute it exactly the way the report path does
// (person rebuilt from structured, deterministic engine re-run,
// decorations re-applied). Shared by the revise input and by a
// confirmed revision proposal.
function applyRevisions(session, values, professions, chat, via) {
  for (const [f, v] of Object.entries(values)) {
    session.structured[f] = v;
    logResult(chat, 'revise', f, v, via);
  }
  if (session.result && professions) {
    const person = assemblePerson(session);
    session.person = person;
    session.result = scorePerson(person, professions);
    decorateResult(session, professions);
    session.candidates = session.result.top3;
  }
}

// ---------------------------------------------------------------------------
// Input validation — EVERYTHING is checked before ANY mutation, so a
// rejected call leaves the session byte-identical (the card flow's
// contract: on !ok the client keeps its previous session).
// ---------------------------------------------------------------------------
function findItem(surface, fieldOrId) {
  return surface.items.find((t) => t.field === fieldOrId || t.id === fieldOrId) || null;
}

function validateValueMap(surface, map, { onlyFields = null } = {}) {
  // Returns { values: {field: validatedValue}, drop: [field] } or throws
  // a plain-language Error (the API layer renders it without internals).
  const values = {};
  const drop = [];
  for (const [key, raw] of Object.entries(map || {})) {
    const item = findItem(surface, key);
    if (!item || item.kind === 'derived' || item.kind === 'perceived_fit') {
      throw new Error(`That answer does not belong to this question — nothing was changed.`);
    }
    if (onlyFields && !onlyFields.has(item.field)) {
      throw new Error(`That field is not part of what I asked you to check — nothing was changed.`);
    }
    if (raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0)) { drop.push(item.field); continue; }
    try {
      values[item.field] = validateTailValue(item, raw);
    } catch {
      throw new Error(`One answer could not be used: “${item.label || item.field}”. Nothing was changed — check it and send again.`);
    }
  }
  return { values, drop };
}

// ---------------------------------------------------------------------------
// The workhorse. input: { text?, chips?, confirm?, fix_values?, revise? }
// Mutates the session ONLY on success. Returns a summary for the
// packet builder; throws Error with a plain message on bad input.
// ---------------------------------------------------------------------------
export function applyChatInput(session, input = {}, professions = null) {
  const chat = ensureChat(session);
  const out = { appliedStage: null, instructionLike: false, countedTurn: false };
  const surface = currentSurface(session);

  const hasText = typeof input.text === 'string' && input.text.trim().length > 0;
  const hasConfirm = input.confirm === true;
  const hasFix = input.fix_values && typeof input.fix_values === 'object';
  const hasChips = input.chips && typeof input.chips === 'object' && Object.keys(input.chips).length > 0;
  const hasRevise = input.revise && typeof input.revise === 'object' && Object.keys(input.revise).length > 0;
  chat.instruction_flag = false;

  // ---- validate everything up front (no mutation below this line
  // ---- until every check has passed).
  let confirmPlan = null;
  if (hasConfirm || hasFix) {
    if (!chat.pending) throw new Error('There is nothing waiting for your OK right now — nothing was changed.');
    if (chat.pending.revise) {
      // A revision proposal confirms into the APPLIED answers: each
      // value is validated against its owning stage's item rules.
      const only = new Set(Object.keys(chat.pending.values));
      const src = hasFix ? input.fix_values : chat.pending.values;
      const values = {};
      for (const [f, raw] of Object.entries(src || {})) {
        if (!only.has(f)) throw new Error('That field is not part of what I asked you to check — nothing was changed.');
        if (raw === null || raw === '') continue; // dropped on the card -> not applied
        const item = owningItem(f);
        try { values[f] = validateTailValue(item, raw); }
        catch { throw new Error(`One correction could not be used: “${item.label || f}”. Nothing was changed.`); }
      }
      confirmPlan = { values, drop: [], via: hasFix ? 'fix' : 'text', target: 'revise' };
    } else if (hasFix) {
      const only = new Set(Object.keys(chat.pending.values));
      // A proposal may carry BANKED facts whose home stage is not
      // the surface on screen (a Point A dump confirmed during the
      // CDDQ opening): their fix values validate against the OWNING
      // stage's item rules, not the current surface's.
      const extraItems = [...only]
        .map((f) => owningItem(f))
        .filter((it) => it && !surface.items.some((t) => t.field === it.field));
      const { values, drop } = validateValueMap({ items: [...surface.items, ...extraItems] }, input.fix_values, { onlyFields: only });
      confirmPlan = { values, drop, via: 'fix' };
    } else {
      confirmPlan = { values: { ...chat.pending.values }, drop: [], via: 'text' };
    }
    // Route every confirmed value home (banking, 29.10.2026): a
    // field whose stage is current or still ahead waits in the
    // staged answers for that stage's own completion; a field whose
    // stage has ALREADY applied is written straight into the coded
    // answers by applyRevisions in the mutation phase — validated
    // HERE, against its owning stage's rules, because the session is
    // client-held and a pending proposal inside it is forgeable: an
    // out-of-range value must be rejected before anything mutates,
    // never trusted into structured.
    const progNow = deriveProgress(session);
    confirmPlan.staged = {};
    confirmPlan.late = {};
    for (const [f, v] of Object.entries(confirmPlan.values)) {
      const home = homeStageIndex(f);
      if (home != null && home < progNow.stagesAnswered) {
        const item = owningItem(f);
        try { confirmPlan.late[f] = validateTailValue(item, v); }
        catch { throw new Error(`One answer could not be used: “${(item && item.label) || f}”. Nothing was changed — check it and send again.`); }
      } else {
        confirmPlan.staged[f] = v;
      }
    }
  }
  let chipPlan = null;
  if (hasChips) chipPlan = validateValueMap(surface, input.chips);
  let revisePlan = null;
  if (hasRevise) {
    // Corrections target APPLIED answers (any stage up to the current
    // one) — validate against the owning stage's item definitions.
    const values = {};
    for (const [field, raw] of Object.entries(input.revise)) {
      let item = null;
      for (const st of STAGES) { item = (st.tail || []).find((t) => t.field === field) || null; if (item) break; }
      if (!item || item.kind === 'derived') throw new Error('That answer cannot be corrected from here — nothing was changed.');
      if (!isFilled(session.structured[field])) throw new Error('That answer has not been given yet, so there is nothing to correct — nothing was changed.');
      if (raw === null || raw === '') throw new Error('A correction cannot empty an answer — nothing was changed.');
      try { values[field] = validateTailValue(item, raw); }
      catch { throw new Error(`One correction could not be used: “${item.label || field}”. Nothing was changed.`); }
    }
    revisePlan = values;
  }
  let extraction = null;
  if (hasText) {
    const clean = sanitizeUserText(input.text, 1200);
    const have = new Set([
      ...Object.keys(session.structured || {}).filter((k) => isFilled(session.structured[k])),
      ...Object.keys(chat.staged).filter((k) => isFilled(chat.staged[k])),
      ...(chipPlan ? [...Object.keys(chipPlan.values), ...chipPlan.drop] : []),
      ...(confirmPlan ? Object.keys(confirmPlan.values) : []),
    ]);
    const stageId = surface.key === 'cddq' ? 'cddq' : surface.key;
    extraction = { clean, ...extractChatAnswers(stageId, clean, have) };
    if (extraction.instructionLike) out.instructionLike = true;
  }

  // ---- mutate. The turn counts only now: a rejected call above left
  // ---- the session untouched, counter included.
  if (hasText || hasConfirm || hasFix || hasRevise) { chat.turns += 1; out.countedTurn = true; }
  if (confirmPlan && confirmPlan.target === 'revise') {
    applyRevisions(session, confirmPlan.values, professions, chat, confirmPlan.via);
    chat.pending = null;
    confirmPlan = null; // consumed — the staging path below must not see it
  }
  if (confirmPlan) {
    for (const f of confirmPlan.drop) delete chat.staged[f];
    for (const [f, v] of Object.entries(confirmPlan.staged)) {
      chat.staged[f] = v;
      logResult(chat, surface.key, f, v, confirmPlan.via);
    }
    // Banked facts whose home stage already applied land directly
    // in the coded answers (validated in the phase above); dropped
    // late fields simply never land — nothing was staged for them.
    if (Object.keys(confirmPlan.late).length) {
      applyRevisions(session, confirmPlan.late, professions, chat, confirmPlan.via);
    }
    chat.pending = null;
  }
  if (revisePlan) applyRevisions(session, revisePlan, professions, chat, 'revise');
  if (extraction) {
    session.transcript.push({ stage: surface.key === 'cddq' ? 'cddq' : surface.key, who: 'user', text: extraction.clean });
    if (extraction.instructionLike) {
      chat.instruction_flag = true;
      chat.log.push({ s: surface.key, f: null, v: null, via: 'instruction_screened' });
      if (chat.log.length > LOG_CAP) chat.log.splice(0, chat.log.length - LOG_CAP);
    } else if (Object.keys(extraction.values).length) {
      // A proposal REPLACES any earlier unconfirmed proposal for the
      // same stage — it never merges silently, and nothing already
      // staged or applied is inside it (the extractor's gap rule).
      // Banked fields belong to a stage that may not be on screen:
      // their confirm lines come from the OWNING stage's item, so a
      // fact confirmed at the opening still shows its label and unit.
      const itemsByField = new Map(surface.items.map((t) => [t.field, t]));
      chat.pending = {
        stage: surface.key,
        values: extraction.values,
        lines: Object.entries(extraction.values).map(([f, v]) => describeValue(itemsByField.get(f) || owningItem(f) || { field: f, label: f }, v)),
      };
    } else if (chat.mirror_corrected && !chat.pending) {
      // Mirror "corrected" mode: the person is fixing APPLIED
      // answers in their own words. Extraction runs over the stages
      // that carry text extractors (0/1/2) with the gap rule INVERTED
      // — only fields already in the coded answers can be proposed,
      // and the proposal confirms through the revise path, never
      // silently (same Yes/Fix card, different target).
      const applied = new Set(Object.keys(session.structured || {}).filter((k) => isFilled(session.structured[k])));
      const allFields = new Set();
      for (const st of STAGES) for (const t of st.tail || []) allFields.add(t.field);
      const have = new Set([...allFields].filter((f) => !applied.has(f)));
      const values = {};
      for (const stageId of [0, 1, 2]) {
        const r = extractChatAnswers(stageId, extraction.clean, have);
        for (const [f, v] of Object.entries(r.values)) {
          if (applied.has(f) && JSON.stringify(session.structured[f]) !== JSON.stringify(v)) values[f] = v;
        }
      }
      if (Object.keys(values).length) {
        chat.pending = {
          stage: 'revise',
          revise: true,
          values,
          lines: Object.entries(values).map(([f, v]) => describeValue(owningItem(f) || { field: f, label: f }, v)),
        };
      }
    }
  }
  if (chipPlan) {
    for (const f of chipPlan.drop) delete chat.staged[f];
    for (const [f, v] of Object.entries(chipPlan.values)) {
      // The stage-5 mirror's "corrected" is not an answer yet — it
      // opens the revise path and applies only when the person then
      // confirms (or refuses) after correcting.
      if (surface.key === 5 && f === 'mirror_confirmed' && v === 'corrected') {
        chat.mirror_corrected = true;
        continue;
      }
      if (surface.key === 5 && f === 'mirror_confirmed') chat.mirror_corrected = false;
      chat.staged[f] = v;
      logResult(chat, surface.key, f, v, 'chips');
    }
  }

  // ---- completion: apply the current stage when its required set is
  // ---- fully covered — but NEVER while a proposal is unconfirmed.
  if (!chat.pending) {
    const now = currentSurface(session);
    if (now.key === 'cddq') {
      const votes = {};
      let all = true;
      for (const it of CDDQ_ITEMS) {
        const v = chat.staged[it.field];
        if (!isFilled(v)) { all = false; break; }
        votes[it.field] = v;
      }
      if (all) {
        applyCddq(session, votes);
        for (const it of CDDQ_ITEMS) delete chat.staged[it.field];
        out.appliedStage = 'cddq';
      }
    } else if (typeof now.key === 'number' && now.key <= 5) {
      const missing = missingRequired(session, now);
      if (!missing.length) {
        const tail = {};
        for (const t of now.items) {
          if (t.kind === 'derived') continue;
          if (isFilled(chat.staged[t.field])) tail[t.field] = chat.staged[t.field];
        }
        const prog = deriveProgress(session);
        session.phase = 'stages';
        session.stage_index = prog.stagesAnswered;
        applyStage(session, { freeText: '', tailAnswers: tail }, professions);
        for (const t of now.items) delete chat.staged[t.field];
        out.appliedStage = now.key;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The view the API packet is built from.
// ---------------------------------------------------------------------------
export function chatStateView(session) {
  const chat = ensureChat(session);
  const surface = currentSurface(session);
  let kind = 'question';
  if (session.phase === 'done') kind = 'done';
  else if (surface.key === 'fit') kind = 'fit';
  else if (chat.turns >= CHAT_TURN_CAP) kind = 'cap';
  else if (chat.pending) kind = 'confirm';
  else if (chat.mirror_corrected && surface.key === 5) kind = 'revise';
  return {
    kind,
    surface_key: surface.key,
    missing: kind === 'question' || kind === 'confirm' ? missingRequired(session, surface) : [],
    staged_values: { ...chat.staged },
    pending: chat.pending
      ? { stage: chat.pending.stage, values: chat.pending.values, lines: chat.pending.lines, revise: !!chat.pending.revise }
      : null,
    turns: chat.turns,
    cap: CHAT_TURN_CAP,
    instruction_flag: !!chat.instruction_flag,
  };
}
