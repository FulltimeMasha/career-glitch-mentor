-- Career Glitch Mentor — mentor_sessions LOCKDOWN (security audit C3, 27.10.2026).
--
-- Why: the /mentor page no longer reads or writes this table at all
-- (founder decision: nothing is saved; the anon key was removed from
-- the page and the API's writer was deleted). But the table itself
-- still carries the three permissive anon policies from
-- 001_mentor_sessions.sql, so anyone holding the old public anon key
-- can still read every stored session. This script closes that.
--
-- What it does: drops all three anon policies and revokes the table
-- grants from the public roles. RLS stays ON with zero policies, which
-- means: anon/authenticated get nothing; only the dashboard and the
-- service role can touch the table. Existing rows stay stored.
--
-- Apply manually in the Supabase SQL editor (project stwzrcahhieqbabvljue).

drop policy if exists "mentor_sessions anon insert" on public.mentor_sessions;
drop policy if exists "mentor_sessions anon select" on public.mentor_sessions;
drop policy if exists "mentor_sessions anon update" on public.mentor_sessions;

revoke all on table public.mentor_sessions from anon;
revoke all on table public.mentor_sessions from authenticated;

alter table public.mentor_sessions enable row level security;

-- OPTIONAL, only if the stored sessions should not exist at all
-- (they are real users' interview answers; the product now saves
-- nothing, so keeping them has no product purpose):
-- delete from public.mentor_sessions;
