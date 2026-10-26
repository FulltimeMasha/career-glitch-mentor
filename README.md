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

- **Muse Spark 1.3** — talks with you, checks on you, rebuilds your plan.
- **Muse Wonder 1.0** — writes your verdict and your plan.
- **Muse Image 1.0** — draws your cards.

The numbers always come from the verified data — never made up.

## How scoring works

Two scores, shown as **ranges** — **LOVE** and **POTENTIAL** — never a single "match %".

Scores come only from fixed structured answers: the anchored tail questions at the end of each interview stage, plus measured profession trials where they apply. The AI conversation never sets scores. It can interview, quote your own words back, build the mirror of contradictions, and write the report — it cannot move a number.

Banned, by design: no MBTI or personality types, no grit score, no personality labels as verdicts. Self-rated ability is not a scoring input. Perceived fit ("this real day is not mine") can only lower a candidate's fitness category by one step — it never raises a score. Full reasoning: [science-map.md](science-map.md).

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
- The personal track.

The profession database and the /start, /pivot, /bridge pages pre-date the hackathon. The Mentor is the new layer, built on top during the event.

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

The page runs standalone in local guided mode: it walks every stage and collects structured answers on the device. The live interview needs the Meta Model API key, which is held in Muse's secure connector — never in this repo, never in the page. With no key present, nothing pretends to be the model.

Session persistence is optional: `db/001_mentor_sessions.sql` is applied manually in the Supabase SQL editor; until then the page keeps state in `localStorage` only, by design.

## Author

Masha Rudnik, solo founder, North Carolina. She builds everything herself, with AI agents.

careerglitch.com · fulltimemasha.com
