# Build log — Career Glitch Mentor

Meta Global AI Developer Hackathon, Startup track. Build window: Oct 26 – Nov 4, 2026.

## Day 2 — 26.10.2026 (Stage 2: API proxy + O*NET 30.2)

### WS1 — Mentor API proxy + live wiring

- Server core (`server/mentor-core.mjs`): stateless handler — the client holds the session JSON; actions health / start / current / cddq / stage / fit / report. Spark 1.3 writes the mentor turns (max_output_tokens 2500, reasoning-low probe + fallback), the deterministic engine scores, Wonder 1.0 writes the report. Name/gender/country never reach the recommendation step or Wonder (counterfactual rule intact).
- Hosting: the API ships INSIDE the existing careerglitch Vercel project as new files only (`api/mentor.js` + `api/_lib/…`), under the established manifest discipline (patch named files only, calls without teamId). After every deploy, `/`, `/start`, `/pivot`, `/bridge` were re-fetched and verified **byte-identical** — the frozen door experiment is untouched.
- Architecture fact: the Meta API key exists only inside the connector in this build environment (a surrogate swaps it in for api.meta.ai). A Vercel function therefore cannot hold it: on Vercel the full deterministic flow runs and the LLM steps answer `llm.status: 'unavailable'` honestly (the report action refuses with 502 — never fabricates). The full LLM path runs on the local host (`server/local-server.mjs`, port 8377).
- Persistence — BLOCKED, precisely: no working DDL channel exists from this environment. PostgREST answers (table missing: 404/PGRST205), direct Postgres is intercepted by the egress proxy (invalid SSL negotiation on 198.18.x.x addresses), no SUPABASE_ACCESS_TOKEN, supabase CLI unauthorised. The endpoint wires persistence on every transition and reports `persistence.state: 'blocked'` with the reason until `db/001_mentor_sessions.sql` is applied in the Supabase SQL editor; sessions persist the moment the table exists. Nothing was faked.
- Live verification (both hosts): one full session — start → CDDQ → stages 0–5 → verdict → stage-6 veto → done. Locally: 8/8 real Meta calls, Wonder report 1,391 words, no match %. Against careerglitch.com: deterministic path completes with the identical verdict; report refuses honestly. Evidence: `smoke-output/live-session/`.

### WS2 — O*NET 30.2 import + engine swap

- Source: official `db_30_2_text.zip` from onetcenter.org (30.2 pinned; 31.0 breaks the structure). 923 data-level occupations.
- Mapping: auto-match (exact / alternate-title / token) then a **full hand review** — 140 overrides with written reasons in `scripts/import_onet.py`: alternate-title collisions corrected (Handyman was matched to Farmworkers; Police Officer to a records-officer niche), parent-series mappings flagged `bls_inherited` (SRE → Software Developers, Commercial Insurance Producer → Insurance Sales Agents, AI Automation Specialist → Software Developers…), owner-operator cards mapped to the trade the owner performs, and 31 professions honestly left unmatched (creator economy, absentee-owner businesses, unlicensed roles).
- **Coverage: 308 / 339 professions** with real RIASEC profiles (OI/7), work-values extents with their frozen-snapshot date stamped per occupation (Work Importance Profiler closed 03.06.2024), abilities/skills LV vectors, top-5 tasks by importance, and Job Zone. `bls_vintage: '2025-35'` stamped on every vector.
- Found in the data: the frozen Work Values snapshot has **no rows for 20 SOC-2018-renumbered occupations** (Software Developers among them) — their supplies stay Day-1 stubs, flagged per field. Abilities/skills LV are likewise absent for 11. Honest gaps, not inventions.
- `bls_ai_exposure`: the official BLS XLSX is fetch-blocked from this environment (Akamai 403 on every route tried). The field is populated ONLY from authoritative statements actually read (BLS EP FAQ text: CSR / Web Developers / Personal Financial Advisors = Very high; Dental Hygienists / Firefighters / Maids = Low; sourced secondary reports for 7 more SOCs) — 11 professions carry a value with tier + source attached; the rest stay null. Note: BLS publishes Web Developers as the combined group 15-1257 while O*NET splits it (15-1254 / 15-1255) — the combined rating is NOT distributed onto the splits.
- Engine swap (`applyOnetImport` in `engine/professions.mjs`): sourced values replace stubs wherever coverage exists; supplies is derived from the sourced extent (one source, no drift); unmatched professions keep stubs + nulls + a `no_onet_match` flag with the written reason. The import ships to Vercel as 6 shards ≤ 80 KB (`api/_lib/data/`) — the connector upload path dies at ~90 KB per file (OS argv limit on the base64 payload) — and the loader merges them back; a bundle-layout simulation and the deployed verdict both prove the shards drive scoring in production (the verification persona's top-3 changed vs the stub era and matches the local run exactly: Doula / Private Tutor (in person) / Tutoring Center Owner, all category A).
- Page: `web/mentor.html` now probes `/api/mentor` on load and, when live, runs the full server flow (defs rendered generically from stages.json shapes; stage 6 rates the server's own candidates; the verdict panel renders the engine result; the written report is attempted and, on a key-less host, replaced by an explicit "not available — nothing fabricated" note). Guided mode is untouched and remains the fallback. O*NET CC BY 4.0 attribution added to the page footer and README.
- Acceptance C (`scripts/acceptance_c.mjs`, output in `acceptance/`): **10 pass, 5 pass-with-exception, 5 fail.** RIASEC equals raw O*NET 30.2 for all 18 SOC-mapped rows; AI exposure only with evidence; CSR special row passes (no base row; card −5% to 2035; Very high per BLS text; median deliberately absent). All 5 fails are one root cause — `payK` in the site's professions.json disagrees with the BLS-cited median on the profession's own roadmap card: Accountant 120 vs ~84K, Software Developer 125 vs ~136K, Graphic Designer 45 vs ~63K, Electrician 75 vs ~63K, AI Automation Specialist 120 vs ~100K (postings figure). Site data was NOT edited — the door experiment is frozen; reconciliation is a post-freeze fix. Exceptions: Commercial Insurance Producer, AI Automation Specialist, Site Reliability Engineer (all `bls_inherited` + explanation), Physician = the Family Physician card, Car Wash Owner (no occupation exists).
- Tests after the swap: unit suite 9/9 (test 6 rewritten to the WS2 invariant — a field is either null-with-flag or sourced-with-provenance); persona-10 smoke still passes (insufficient_data, no stage 6, 987-word report).

### Known wart

- The CRNA profession's slug is `registered-nurse-2` (roadmap-slug collision in the Day-1 loader). Internal only; left alone mid-experiment.

## Day 1 — 26.10.2026

### New work today

- Meta Model API connector + helper verified against the live Meta Model API.
- Deterministic scoring engine (LOVE / POTENTIAL as ranges; structured-tail inputs only).
- Stage definitions: CDDQ routing (3 questions), then stages 0–6 per the test v3 spec, each with a free-text prompt and a fixed structured tail.
- Front-end: `web/mentor.html` — the `/mentor` page (start screen, three doors, chat + structured-tail interview UI, verdict panel, local guided mode).
- Migration SQL: `db/001_mentor_sessions.sql` — `mentor_sessions` table + RLS + anon policies.
- Science map copied into the repo as `science-map.md` and linked from the README.

Smoke: persona 10 end-to-end — PASSED with real Meta API calls (7× Muse Spark 1.3 interview turns + 1× Muse Wonder 1.0 report, reasoning effort "low"). The "not ready" 18-year-old produced mode `insufficient_data` (CDDQ not_ready — no verdict forced), a 4-step exploration plan, and a 922-word report with no profession verdict and no match %. Evidence: smoke-output/persona10/ (transcript.json, result.json, report.md). Scoring suite: 9/9 unit tests pass. API lesson logged: reasoning at default/max effort can consume the entire output budget and return zero message text — Spark turns need max_output_tokens ≥2500 and Wonder is pinned to effort "low".

### Pre-existing (not hackathon work)

- The 339-profession verdict database, checked against BLS data.
- The careerglitch.com site.
- The `/start`, `/pivot` and `/bridge` pages, including the $49 personal-map offer (an experiment running during the hackathon).

### Stubbed / not yet

- O*NET 30.2 import pending later this week — card fields `onet_soc` / `bls_ai_exposure` / `abilities_lv` are null-flagged until it lands.
- Supabase table: SQL written (`db/001_mentor_sessions.sql`), not yet applied. The page treats remote-save failures as expected and silent.
- `/mentor` page ships in local guided mode until the server-side API proxy lands (`MENTOR_API_BASE` is empty). No fake AI replies: mentor messages are the fixed stage prompts, labelled as the guided flow.
- Proactive check-in loop, per the sprint plan, is a later day.
