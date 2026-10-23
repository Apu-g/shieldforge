-- ===========================================================================
-- ShieldForge — Supabase schema (owned by Module 3 / Dashboard + Control Plane)
--
-- Run this file first in the Supabase SQL editor, then run seed.sql.
-- The table DDL below is copied verbatim from 01_ARCHITECTURE.md §5.
-- Everything after the "Hackathon additions" banner is dashboard-owned wiring
-- (indexes, RLS, Realtime, grants) and does not change the shared contract.
-- ===========================================================================

-- tenants: one row per team/customer using the platform (can be just 1 row for the demo)
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

-- origins: the "connect a domain" step — just a Vercel URL
create table origins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  origin_url text not null,           -- e.g. https://victim-shop.vercel.app
  proxy_path text not null,           -- e.g. /t/victim-shop  (how the proxy routes to it)
  status text default 'active',       -- active | paused
  created_at timestamptz default now()
);

-- events: every request the proxy processed (redacted — never raw cookie/token values)
create table events (
  id uuid primary key default gen_random_uuid(),
  origin_id uuid references origins(id),
  ts timestamptz default now(),
  method text,
  path text,
  ip text,
  user_agent text,
  status_code int,
  rule_hit text,                      -- which sync WAF rule fired, if any
  features jsonb,                     -- extracted features sent to ML (no raw secrets)
  ml_attack_class text,
  ml_confidence float,
  ml_risk_score int
);

-- findings: a specific issue worth showing on the dashboard
create table findings (
  id uuid primary key default gen_random_uuid(),
  origin_id uuid references origins(id),
  event_id uuid references events(id),
  severity text,                      -- low | medium | high | critical
  category text,                      -- xss | sqli | weak_cookie | php2shell | session_replay | ...
  title text,
  evidence jsonb,
  ai_summary text,                    -- filled in by Part 4's LLM agent
  status text default 'open',         -- open | actioned | fixed_verified
  created_at timestamptz default now()
);

-- incidents: a finding that triggered an automated or human response
create table incidents (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid references findings(id),
  action_taken text,                  -- log | alert | rate_limit | challenge | temp_block | session_invalidate
  confidence float,
  resolved boolean default false,
  created_at timestamptz default now()
);

-- policies: per-origin thresholds that drive automated response
create table policies (
  id uuid primary key default gen_random_uuid(),
  origin_id uuid references origins(id),
  auto_block_threshold float default 0.9,
  alert_threshold float default 0.6,
  mode text default 'shadow'          -- shadow (log-only) | enforce
);

-- audit_log: every automated or manual action, for the CERT-In export
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text,                         -- 'system' | user id
  action text,
  target jsonb,
  ts timestamptz default now()
);

-- training module (Part 4)
create table training_users (
  id uuid primary key default gen_random_uuid(),
  name text,
  risk_score int default 0
);

create table training_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references training_users(id),
  event_type text,                    -- phishing_sent | phishing_clicked | lesson_assigned | lesson_completed
  ts timestamptz default now()
);

-- ===========================================================================
-- Hackathon additions (Module 3 owns these)
-- ===========================================================================

-- Helpful indexes for the dashboard queries and the export window.
create index if not exists events_ts_idx on events (ts desc);
create index if not exists events_origin_id_idx on events (origin_id);
create index if not exists findings_created_at_idx on findings (created_at desc);
create index if not exists findings_origin_id_idx on findings (origin_id);
create index if not exists findings_event_id_idx on findings (event_id);
create index if not exists incidents_created_at_idx on incidents (created_at desc);
create index if not exists incidents_finding_id_idx on incidents (finding_id);
create index if not exists training_events_user_id_idx on training_events (user_id, ts);
create unique index if not exists origins_origin_url_key on origins (origin_url);
create unique index if not exists policies_origin_id_key on policies (origin_id);

-- Realtime needs the full row (including status/ai_summary) on UPDATE events.
alter table events replica identity full;
alter table findings replica identity full;
alter table incidents replica identity full;

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Hackathon posture: permissive access for anon + authenticated so the demo
-- works with the public anon key and without a login flow. In production,
-- replace "hackathon_demo_all" with tenant-scoped policies using
-- auth.uid() / a tenant_members table, and stop granting anon write access.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'tenants', 'origins', 'events', 'findings', 'incidents',
    'policies', 'audit_log', 'training_users', 'training_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "hackathon_demo_all" on public.%I', t);
    execute format(
      'create policy "hackathon_demo_all" on public.%I for all to anon, authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: live findings / incidents (and events for the detection chart)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['events', 'findings', 'incidents'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
