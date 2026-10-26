# Career Glitch Mentor

A mentor who writes first.

## The morning this product is for

You wake up. Your feed says AI took another job. A friend just switched to some AI role and now earns double. And you think:

*What the hell is happening with jobs? I don't understand anything anymore.*

And the FOMO is awful.

This mentor is the answer to that morning. It explains what is really happening with work — with real numbers, not hype — finds where you fit in it, and builds your plan.

## How it works

1. **You talk.** The mentor asks deep questions: where you are now, what you really want, what you keep avoiding, what you can actually do.
2. **You get a verdict.** It matches you with real professions. Every profession in our base is checked against official U.S. labor data (Bureau of Labor Statistics): real pay, real outlook. Each one says YES or NO for starting in 2027.
3. **You get a plan.** Your top 3 professions, how your pay grows step by step, what can go wrong, and how not to quit.
4. **The mentor stays.** It writes to you first:
   - "You planned to finish this module by Wednesday. How did it go?"
   - Fell behind? It moves the dates and makes the steps easier.
   - News in your profession? It brings it and says what changes in your plan.
   - Finished a step? It draws you an achievement card you can share.

Three ways in: start a new profession, grow in the one you have with AI, or move your foreign degree into the U.S. version of your profession.

## Made with Meta AI

- **Muse Spark 1.3** — runs the interview: the conversation, the questions, the check-ins.
- **Muse Wonder 1.0** — the synthesis: writes the verdict explanation and the plan in human words.
- **Muse Image 1.0** — draws your cards.
- **Deterministic scoring engine (ours — no model)** — turns the structured answers into the LOVE / POTENTIAL ranges, the fitness categories and the flags. Models talk and write; only the engine counts.

The numbers always come from the verified data — never made up.

## How scoring works

Two scores, shown as **ranges** — **LOVE** and **POTENTIAL** — never a single "match %".

Scores come only from fixed structured answers: the anchored tail questions at the end of each interview stage, plus measured profession trials where they apply. The AI conversation never sets scores. It can interview, quote your own words back, build the mirror of contradictions, and write the report — it cannot move a number.

Banned, by design: no MBTI or personality types, no grit score, no personality labels as verdicts. Self-rated ability is not a scoring input. Perceived fit ("this real day is not mine") can only lower a candidate's fitness category by one step — it never raises a score. Full reasoning: [science-map.md](science-map.md).

Name, gender and country never reach the recommendation step or the report writer: the same structured answers must produce the same verdict regardless of who the person is.

## Verification — what we check, and what it found

- **Unit suite:** 9/9 (scoring compositions, deficit-only penalty, veto direction, stub-vs-sourced field invariants).
- **End-to-end smoke (acceptance A):** a scripted "not ready" 18-year-old completes the interview and must NOT receive a verdict. Result, on real Meta API calls (8/8): mode `insufficient_data`, a 4-step exploration plan, a 987-word report with no profession verdict and no match %. Re-run after the O*NET swap — same behaviour.
- **Live-session verification (both hosts):** start → CDDQ routing → stages 0–5 → verdict → stage-6 veto → done. Locally: Wonder report 1,391 words. On careerglitch.com: the deterministic path completes with the identical verdict; the written report refuses (502) because that host holds no API key — it is never fabricated.
- **Acceptance C — 20-profession cross-check against the sources** (median exactly per BLS, 2025–35 direction per BLS, AI category exactly per the BLS table, RIASEC per O*NET 30.2): **10 pass · 5 pass with exception · 5 fail.** RIASEC equals raw O*NET 30.2 for all 18 SOC-mapped rows. The exceptions carry a `bls_inherited` flag with a written explanation (Commercial Insurance Producer, AI Automation Specialist, Site Reliability Engineer mapped to a parent series; Physician = the Family Physician card; Car Wash Owner — no such occupation exists). **All 5 fails are one root cause:** the pay figure in the site's profession base disagrees with the BLS-cited median on the profession's own roadmap card — Accountant 120K in the base vs ~84K on the card, Software Developer 125K vs ~136K, Graphic Designer 45K vs ~63K, Electrician 75K vs ~63K, AI Automation Specialist 120K vs ~100K. The site data was NOT silently edited: the door pages are a frozen live experiment, and the reconciliation is scheduled as a post-freeze fix. Full output: [acceptance/](acceptance/).

## Built during the hackathon

Built for the Meta Global AI Developer Hackathon (Startup track, Build for Your World).

**PRE-EXISTING — before Oct 26, 2026:**

- The 339-profession verdict database, checked against BLS data.
- The careerglitch.com site.
- The `/start`, `/pivot` and `/bridge` pages, including the $49 personal-map offer — an experiment that runs during the hackathon.

**NEW — in the window Oct 26 – Nov 4, 2026, everything in this repo:**

- The Mentor interview engine (Muse Spark 1.3).
- The deterministic scoring engine implementing the published science map — [science-map.md](science-map.md).
- The `/mentor` page (`web/mentor.html`).
- The Mentor API (`server/`, deployed as a Vercel function at `careerglitch.com/api/mentor`) — the page runs the full live flow against it: Spark interview turns, the engine's verdict, and the Wonder report on hosts that hold the key.
- The O*NET 30.2 data layer (`scripts/import_onet.py` → `data/onet-import.json`): real RIASEC profiles, work-values extents, abilities/skills vectors, tasks and Job Zones for **308 of the 339** professions, every mapping hand-reviewed. The other 31 have no clean O*NET occupation (creator-economy and absentee-owner cards) and are flagged, never force-matched.
- The personal track.

The profession database and the /start, /pivot, /bridge pages pre-date the hackathon. The Mentor is the new layer, built on top during the event.

## Data & attribution

This project includes information from the O*NET 30.2 Database by the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA), used under the CC BY 4.0 license. O*NET® is a trademark of USDOL/ETA. Career Glitch has modified all or some of this information. USDOL/ETA has not approved, endorsed, or tested these modifications.

Outlook and pay figures: U.S. Bureau of Labor Statistics, projections vintage 2025–35. The official BLS AI-exposure categories are carried as their own field (`bls_ai_exposure`), separate from outlook — populated only where an authoritative BLS statement was read, with its source attached; never inferred for the rest.

## Honesty limits

- **Forecasts are not verdicts.** BLS's own evaluation of its 2014–24 projections found the direction right for 86% of occupation groups — good context, not a promise. No single forecast number decides a verdict: the engine combines outlook with pay, openings, sourced AI-exposure evidence and the person's structured inputs, and shows the result as ranges.
- **The score weights are editorial — for now.** There is no validated scientific formula that turns interests + values + constraints into one true match; the LOVE / POTENTIAL compositions are published in [science-map.md](science-map.md) and stay fixed until real outcome data (90-day and 12-month follow-ups) can calibrate them. We say this on the record rather than dressing the weights up as science.
- **Sparse fields stay empty.** Only 11 of 339 professions carry a sourced BLS AI-exposure value; the rest are null. The O*NET work-values data is a frozen snapshot (the Work Importance Profiler closed 03.06.2024), stamped per occupation; 20 renumbered occupations have no rows at all, and their fields stay flagged stubs instead of invented values.
- **No key, no fake report.** On a host without the Meta API key, the interview and the deterministic verdict still run — and the written report refuses instead of being fabricated.

## Try it

```bash
git clone <this repo>
cd career-glitch-mentor

# Scoring / engine tests (no dependencies, Node 20+)
node --test tests/

# The /mentor page, locally
python3 -m http.server 8080 --directory web
# then open http://localhost:8080/mentor.html
```

The page runs standalone in local guided mode: it walks every stage and collects structured answers on the device. Served from careerglitch.com it probes `/api/mentor` and switches to the live server flow automatically. The live interview needs the Meta Model API key, which is held in Muse's secure connector — never in this repo, never in the page. With no key present, nothing pretends to be the model: the deterministic flow still completes, and the written report refuses honestly instead of being fabricated.

To run the full stack locally (API + page on one origin):

```bash
node server/local-server.mjs   # http://127.0.0.1:8377/mentor
node scripts/verify_live_session.mjs http://127.0.0.1:8377
node scripts/acceptance_c.mjs  # the 20-profession sourced-data cross-check
```

Session persistence: `db/001_mentor_sessions.sql` is applied manually in the Supabase SQL editor (no SQL channel exists from the build environment — the endpoint reports this honestly on every response and starts persisting the moment the table exists).

## Author

Masha Rudnik, solo founder, North Carolina. She builds everything herself, with AI agents.

careerglitch.com · fulltimemasha.com
