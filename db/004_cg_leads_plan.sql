-- 004_cg_leads_plan.sql — Matchmaker 2.0 extension: "save my plan"
-- (founder brief 28.10.2026 §5.8).
-- Run this in the Supabase SQL Editor for project stwzrcahhieqbabvljue
-- (the project the dashboard shows as "solobid").
--
-- Adds the plan columns to public.cg_leads. When a visitor consents in
-- the "Save my plan" block after the verdict, the server stores the FULL
-- plan snapshot (the server-computed result JSON: verdict, stated-target
-- cards, ladders, state pay, programs, bridge evaluation) under the
-- email they gave. NO email is sent — the product has no mail service;
-- the page says the plan is saved, never that it was emailed.
--
-- Access posture unchanged: RLS stays ON with no policies; only the
-- server-side API (service-role key) reads or writes these columns.
-- Until this migration runs, the plan_save API action answers a clean
-- 503 ("not switched on yet") instead of failing.

alter table public.cg_leads
  add column if not exists plan            jsonb,
  add column if not exists plan_email      text,
  add column if not exists plan_consent_at timestamptz,
  add column if not exists plan_saved_at   timestamptz;
