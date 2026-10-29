// tests/plan-save.test.mjs
// Matchmaker 2.0 extension (brief 28.10 §5.8), gate assertion (h): the
// plan snapshot is written only with explicit consent, from the
// server-recomputed result, into the cg_leads plan columns — checked at
// API level against a mock PostgREST store. Run from repo root: npm test.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { createSession, applyCddq, applyStage } from '../api/_lib/engine/interview.mjs';

const LEAD_ID = '11111111-1111-4111-8111-111111111111';
const writes = [];
let server = null;
let handleMentorRequest = null;

before(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      writes.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : null });
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'POST') { res.statusCode = 201; res.end(JSON.stringify([{ id: LEAD_ID }])); }
      else if (req.method === 'PATCH') { res.statusCode = 200; res.end(JSON.stringify([{ id: LEAD_ID }])); }
      else { res.statusCode = 200; res.end('[]'); }
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  process.env.CG_SUPABASE_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.CG_SUPABASE_KEY = 'test-service-key';
  ({ handleMentorRequest } = await import('../api/_lib/mentor-core.mjs'));
});
after(() => { if (server) server.close(); });

// A complete Marina-shaped session, driven through the real stage machine.
function marinaSession() {
  const s = createSession('pivot');
  applyCddq(s, { cddq_vote_1: 'missing_facts', cddq_vote_2: 'missing_knowledge', cddq_vote_3: 'would_study_first' });
  applyStage(s, { freeText: 'x', tailAnswers: {
    country: 'US', state: 'NC', age: 37, current_profession_name: 'Painting Company Owner',
    income_floor_k: 100, cushion_months: 3, hours_per_day: 2.5, budget_k: 5,
    documents_ok: 'partial', health_limits: ['none'], languages: ['en', 'ru'],
    degree_status: 'foreign_degree', degree_field: 'engineering', degree_level: 'bachelor',
    degree_country: 'Belarus', degree_years: 10,
  } });
  applyStage(s, { freeText: 'x', tailAnswers: { attempts_started: 3, attempts_finished: 2, exit_pattern: 'energy', energy_themes: ['people', 'building'] } });
  applyStage(s, { freeText: 'x', tailAnswers: {
    values_rank: ['working_conditions', 'relationships', 'support', 'achievement', 'recognition', 'independence'],
    autonomy_need: 1, relatedness_need: 2,
    supports_money: 1, supports_time: 0, supports_people: 2, supports_learning_access: 2,
    target_fields: ['health'], stated_target: 'Registered Nurse',
  } });
  applyStage(s, { freeText: 'x', tailAnswers: { barriers: ['time', 'money'], red_lines: ['no_nights'] } });
  applyStage(s, { freeText: 'x', tailAnswers: {
    riasec_r1: 3, riasec_r2: 3, riasec_i1: 2, riasec_i2: 2, riasec_a1: 1, riasec_a2: 1,
    riasec_s1: 4, riasec_s2: 4, riasec_e1: 2, riasec_e2: 1, riasec_c1: 2, riasec_c2: 2,
    remote_pref: 0, hands_pref: 1, people_pref: 2,
  } });
  applyStage(s, { freeText: 'x', tailAnswers: { mirror_confirmed: 'confirmed' } });
  return s;
}

test('plan_save: without consent -> 400 and nothing is written', async () => {
  writes.length = 0;
  const r = await handleMentorRequest({ action: 'plan_save', email: 'marina@example.com', consent: false, session: marinaSession() });
  assert.equal(r.status, 400);
  assert.equal(r.json.ok, false);
  assert.equal(writes.length, 0);
});

test('plan_save: bad email -> 400 and nothing is written', async () => {
  writes.length = 0;
  const r = await handleMentorRequest({ action: 'plan_save', email: 'not-an-email', consent: true, session: marinaSession() });
  assert.equal(r.status, 400);
  assert.equal(writes.length, 0);
});

test('plan_save: unfinished session -> 409 and nothing is written', async () => {
  writes.length = 0;
  const s = createSession('pivot');
  applyCddq(s, { cddq_vote_1: 'missing_facts', cddq_vote_2: 'missing_knowledge', cddq_vote_3: 'would_study_first' });
  const r = await handleMentorRequest({ action: 'plan_save', email: 'marina@example.com', consent: true, session: s });
  assert.equal(r.status, 409);
  assert.equal(writes.length, 0);
});

test('plan_save: with consent the FULL plan snapshot is written (h)', async () => {
  writes.length = 0;
  const r = await handleMentorRequest({ action: 'plan_save', email: 'Marina@Example.com', consent: true, session: marinaSession() });
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.saved, true);
  assert.equal(writes.length, 1);
  const w = writes[0];
  assert.equal(w.method, 'POST'); // no lead id given -> a fresh row
  assert.equal(w.body.plan_email, 'marina@example.com');
  assert.ok(w.body.plan_consent_at, 'consent timestamp stored');
  assert.ok(w.body.plan_saved_at, 'save timestamp stored');
  const plan = w.body.plan;
  assert.equal(plan.v, 1);
  assert.ok(plan.result, 'snapshot carries the result');
  assert.ok(Array.isArray(plan.result.top3), 'snapshot carries the verdict top-3');
  // The snapshot is the DECORATED result: her engineering bridge and the
  // NC state pay ride along in the same stored object.
  assert.ok(plan.result.bridge_evaluation, 'snapshot carries bridge_evaluation');
  assert.equal(plan.result.bridge_evaluation.degree.field, 'engineering');
  assert.equal(plan.result.state_pay.state, 'NC');
});

test('plan_save: with a gate lead id the snapshot attaches to that row', async () => {
  writes.length = 0;
  const r = await handleMentorRequest({ action: 'plan_save', email: 'marina@example.com', consent: true, lead_id: LEAD_ID, session: marinaSession() });
  assert.equal(r.status, 200);
  assert.equal(r.json.lead_id, LEAD_ID);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, 'PATCH');
  assert.match(writes[0].url, /id=eq\./);
  assert.ok(writes[0].body.plan, 'plan in the patch');
});
