-- ShieldForge core schema (01_ARCHITECTURE.md §5).
-- Canonical owner: Part 3 (dashboard/supabase). This copy is the migration applied
-- for the shared hackathon project so Part 4 can run standalone.
-- RLS is on with no public policies: clients use the service role server-side.

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists origins (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id),
  origin_url text not null,
  proxy_path text not null,
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  origin_id uuid references origins(id),
  ts timestamptz default now(),
  method text,
  path text,
  ip text,
  user_agent text,
  status_code int,
  rule_hit text,
  features jsonb,
  ml_attack_class text,
  ml_confidence float,
  ml_risk_score int
);

create table if not exists findings (
  id uuid primary key default gen_random_uuid(),
  origin_id uuid references origins(id),
  event_id uuid references events(id),
  severity text,
  category text,
  title text,
  evidence jsonb,
  ai_summary text,
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid references findings(id),
  action_taken text,
  confidence float,
  resolved boolean default false,
  created_at timestamptz default now()
);

create table if not exists policies (
  id uuid primary key default gen_random_uuid(),
  origin_id uuid references origins(id),
  auto_block_threshold float default 0.9,
  alert_threshold float default 0.6,
  mode text default 'shadow'
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text,
  target jsonb,
  ts timestamptz default now()
);

create table if not exists training_users (
  id uuid primary key default gen_random_uuid(),
  name text,
  risk_score int default 0
);

create table if not exists training_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references training_users(id),
  event_type text,
  ts timestamptz default now()
);

create index if not exists origins_tenant_id_idx on origins(tenant_id);
create index if not exists events_origin_id_idx on events(origin_id);
create index if not exists findings_origin_id_idx on findings(origin_id);
create index if not exists findings_event_id_idx on findings(event_id);
create index if not exists findings_ai_summary_null_idx on findings(created_at) where ai_summary is null;
create index if not exists incidents_finding_id_idx on incidents(finding_id);
create index if not exists policies_origin_id_idx on policies(origin_id);
create index if not exists training_events_user_id_idx on training_events(user_id);
create index if not exists training_events_clicked_idx on training_events(user_id, ts desc) where event_type = 'phishing_clicked';

alter table tenants enable row level security;
alter table origins enable row level security;
alter table events enable row level security;
alter table findings enable row level security;
alter table incidents enable row level security;
alter table policies enable row level security;
alter table audit_log enable row level security;
alter table training_users enable row level security;
alter table training_events enable row level security;

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['events', 'findings', 'incidents'] loop
      begin
        execute format('alter publication supabase_realtime add table %I', t);
      exception when duplicate_object then null;
      end;
    end loop;
  end if;
end $$;
