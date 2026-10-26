# Build log — Career Glitch Mentor

Meta Global AI Developer Hackathon, Startup track. Build window: Oct 26 – Nov 4, 2026.

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
