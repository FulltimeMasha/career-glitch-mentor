-- Career Glitch Mentor — mentor_sessions
-- Apply manually in the Supabase SQL editor (project stwzrcahhieqbabvljue).
-- Not yet applied as of Day 1 (26.10.2026). The /mentor page treats
-- failures against this table as expected and silent until it is applied.
-- Pattern matches the existing site's waitlist flow: anon-key client
-- writes via PostgREST, guarded by permissive RLS policies below.

create table if not exists public.mentor_sessions (
  id uuid primary key default gen_random_uuid(),
  client_ref text unique,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  door text,
  cddq_type text,
  stage int default 0,
  status text default 'in_progress',
  structured jsonb default '{}'::jsonb,
  scores jsonb,
  report text
);

alter table public.mentor_sessions enable row level security;

-- Permissive anon policies (same posture as the existing site's
-- anon-key client writes). Tighten before any public scale-up.
drop policy if exists "mentor_sessions anon insert" on public.mentor_sessions;
create policy "mentor_sessions anon insert"
  on public.mentor_sessions for insert to anon
  with check (true);

drop policy if exists "mentor_sessions anon select" on public.mentor_sessions;
create policy "mentor_sessions anon select"
  on public.mentor_sessions for select to anon
  using (true);

drop policy if exists "mentor_sessions anon update" on public.mentor_sessions;
create policy "mentor_sessions anon update"
  on public.mentor_sessions for update to anon
  using (true)
  with check (true);
