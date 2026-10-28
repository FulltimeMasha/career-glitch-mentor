-- 003_cg_leads.sql — Career Glitch Matchmaker lead gate (founder TZ, 28.10.2026).
-- Run this in the Supabase SQL Editor for project stwzrcahhieqbabvljue
-- (the project the dashboard shows as "solobid") — the same project that
-- holds mentor_sessions.
--
-- What a lead row holds: the gate fields (name, email, the person's own
-- line about their job / the job they want), the recommendation snapshot
-- the SERVER computed after the verdict, and the one-tap reaction.
-- Interview ANSWERS are never stored here (or anywhere).
--
-- Access posture, identical to the mentor_sessions lockdown (002):
-- RLS is ON and there are deliberately NO policies — anon and
-- authenticated get nothing at all. The only writer/reader is the
-- server-side API using the service-role key (env CG_SUPABASE_URL /
-- CG_SUPABASE_KEY on the careerglitch Vercel project), which bypasses RLS.

create table if not exists public.cg_leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,
  email       text not null,
  self_role   text,                                  -- gate line: job now / job wanted
  current_job text,                                  -- stage-0 current_profession_name snapshot
  recommended jsonb,                                 -- [{slug, name, verdict, pay_k}] — server-computed top-3
  top1_slug   text,
  verdict_at  timestamptz,
  reaction    text check (reaction in ('love', 'meh', 'nope')),  -- 😍 / 😐 / 😤
  reaction_at timestamptz,
  ua          text check (ua in ('mobile', 'desktop'))
);

alter table public.cg_leads enable row level security;

-- No policies on purpose. Do not add anon/authenticated policies here:
-- the public anon key must never read or write this table.
revoke all on table public.cg_leads from anon, authenticated;

create index if not exists cg_leads_created_idx on public.cg_leads (created_at desc);
